// Which fields of a wiki page each surface reads, so a list never pays for whole pages.
const { escapeRegExp } = require('./wikiPageShape');

// What a list of Wiki pages is allowed to cost.
//
// Measured on a 68-page corpus, a full page document averages 90KB, and asking
// for a hundred of them took 57 seconds to move 3.2MB. The same request in
// summary mode took 6.2 seconds and 300KB — the surfaces render titles, types,
// counts and a preview, and were paying for the entire ledger to do it.
//
// Two rules keep this honest as the list grows:
//
//   Identity, not content. A source's title, url, type and objectId are read by
//   the knowledge map, which filters pages by typing a source's name; together
//   they cost about 1KB per page. The snippet on that same array costs 6KB and
//   nothing in a list renders it. Ids alone still give every `.length` count the
//   surfaces ask for.
//
//   plainText, not body. The row preview falls back to plainText, so the
//   ProseMirror document can stay behind.
//
// Adding a field here is adding it to every list request on every surface.
const WIKI_JUDGMENT_FIELDS = Object.freeze([
  'judgment.kind', 'judgment.currentJudgment', 'judgment.governingQuestion',
  'judgment.status', 'judgment.startedAt', 'judgment.lastReviewedAt',
  'judgment.strongestCounterargument',
  'judgment.why.reasonId', 'judgment.why.text', 'judgment.why.sourceRefIds', 'judgment.why.sourceLabel',
  'judgment.why.acceptedFrom', 'judgment.why.createdAt',
  'judgment.against.reasonId', 'judgment.against.text', 'judgment.against.sourceRefIds', 'judgment.against.sourceLabel',
  'judgment.against.acceptedFrom', 'judgment.against.createdAt',
  'judgment.assumptions.assumptionId', 'judgment.assumptions.text',
  'judgment.assumptions.status', 'judgment.assumptions.sourceRefIds',
  'judgment.falsifiers.falsifierId', 'judgment.falsifiers.text', 'judgment.falsifiers.status',
  'judgment.decisions.decisionId', 'judgment.decisions.summary',
  'judgment.decisions.status', 'judgment.decisions.decidedAt', 'judgment.decisions.createdAt',
  'judgment.decisions.reviewAt', 'judgment.decisions.outcome.observedAt',
  'judgment.decisions.outcome.summary', 'judgment.decisions.outcome.lesson',
  'judgment.lessons.lessonId', 'judgment.lessons.text',
  'judgment.lessons.closedAs', 'judgment.lessons.at',
  'judgment.dependsOn.dependencyId', 'judgment.dependsOn.pageId',
  'judgment.dependsOn.note', 'judgment.dependsOn.proposedBy',
  'judgment.bornAt', 'judgment.resolutionCriteria',
  'judgment.resolutionHorizonAt', 'judgment.resolutionSetAt',
  'judgment.resolutionHistory', 'judgment.verdicts',
  'judgment.heldHistory', 'judgment.confidence', 'judgment.parkedAt'
]);

const WIKI_JUDGMENT_INDEX_FIELDS = Object.freeze([
  '_id', 'title', 'updatedAt', 'createdAt',
  'evergreen', 'evergreenAt',
  // A verdict binds named evidence before it writes. Carry only the source
  // identity card in the fast casebook projection so the picker is truthful
  // on first paint and does not flicker with detail hydration.
  'sourceRefs._id', 'sourceRefs.title', 'sourceRefs.citationLabel',
  'sourceRefs.provider', 'sourceRefs.url', 'sourceRefs.type', 'sourceRefs.objectId',
  ...WIKI_JUDGMENT_FIELDS
]);

/* Exactly what a row on the canon renders, and nothing else.
   A kept thing on the shelf is a title, the day it was kept, the belief if it
   holds one, and enough of its claims to know whether that belief was retired
   in a check-in. The summary projection carries none of the judgment, so a
   kept belief came back looking like an ordinary page and lost its claim; the
   judgment projection carries source refs the shelf never shows. A surface
   with its own needs gets its own projection rather than widening one that
   other surfaces are already paying for. */
const WIKI_CANON_FIELDS = Object.freeze([
  '_id', 'slug', 'title', 'evergreen', 'evergreenAt', 'createdAt', 'updatedAt',
  'judgment.currentJudgment', 'judgment.governingQuestion',
  'claims.claimId', 'claims.checkInStatus', 'claims.retiredAt'
]);

