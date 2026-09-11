#!/usr/bin/env node
/*
 * Freeze existing Edition shares into a public snapshot.
 *
 * Until this pass, a shared slug was a live pointer at the private issue, so
 * an agent rewrite changed what a stranger saw. Going forward the public
 * route reads only the snapshot. This script writes that snapshot for every
 * share that does not yet have one, using the editorial projection of the
 * issue as it stands now.
 *
 * The publication time recorded here is the migration time. No historical
 * original can be reconstructed from the live pointer.
 *
 * Dry-run is the default. `--apply` is required to write.
 *
 * Idempotent: a share that already has a snapshot and contentHash is left
 * alone, including if the private issue has moved on. Interruption is safe;
 * re-run to finish the rest.
 *
 * Rollback: this script cannot restore live-pointer behaviour by itself.
 * Unsetting snapshot/contentHash/publishedAt on rows whose publishedAt is at
 * or after the migration start would 404 those URLs on the snapshot reader.
 * To roll back a botched apply, revert the public-read code to the live
 * pointer and then unset those three fields. Do not leave a mixed reader
 * that falls back to live for missing snapshots — that is how a private
 * rewrite leaks after the cutover.
 *
 * Usage:
 *   node scripts/backfill_shared_edition_snapshots.js
 *   node scripts/backfill_shared_edition_snapshots.js --apply
 *   node scripts/backfill_shared_edition_snapshots.js --apply --user <id>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { hashPublicEdition, projectPublicEdition } = require('../server/services/editionShape');

const MISSING_SNAPSHOT = {
  $or: [
    { snapshot: { $exists: false } },
    { snapshot: null },
    { contentHash: { $in: [null, ''] } }
  ]
};

const loadProfilesFor = async (EditionProfile, userId) => {
  if (!EditionProfile) return null;
  const rows = await EditionProfile.find({ userId }).lean();
  if (!rows.length) return null;
  return Object.fromEntries(rows.map(row => [row.key, {
    key: row.key,
    titleLabel: row.title,
    issueLabel: row.issueLabel || 'Issue',
    cadence: row.cadence || 'weekly',
    sections: (row.sections || []).map(section => ({ key: section.key, label: section.label })),
    minItems: Number.isFinite(row.minItems) ? row.minItems : 1,
    maxItems: Number.isFinite(row.maxItems) ? row.maxItems : 15
  }]));
};

const ownerNameOf = async (User, userId, fallback = '') => {
  const held = String(fallback || '').trim();
  if (held || !User) return held;
  const owner = await User.findById(userId).select('name displayName').lean().catch(() => null);
  return String(owner?.displayName || owner?.name || '').trim();
};

const projectShare = async ({ share, Edition, EditionProfile, User } = {}) => {
  const edition = await Edition.findOne({ _id: share.editionId, userId: share.userId }).lean();
  if (!edition) {
    return { status: 'missing-edition', slug: share.slug, shareId: String(share._id) };
  }
  const profiles = await loadProfilesFor(EditionProfile, share.userId);
  const ownerDisplayName = await ownerNameOf(User, share.userId, share.ownerDisplayName);
  const snapshot = projectPublicEdition(edition, ownerDisplayName, { profiles });
  return {
    status: 'frozen',
    slug: share.slug,
    shareId: String(share._id),
    title: snapshot.title,
    itemCount: (snapshot.items || []).length,
    ownerDisplayName,
    snapshot,
    contentHash: hashPublicEdition(snapshot)
  };
};

const run = async ({
  SharedEdition,
  Edition,
  EditionProfile,
  User,
  apply = false,
  userId = '',
  now = new Date()
} = {}) => {
  const shares = await SharedEdition.find({
    ...MISSING_SNAPSHOT,
    ...(userId ? { userId } : {})
  }).lean();

  const report = [];
  for (const share of shares) {
    const projected = await projectShare({ share, Edition, EditionProfile, User });
    if (projected.status === 'frozen' && apply) {
      await SharedEdition.updateOne(
        { _id: share._id, ...MISSING_SNAPSHOT },
        {
          $set: {
            snapshot: projected.snapshot,
            contentHash: projected.contentHash,
            publishedAt: now,
            ownerDisplayName: projected.ownerDisplayName
          }
        }
      );
    }
    report.push(projected.status === 'frozen'
      ? {
        status: projected.status,
        slug: projected.slug,
        shareId: projected.shareId,
        title: projected.title,
        itemCount: projected.itemCount,
        contentHash: projected.contentHash
      }
      : projected);
  }

  const frozen = report.filter(row => row.status === 'frozen');
  return {
    mode: apply ? 'apply' : 'dry-run',
    migratedAt: now.toISOString(),
    scanned: shares.length,
    count: frozen.length,
    missingEdition: report.filter(row => row.status === 'missing-edition').length,
    sample: frozen.slice(0, 8),
    report
  };
};

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    const userIndex = process.argv.indexOf('--user');
    const userId = userIndex >= 0 ? String(process.argv[userIndex + 1] || '') : '';
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
    const { SharedEdition, Edition, EditionProfile, User } = require('../server/models');
    const result = await run({ SharedEdition, Edition, EditionProfile, User, apply, userId });
    console.log(JSON.stringify(result, null, 2));
  })()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(async () => { if (mongoose.connection.readyState) await mongoose.disconnect(); });
}

module.exports = { MISSING_SNAPSHOT, projectShare, run };
