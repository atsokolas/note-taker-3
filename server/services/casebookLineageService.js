/**
 * Follow, fork, and adopt are three different hands on the same paper.
 *
 * Follow watches without copying. Fork branches the public claim and keeps
 * the origin frozen. Adopt copies the editorial page as a working original.
 * Revoking a share cannot rewrite a hash that was already taken.
 */

const { serializePublicCasebook, digest } = require('./judgmentPublicProjection');

class CasebookLineageError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'CasebookLineageError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const originSnapshot = (page, hash) => ({
  originPageId: id(page),
  originSlug: clean(page.slug, 180),
  originTitle: clean(page.title, 240) || clean(page?.judgment?.currentJudgment, 240),
  originHash: clean(hash, 128),
  originClaim: clean(page?.judgment?.currentJudgment, 8000)
});

const folioHash = (page) => {
  const folio = serializePublicCasebook({ page });
  return folio ? digest(folio) : '';
};

const requireSharedOrigin = (page) => {
  if (!page || String(page.visibility || '') !== 'shared' || String(page.status || '') === 'archived') {
    throw new CasebookLineageError('This case is not publicly sealed.', 404, 'not_found');
  }
  if (!clean(page?.judgment?.currentJudgment, 8000)) {
    throw new CasebookLineageError('There is no public claim to take.', 422, 'no_claim');
  }
};

const resolveQuery = async (query) => {
  if (!query) return null;
  let next = query;
  if (typeof next.then === 'function') return next;
  if (typeof next.lean === 'function') return next.lean();
  return next;
};

const findActiveFollow = async ({ CasebookLineage, userId, originPageId }) => {
  if (!CasebookLineage?.findOne) return null;
  return resolveQuery(CasebookLineage.findOne({
    userId,
    originPageId,
    action: 'follow',
    revokedAt: null
  }));
};

const followCasebook = async ({ CasebookLineage, userId, originPage, now = () => new Date() }) => {
  if (!CasebookLineage) throw new CasebookLineageError('Lineage is unavailable.', 503, 'unavailable');
  requireSharedOrigin(originPage);
  const existing = await findActiveFollow({ CasebookLineage, userId, originPageId: id(originPage) });
  if (existing) return { idempotent: true, lineage: plain(existing) };
  const hash = folioHash(originPage);
  const lineage = await CasebookLineage.create({
    userId,
    action: 'follow',
    ...originSnapshot(originPage, hash),
    createdAt: now()
  });
  return { idempotent: false, lineage: plain(lineage) };
};

const unfollowCasebook = async ({ CasebookLineage, userId, originPageId, now = () => new Date() }) => {
  if (!CasebookLineage) throw new CasebookLineageError('Lineage is unavailable.', 503, 'unavailable');
  const existing = await findActiveFollow({ CasebookLineage, userId, originPageId });
  if (!existing) throw new CasebookLineageError('You are not following this case.', 404, 'not_found');
  existing.revokedAt = now();
  existing.revokedReceiptId = `follow-revoked:${id(existing)}`;
  if (typeof existing.save === 'function') await existing.save();
  return { lineage: plain(existing) };
};

const publicBranches = async ({ CasebookLineage, WikiPage, originPageId }) => {
  if (!CasebookLineage?.find) return [];
  const rows = await resolveQuery(CasebookLineage.find({
    originPageId,
    action: { $in: ['fork', 'adopt'] }
  }));
  const listed = Array.isArray(rows) ? rows : [];
  const childIds = listed.map((row) => id(row.childPageId)).filter(Boolean);
  if (!childIds.length || !WikiPage?.find) {
    return listed.map((row) => ({
      title: clean(row.originTitle, 240),
      slug: '',
      action: row.action,
      at: iso(row.createdAt),
      diverged: false
    })).filter((row) => row.title);
  }
  let childQuery = WikiPage.find({
    _id: { $in: childIds },
    visibility: 'shared',
    status: { $ne: 'archived' }
  });
  if (childQuery?.select) childQuery = childQuery.select('title slug visibility judgment.currentJudgment adoptedFrom');
  const children = await resolveQuery(childQuery);
  const byId = new Map((Array.isArray(children) ? children : []).map((page) => [id(page), page]));
  return listed.map((row) => {
    const child = byId.get(id(row.childPageId));
    if (!child) return null;
    const claim = clean(child?.judgment?.currentJudgment, 8000);
    return {
      title: clean(child.title, 240) || claim,
      slug: clean(child.slug, 180),
      action: row.action,
      at: iso(row.createdAt),
      diverged: Boolean(clean(row.originClaim, 8000) && claim && claim !== clean(row.originClaim, 8000))
    };
  }).filter(Boolean);
};

const publicOrigin = async ({ CasebookLineage, WikiPage, page }) => {
  if (!CasebookLineage?.findOne) return null;
  const row = await resolveQuery(CasebookLineage.findOne({
    childPageId: id(page),
    action: { $in: ['fork', 'adopt'] }
  }));
  const adopted = plain(page?.adoptedFrom) || {};
  const originId = id(row?.originPageId || adopted.originPageId);
  if (!originId && !clean(row?.originTitle || adopted.originTitle)) return null;
  let live = null;
  if (originId && WikiPage?.findOne) {
    let liveQuery = WikiPage.findOne({ _id: originId });
    if (liveQuery?.select) liveQuery = liveQuery.select('title slug visibility status');
    live = await resolveQuery(liveQuery);
  }
  const liveShared = live && String(live.visibility || '') === 'shared' && String(live.status || '') !== 'archived';
  return {
    title: clean(row?.originTitle || adopted.originTitle || live?.title, 240),
    slug: liveShared ? clean(live.slug || row?.originSlug || adopted.originSlug, 180) : clean(row?.originSlug || adopted.originSlug, 180),
    hash: clean(row?.originHash || adopted.originHash, 128),
    revoked: !liveShared,
    action: row?.action || adopted.kind || 'adopt'
  };
};

const publicLineageTree = async ({ CasebookLineage, WikiPage, page }) => ({
  origin: await publicOrigin({ CasebookLineage, WikiPage, page }),
  branches: await publicBranches({ CasebookLineage, WikiPage, originPageId: id(page) })
});

module.exports = {
  CasebookLineageError,
  followCasebook,
  folioHash,
  originSnapshot,
  publicLineageTree,
  unfollowCasebook
};
