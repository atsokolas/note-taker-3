const crypto = require('crypto');

const clonePlain = (value) => JSON.parse(JSON.stringify(value ?? null));

const canonicalize = (value) => {
  const plain = clonePlain(value);
  if (Array.isArray(plain)) return plain.map(canonicalize);
  if (!plain || typeof plain !== 'object') return plain;
  return Object.keys(plain).sort().reduce((result, key) => {
    result[key] = canonicalize(plain[key]);
    return result;
  }, {});
};

const contentProjection = (snapshot = {}) => ({
  title: snapshot?.title || '',
  body: snapshot?.body || null,
  plainText: snapshot?.plainText || '',
  sourceRefs: snapshot?.sourceRefs || [],
  claims: snapshot?.claims || [],
  citations: snapshot?.citations || [],
  judgment: snapshot?.judgment || null,
  investmentDossier: snapshot?.investmentDossier || null
});

const snapshotContentHash = (snapshot = {}) => crypto
  .createHash('sha256')
  .update(JSON.stringify(contentProjection(snapshot)))
  .digest('hex');

const snapshotCanonicalContentHash = (snapshot = {}) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(contentProjection(snapshot))))
  .digest('hex');

/* What the content hash deliberately ignores, because a maintenance pass writes
   it every time whether or not anything happened: when the pass ran, what it
   thought of itself, which events are pending. Bookkeeping is the reason two
   thirds of the cluster was revisions.

   Everything else it ignores is not bookkeeping at all — a page becoming
   published, changing hands, being renamed — and a revision that records one of
   those keeps its payload even when the prose is untouched. */
const IDENTITY_FIELDS = Object.freeze([
  'status', 'visibility', 'slug', 'pageType', 'sourceScope', 'adoptedFrom', 'publicProof'
]);

const sameIdentity = (before = {}, after = {}) => IDENTITY_FIELDS.every(field => (
  JSON.stringify(canonicalize(before?.[field] ?? null)) === JSON.stringify(canonicalize(after?.[field] ?? null))
));

/**
 * True when a pass moved nothing a reader or an auditor would call a change:
 * same content, same standing, same name. Only the pass's own notes about
 * itself differ, and those are not worth a second copy of the page.
 */
const isBookkeepingOnlyRevision = (before, after) => Boolean(before) && Boolean(after)
  && snapshotCanonicalContentHash(before) === snapshotCanonicalContentHash(after)
  && sameIdentity(before, after);

const matchesTrustedRevisionHead = ({ current, revision } = {}) => {
  const recordedHash = String(revision?.sourceVersion?.trustedHeadHash || '');
  if (!recordedHash) return false;
  /* A revision that changed nothing kept no payload, but it kept the canonical
     hash of the content it stood for, which is the whole question here. Only
     the canonical form can be checked that way; a head recorded under the other
     hash stays unverifiable, exactly as an absent payload always was. */
  if (!revision?.before) {
    if (!revision?.snapshotUnchanged || !revision.contentHash) return false;
    return recordedHash === revision.contentHash
      && snapshotCanonicalContentHash(current) === revision.contentHash;
  }
  const recordedSnapshotHashes = new Set([
    snapshotContentHash(revision.before),
    snapshotCanonicalContentHash(revision.before)
  ]);
  return recordedSnapshotHashes.has(recordedHash)
    && snapshotCanonicalContentHash(current) === snapshotCanonicalContentHash(revision.before);
};

const snapshotPage = (page) => {
  if (!page) return null;
  const raw = typeof page.toObject === 'function' ? page.toObject({ virtuals: false }) : { ...page };
  return {
    _id: raw._id,
    title: raw.title,
    slug: raw.slug,
    pageType: raw.pageType,
    status: raw.status,
    visibility: raw.visibility,
    sourceScope: raw.sourceScope,
    adoptedFrom: raw.adoptedFrom || {},
    body: raw.body || null,
    plainText: raw.plainText || '',
    sourceRefs: Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [],
    claims: Array.isArray(raw.claims) ? raw.claims : [],
    citations: Array.isArray(raw.citations) ? raw.citations : [],
    judgment: raw.judgment || null,
    investmentDossier: raw.investmentDossier || null,
    freshness: raw.freshness || {},
    publicProof: raw.publicProof || {},
    aiState: raw.aiState || {}
  };
};

