const PROOF_DELTA_CLASSES = ['added', 'changed', 'gainedSupport', 'contradicted', 'preserved', 'removed'];

const id = value => String(value?._id || value?.id || value || '').trim();
const text = value => String(value || '').trim();
const list = value => (Array.isArray(value) ? value : []);
const sameId = (left, right) => Boolean(id(left) && id(left) === id(right));

const providerKind = (event = {}) => {
  const haystack = [event.provider, event.metadata?.source, event.title, event.url]
    .map(value => text(value).toLowerCase())
    .join(' ');
  if (/\b(sec|edgar)\b|sec\.gov/.test(haystack)) return 'filing';
  if (/transcript|financialmodelingprep|\bfmp\b/.test(haystack)) return 'transcript';
  return '';
};

const eventIsSubstantive = (event = {}, kind = providerKind(event)) => {
  if (event.status !== 'processed') return false;
  const body = text(event.text || event.summary);
  if (body.length < 80) return false;
  if (kind === 'filing') return /sec\.gov/i.test(text(event.url)) || /\b(10-[qk]|8-k)\b/i.test(`${event.title} ${event.externalId}`);
  if (kind === 'transcript') return Boolean(text(event.provider || event.metadata?.source));
  return false;
};

const comparisonForRevision = (revision = {}) => (
  revision.comparison
  || revision.metadata?.comparison
  || revision.quality?.comparison
  || null
);

const publicCurrentThroughMatches = ({ acceptedEvent = {}, registryItem = {}, publicPage = {} } = {}) => {
  const candidates = [registryItem?.maintenanceProof?.currentThrough, publicPage?.maintenanceProof?.currentThrough].filter(Boolean);
  return candidates.some(current => (
    (text(acceptedEvent.url) && text(current.ref) === text(acceptedEvent.url))
    || (text(acceptedEvent.title) && text(current.label) === text(acceptedEvent.title))
  ));
};

const hasAllDeltaClasses = (comparison = {}) => {
  const deltas = comparison.claimDeltas || comparison.deltas || comparison.counts || {};
  return PROOF_DELTA_CLASSES.every(key => (
    Object.prototype.hasOwnProperty.call(deltas, key)
    || Object.prototype.hasOwnProperty.call(deltas, `claims${key.charAt(0).toUpperCase()}${key.slice(1)}`)
  ));
};

const publicDenylistLeaks = payload => {
  const serialized = JSON.stringify(payload || {}).toLowerCase();
  return [
    'userid', 'externalwatches', 'pendingsourceeventids', 'backlinks',
    'privatehighlights', 'agentstate', 'maintenancerunid'
  ].filter(field => serialized.includes(`\"${field.toLowerCase()}\"`));
};

const evaluateAlphabetProof = ({ page = {}, events = [], revisions = [], briefing = {}, registryItem = null, publicPage = null } = {}) => {
  const pageId = id(page);
  const pageEvents = list(events).filter(event => list(event.affectedPageIds).some(value => sameId(value, pageId)));
  const filingEvents = pageEvents.filter(event => providerKind(event) === 'filing');
  const transcriptEvents = pageEvents.filter(event => providerKind(event) === 'transcript');
  const acceptedEventId = id(page.freshness?.acceptedThrough?.sourceEventId);
  const acceptedEvent = pageEvents.find(event => sameId(event, acceptedEventId));
  const acceptedRevision = list(revisions).find(revision => (
    sameId(revision.sourceEventId, acceptedEventId)
    && revision.promotionStatus === 'promoted'
    && ['agent_maintenance', 'source_event'].includes(revision.reason)
  ));
  const receipts = list(briefing.recentReceipts);
  const receipt = receipts.find(item => (
    item.kind === 'wiki_maintenance'
    && list(item.touched).some(touched => sameId(touched.id, pageId))
  ));
  const morningPaperMentionsPage = Boolean(
    receipt
    || list(briefing.pagesWithNewSourceMaterial).some(item => sameId(item.id || item.pageId, pageId))
    || list(briefing.recentMaintenanceChanges).some(item => sameId(item.id || item.pageId, pageId))
  );
  const watches = page.externalWatches || {};
  const comparison = comparisonForRevision(acceptedRevision) || (receipt ? { counts: receipt.metrics || {} } : null);
  const leaks = publicDenylistLeaks({ registryItem, publicPage });
  const checks = {
    alphabetPageResolved: Boolean(pageId && /alphabet/i.test(text(page.title))),
    filingWatchActive: watches.edgar?.status === 'active',
    processedSubstantiveFiling: filingEvents.some(event => eventIsSubstantive(event, 'filing')),
    acceptedThroughSourceEvent: Boolean(acceptedEventId && acceptedEvent && eventIsSubstantive(acceptedEvent)),
    promotedRevisionForAcceptedEvent: Boolean(acceptedRevision),
    completeClaimDeltaTaxonomy: Boolean(comparison && hasAllDeltaClasses(comparison)),
    morningPaperReturnLoop: morningPaperMentionsPage,
    publicRegistryResolved: Boolean(registryItem),
    publicPageResolved: Boolean(publicPage),
    publicProofExplicitlyProven: registryItem?.proofGrade?.grade === 'proven'
      && registryItem?.proofGrade?.criteria?.explicitlyAccepted === true,
    publicSecClockAccepted: registryItem?.proofGrade?.criteria?.requiredClocks?.secEdgar === true,
    publicCurrentThroughMatchesAcceptedEvent: Boolean(acceptedEventId && publicCurrentThroughMatches({ acceptedEvent, registryItem, publicPage })),
    publicPayloadPrivacyDenylistClean: leaks.length === 0
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    verdict: failed.length ? 'not_accepted' : 'accepted',
    checks,
    failed,
    evidence: {
      pageId,
      acceptedEventId,
      acceptedRevisionId: id(acceptedRevision),
      maintenanceReceiptId: id(receipt),
      pageEventCount: pageEvents.length,
      filingEventCount: filingEvents.length,
      transcriptEventCount: transcriptEvents.length,
      publicGrade: registryItem?.proofGrade?.grade || '',
      publicDenylistLeaks: leaks
    }
  };
};

module.exports = {
  PROOF_DELTA_CLASSES,
  evaluateAlphabetProof,
  eventIsSubstantive,
  hasAllDeltaClasses,
  providerKind,
  publicDenylistLeaks
};