/* Collection search may read the current page: title and accepted body
   text. Candidate drafts, quality-review reasons, and private notes are a
   different object and must not become a way to find a page. */
const WIKI_COLLECTION_SEARCH_FIELDS = Object.freeze(['title', 'plainText']);

const wikiCollectionSearchClause = (q = '') => {
  const needle = String(q || '').trim();
  if (!needle) return null;
  const regex = new RegExp(escapeRegExp(needle), 'i');
  return {
    $or: WIKI_COLLECTION_SEARCH_FIELDS.map(field => ({ [field]: regex }))
  };
};

const WIKI_PAGE_SUMMARY_FIELDS = Object.freeze([
  '_id', 'slug', 'title', 'pageType', 'status', 'visibility', 'createdFrom',
  'plainText', 'freshness', 'publicProof', 'lastReviewedAt', 'hiddenFromHome',
  'evergreen', 'evergreenAt',
  // The Wiki shelf separates ordinary pages, repository wikis, and investment
  // dossiers. One scalar is enough to identify the dossier contract without
  // pulling its research, valuation, or evidence subtrees into every row.
  'investmentDossier.version',
  // Judgment indexes need the claim and human-owned lines, never the whole
  // casebook subtree. Share the same narrow contract with Judgment's dedicated
  // projection so the two paths cannot drift.
  ...WIKI_JUDGMENT_FIELDS,
  'externalWatches.githubRepo', 'externalWatches.edgar', 'externalWatches.transcripts',
  'sourceRefs._id', 'sourceRefs.title', 'sourceRefs.url',
  'sourceRefs.type', 'sourceRefs.objectId', 'sourceRefs.parentObjectId',
  'claims.claimId', 'citations.sourceRefId', 'citations.claimId',
  'aiState.draftStatus', 'aiState.candidateStatus', 'aiState.lastError', 'aiState.errorCode',
  'aiState.quality.ok', 'aiState.quality.status', 'aiState.quality.checkedAt',
  'aiState.lastDraftedAt', 'aiState.maintenanceSummary',
  'aiState.changeLog.type', 'aiState.changeLog.text', 'aiState.changeLog.title',
  'aiState.changeLog.createdAt',
  'adoptedFrom.originTitle', 'adoptedFrom.adoptedAt',
  'createdAt', 'updatedAt'
]);

const PUBLIC_WIKI_PAGE_SELECT = [
  '_id', 'userId', 'title', 'slug', 'pageType', 'status', 'visibility', 'createdFrom',
  'body', 'plainText',
  'sourceRefs._id', 'sourceRefs.type', 'sourceRefs.sourceType', 'sourceRefs.title',
  'sourceRefs.url', 'sourceRefs.snippet', 'sourceRefs.quote', 'sourceRefs.excerpt',
  'claims._id', 'claims.claimId', 'citations._id', 'citations.sourceRefId', 'citations.claimId',
  'freshness', 'externalWatches', 'publicProof', 'lastReviewedAt', 'adoptedFrom', 'casebookShare',
  'aiState.draftStatus', 'aiState.lastError', 'aiState.errorCode',
  'aiState.quality.ok', 'aiState.quality.status', 'aiState.quality.checkedAt',
  'aiState.lastDraftedAt', 'aiState.maintenanceSummary',
  'aiState.changeLog.type', 'aiState.changeLog.text', 'aiState.changeLog.title',
  'aiState.changeLog.createdAt',
  'judgment.currentJudgment', 'judgment.bornAt', 'judgment.startedAt', 'judgment.status',
  'judgment.verdicts', 'judgment.clocks', 'judgment.outcomes',
  'judgment.resolutionCriteria', 'judgment.resolutionHorizonAt', 'judgment.resolutionSetAt',
  'judgment.lastReviewedAt', 'judgment.heldHistory',
  'judgment.against.text', 'judgment.against.sourceLabel', 'judgment.against.acceptedFrom', 'judgment.against.createdAt',
  'createdAt', 'updatedAt'
].join(' ');

module.exports = {
  WIKI_JUDGMENT_INDEX_FIELDS,
  WIKI_CANON_FIELDS,
  WIKI_COLLECTION_SEARCH_FIELDS,
  wikiCollectionSearchClause,
  WIKI_PAGE_SUMMARY_FIELDS,
  PUBLIC_WIKI_PAGE_SELECT
};