/**
 * The content a revision stands for, which is not always the content it stores.
 *
 * A revision that changed nothing keeps no payload; its content is the content
 * of the newest earlier revision on the same page that does keep one. Reading
 * that chain is exact, not approximate — "unchanged" is a claim about equality,
 * and the hash it was written with is there to check.
 *
 * A revision whose payload retention removed is a different thing entirely: the
 * content is gone and this returns null for it, because guessing would be worse
 * than saying so.
 */
const resolveRevisionSnapshot = (revision, revisions = [], field = 'after') => {
  const own = revision?.[field];
  if (own) return own;
  if (!revision?.snapshotUnchanged) return null;
  const at = new Date(revision.createdAt || 0).getTime();
  const earlier = (Array.isArray(revisions) ? revisions : [])
    .filter(row => row
      && String(row.pageId || '') === String(revision.pageId || '')
      && new Date(row.createdAt || 0).getTime() <= at
      && String(row._id || '') !== String(revision._id || ''))
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  for (const row of earlier) {
    const candidate = row.after || row.before;
    if (candidate) {
      /* Only if it really is the same content. A hash that does not match means
         the chain has been broken by something this function cannot see. */
      if (!revision.contentHash || snapshotCanonicalContentHash(candidate) === revision.contentHash) {
        return candidate;
      }
      return null;
    }
  }
  return null;
};

const restorePageSnapshot = (page, snapshot = {}) => {
  if (!page || !snapshot) return page;
  const initialRevisionId = page.judgment?.initialRevisionId || null;
  [
    'title',
    'slug',
    'pageType',
    'status',
    'visibility',
    'sourceScope',
    'adoptedFrom',
    'body',
    'plainText',
    'sourceRefs',
    'claims',
    'citations',
    'judgment',
    'investmentDossier',
    'freshness',
    'publicProof',
    'aiState'
  ].forEach((field) => {
    if (snapshot[field] === undefined) return;
    page[field] = clonePlain(snapshot[field]);
    if (typeof page.markModified === 'function') page.markModified(field);
  });
  if (initialRevisionId && page.judgment) {
    page.judgment.initialRevisionId = initialRevisionId;
    if (typeof page.markModified === 'function') page.markModified('judgment');
  }
  return page;
};

const createWikiRevision = async ({
  WikiRevision,
  revisionId = null,
  userId,
  page,
  pageId,
  before = null,
  after = null,
  reason = 'user_edit',
  actorType = 'user',
  sourceEventId = null,
  maintenanceRunId = null,
  promotionStatus = 'promoted',
  sourceVersion = null,
  quality = null,
  claimReview = null,
  summary = '',
  pruneRevisionHistory,
  session = null
} = {}) => {
  if (!WikiRevision || !userId || (!page && !pageId)) return null;
  const resolvedPageId = pageId || page?._id;
  const afterSnapshot = after || snapshotPage(page);
  /* Most maintenance passes change nothing. Storing the page twice to say so is
     how the wiki's revisions became two thirds of the cluster — the repo page
     alone put on 74MB in three days, its five latest revisions byte-identical.
     The hash that proves they are identical was already here; it was only ever
     used after the fact. */
  const unchanged = isBookkeepingOnlyRevision(before, afterSnapshot);
  const revision = new WikiRevision({
    ...(revisionId ? { _id: revisionId } : {}),
    userId,
    pageId: resolvedPageId,
    before: unchanged ? null : before,
    after: unchanged ? null : afterSnapshot,
    ...(unchanged ? {
      snapshotUnchanged: true,
      contentHash: snapshotCanonicalContentHash(afterSnapshot)
    } : {}),
    reason,
    actorType,
    sourceEventId,
    maintenanceRunId,
    promotionStatus,
    sourceVersion,
    quality,
    claimReview,
    summary
  });
  await revision.save(session ? { session } : undefined);
  try {
    if (!session && (pruneRevisionHistory || typeof WikiRevision.countDocuments === 'function')) {
      const prune = pruneRevisionHistory
        || require('./wikiRevisionRetentionService').pruneWikiRevisionHistory;
      await prune({ WikiRevision, userId, pageId: resolvedPageId, page });
    }
  } catch (error) {
    console.warn('[wiki-revision-retention] Prune failed; revision was preserved.', error?.message || error);
  }
  return revision;
};

module.exports = {
  createWikiRevision,
  isBookkeepingOnlyRevision,
  resolveRevisionSnapshot,
  restorePageSnapshot,
  matchesTrustedRevisionHead,
  snapshotCanonicalContentHash,
  snapshotContentHash,
  snapshotPage
};
