#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const { WikiPage } = require('../server/models');
const {
  normalizeExistingWikiTitleForPresentation
} = require('../server/services/wikiPresentationGuard');

const parseLimit = (argv = []) => {
  const raw = argv.find(arg => arg.startsWith('--limit='))?.slice('--limit='.length);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5000;
};

const isSafeBackfillCandidate = (before = '', after = '') => {
  const raw = String(before || '').trim();
  if (!raw || raw === after) return false;
  if (/https?:\/\//i.test(raw) || /www\./i.test(raw) || /@[^\s]+\.[^\s]+/.test(raw)) return false;
  if (/[|]/.test(raw)) return false;

  const words = raw.split(/\s+/).filter(Boolean);
  if (/^(?:the|a|an)\s+[A-Z][\w'-]*(?:\s|$)/.test(raw)) return words.length <= 8;
  if (/^[a-z][a-z\s-]+$/.test(raw)) return words.length <= 5;

  return false;
};

const main = async () => {
  const apply = process.argv.includes('--apply') || process.env.APPLY === '1';
  const limit = parseLimit(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required.');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const pages = await WikiPage.find({ status: { $ne: 'archived' } })
    .select('_id userId title slug updatedAt')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const changes = pages
    .map(page => {
      const before = String(page.title || '').trim();
      const after = normalizeExistingWikiTitleForPresentation(before);
      if (!isSafeBackfillCandidate(before, after)) return null;
      return {
        id: String(page._id),
        slug: page.slug || '',
        before,
        after
      };
    })
    .filter(Boolean);

  if (apply && changes.length > 0) {
    await WikiPage.bulkWrite(changes.map(change => ({
      updateOne: {
        filter: { _id: change.id },
        update: { $set: { title: change.after } }
      }
    })));
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned: pages.length,
    changed: changes.length,
    sample: changes.slice(0, 20)
  }, null, 2));

  await mongoose.disconnect();
};

main().catch(async (error) => {
  try {
    await mongoose.disconnect();
  } catch (_disconnectError) {
    // ignore disconnect failures while surfacing the original error
  }
  console.error(error);
  process.exit(1);
});
