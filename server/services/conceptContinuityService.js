const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');

const id = value => String(value?._id || value || '');
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const clean = (value = '', limit = 180) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, limit);
};
const awaitQuery = async query => {
  if (!query) return null;
  const lean = query.lean?.() || query;
  return lean;
};
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const visible = value => (
  value
  && value.archived !== true
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
);

class ConceptContinuityError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'ConceptContinuityError';
    this.status = status;
    this.code = code;
  }
}

const anchorQueryFor = ({ userId, wikiPageId }) => ({
  userId,
  'continuityAnchor.kind': 'wiki_investigation',
  'continuityAnchor.objectType': 'wiki_page',
  'continuityAnchor.objectId': wikiPageId
});

const hasClaim = (claims, claimId) => (
  !claimId
  || (Array.isArray(claims) && claims.some(claim => String(claim?.claimId || '') === String(claimId)))
);

const neutralConceptName = page => {
  const pageId = id(page);
  const pageTitle = clean(page?.title || 'Untitled Wiki page', 130);
  return `Investigation · ${pageTitle} · ${pageId.slice(-6)}`;
};

const conceptHref = ({ concept, page, revisionId = '', claimId = '' }) => {
  const params = new URLSearchParams({
    tab: 'concepts',
    concept: clean(concept.name, 180),
    conceptId: id(concept),
    investigation: '1',
    wikiPageId: id(page)
  });
  if (revisionId) params.set('revisionId', id(revisionId));
  if (claimId) params.set('claimId', String(claimId));
  return `/think?${params.toString()}`;
};

const safeConceptRef = ({ concept, page, revisionId, claimId }) => ({
  type: 'concept',
  id: id(concept),
  title: clean(concept.name, 180),
  href: conceptHref({ concept, page, revisionId, claimId })
});

const ensureWikiInvestigationConcept = async ({
  userId,
  wikiPageId,
  revisionId = '',
  claimId = '',
  models = {}
} = {}) => {
  if (!userId || !wikiPageId) {
    throw new ConceptContinuityError('userId and wikiPageId are required.');
  }
  const { TagMeta, WikiPage, WikiRevision } = models;
  if (!TagMeta?.findOne || !TagMeta?.findOneAndUpdate || !WikiPage?.findOne) {
    throw new ConceptContinuityError('Concept continuity models are unavailable.', 503, 'unavailable');
  }

  const page = plain(await awaitQuery(WikiPage.findOne({
    _id: wikiPageId,
    userId,
    status: { $ne: 'archived' },
    archived: { $ne: true },
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true }
  })));
  if (!page || !visible(page) || !isWikiPageSurfaceEligible(page)) {
    throw new ConceptContinuityError('Wiki page not found.', 404, 'not_found');
  }

  let revision = null;
  if (revisionId) {
    if (!WikiRevision?.findOne) {
      throw new ConceptContinuityError('Revision model is unavailable.', 503, 'unavailable');
    }
    revision = plain(await awaitQuery(WikiRevision.findOne({
      _id: revisionId,
      pageId: wikiPageId,
      userId
    })));
    if (!revision) {
      throw new ConceptContinuityError('Wiki revision not found.', 404, 'not_found');
    }
  }
  const claims = revision?.after?.claims || page.claims;
  if (!hasClaim(claims, claimId)) {
    throw new ConceptContinuityError('Wiki claim not found in this revision.', 404, 'not_found');
  }

  const legacyConceptId = page.createdFrom?.type === 'concept'
    ? id(page.createdFrom.objectId)
    : '';
  const anchorQuery = anchorQueryFor({ userId, wikiPageId });
  const [legacyRaw, anchoredRaw] = await Promise.all([
    legacyConceptId ? awaitQuery(TagMeta.findOne({ _id: legacyConceptId, userId })) : null,
    awaitQuery(TagMeta.findOne(anchorQuery))
  ]);
  const legacy = plain(legacyRaw);
  const anchored = plain(anchoredRaw);

  if (legacyConceptId && (!legacy || !visible(legacy))) {
    throw new ConceptContinuityError(
      'Wiki page has a broken Concept origin link.',
      409,
      'continuity_conflict'
    );
  }
  if (anchored && !visible(anchored)) {
    throw new ConceptContinuityError(
      'Wiki page has an unavailable investigation Concept.',
      409,
      'continuity_conflict'
    );
  }
  if (legacy && anchored && id(legacy) !== id(anchored)) {
    throw new ConceptContinuityError(
      'Wiki page points to conflicting Concepts.',
      409,
      'continuity_conflict'
    );
  }

  const existing = legacy || anchored;
  if (existing) {
    return {
      concept: safeConceptRef({ concept: existing, page, revisionId, claimId }),
      created: false,
      continuity: { kind: 'wiki_investigation', wikiPageId: id(page) }
    };
  }

  const name = neutralConceptName(page);
  const nameCollision = plain(await awaitQuery(TagMeta.findOne({ userId, name })));
  if (nameCollision) {
    if (
      nameCollision.continuityAnchor?.kind === 'wiki_investigation'
      && nameCollision.continuityAnchor?.objectType === 'wiki_page'
      && id(nameCollision.continuityAnchor?.objectId) === id(page)
      && visible(nameCollision)
    ) {
      return {
        concept: safeConceptRef({ concept: nameCollision, page, revisionId, claimId }),
        created: false,
        continuity: { kind: 'wiki_investigation', wikiPageId: id(page) }
      };
    }
    throw new ConceptContinuityError(
      'A different Concept already uses the investigation title.',
      409,
      'name_conflict'
    );
  }

  let result;
  try {
    result = await TagMeta.findOneAndUpdate(
      anchorQuery,
      {
        $setOnInsert: {
          name,
          description: '',
          isPublic: false,
          hiddenFromHome: false,
          debugOnly: false,
          archived: false,
          'continuityAnchor.linkedAt': new Date(),
          'continuityAnchor.linkedBy': 'user'
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        includeResultMetadata: true
      }
    );
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    let winner = null;
    for (const delay of [0, 10, 25, 50, 100]) {
      if (delay) await wait(delay);
      winner = plain(await awaitQuery(TagMeta.findOne(anchorQuery)));
      if (winner) break;
    }
    if (!winner) {
      throw new ConceptContinuityError(
        'A different Concept already uses the investigation title.',
        409,
        'name_conflict'
      );
    }
    result = { value: winner, lastErrorObject: { updatedExisting: true } };
  }

  const concept = plain(result?.value || result);
  if (!concept || !visible(concept)) {
    throw new ConceptContinuityError('Failed to resolve investigation Concept.', 503, 'unavailable');
  }
  return {
    concept: safeConceptRef({ concept, page, revisionId, claimId }),
    created: result?.lastErrorObject?.updatedExisting === false || Boolean(result?.lastErrorObject?.upserted),
    continuity: { kind: 'wiki_investigation', wikiPageId: id(page) }
  };
};

module.exports = {
  ConceptContinuityError,
  ensureWikiInvestigationConcept,
  anchorQueryFor,
  neutralConceptName,
  __testables: { hasClaim, conceptHref, visible }
};
