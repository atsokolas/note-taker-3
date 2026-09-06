import { resolveSourceDoors } from '../../../utils/sourceRoutes';
import { cleanSourceTextForDisplay } from '../../../utils/sourceDisplayText';
import { createExploration } from './openSentenceModel';

const asId = (value) => String(value?._id || value?.id || value || '').trim();

const idsMatch = (left, right) => {
  const a = asId(left);
  const b = asId(right);
  return Boolean(a) && a === b;
};

const citationIndexes = (mark = {}) => (
  [...(mark.citationIndexes || []), ...(mark.contradictionIndexes || [])]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 1)
);

const citationMatchesSource = (citation = {}, source = {}) => {
  const sourceId = asId(source);
  return [
    citation.sourceRefId,
    citation.sourceId,
    citation.sourceObjectId,
    citation.sourceRef?._id,
    citation.sourceRef?.id
  ].some((id) => idsMatch(id, sourceId));
};

const ledgerMatchesSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = asId(source);
  if ((claim.sourceRefIds || []).some((id) => idsMatch(id, sourceId))) return true;
  const cited = (claim.citationIds || [])
    .map((id) => (citations || []).find((citation) => idsMatch(citation._id || citation.id, id)))
    .filter(Boolean);
  return cited.some((citation) => citationMatchesSource(citation, source));
};

const surrounding = (source = {}) => {
  const meta = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  return {
    aroundBefore: cleanSourceTextForDisplay(meta.aroundBefore || meta.before || source.aroundBefore || ''),
    aroundAfter: cleanSourceTextForDisplay(meta.aroundAfter || meta.after || source.aroundAfter || '')
  };
};

const qualifyBoundSource = (source, passage, doors) => {
  if (!passage) return 'The exact passage was not saved with this citation.';
  if (source.type === 'highlight' && doors.isLibrary) {
    return 'Saved passage · the import date is not a reading date';
  }
  return String(source.citationLabel || '').trim();
};

const libraryIdsFromHref = (href = '') => {
  const query = String(href || '').split('?')[1] || '';
  const params = new URLSearchParams(query);
  return {
    articleId: String(params.get('articleId') || '').trim(),
    highlightId: String(params.get('highlightId') || '').trim()
  };
};

const unavailableSource = (title = 'This source') => ({
  title: title || 'This source',
  passage: '',
  aroundBefore: '',
  aroundAfter: '',
  qualification: '',
  available: false,
  stale: true,
  href: '',
  originalHref: '',
  isLibrary: false,
  here: false,
  articleId: '',
  highlightId: ''
});

const isRecordedWork = (source) => source?.type === 'question' || source?.type === 'notebook';

const sourceIdentity = (source) => {
  const objectId = String(source?.objectId || '').trim();
  if (objectId) return `${source?.type || ''}:${objectId}`;
  return asId(source);
};

const attachedSourceRefs = ({
  claimMark,
  ledgerClaim,
  citations = [],
  sourceRefs = []
} = {}) => {
  const refs = Array.isArray(sourceRefs) ? sourceRefs : [];
  const notes = Array.isArray(citations) ? citations : [];
  const indexes = citationIndexes(claimMark);
  let attached = [];
  if (ledgerClaim) {
    attached = refs.filter((source) => ledgerMatchesSource({
      claim: ledgerClaim,
      source,
      citations: notes
    }));
  }
  if (!attached.length && indexes.length) {
    attached = indexes
      .map((index) => refs[index - 1])
      .filter(Boolean);
  }
  if (!attached.length && notes.length && ledgerClaim?.citationIds?.length) {
    attached = refs.filter((source) => notes
      .filter((citation) => (ledgerClaim.citationIds || []).some((id) => idsMatch(id, citation)))
      .some((citation) => citationMatchesSource(citation, source)));
  }
  return { attached, indexes, notes };
};

const bindPassage = (source, notes = []) => {
  if (!source) return null;
  const citation = notes.find((item) => citationMatchesSource(item, source));
  const citedPassage = cleanSourceTextForDisplay(citation?.quote || '');
  const currentPassage = cleanSourceTextForDisplay(source.snippet || source.excerpt || '');
  const passage = citedPassage || currentPassage;
  const doors = resolveSourceDoors(source);
  const around = surrounding(source);
  const libraryIds = libraryIdsFromHref(doors.ownedHref);
  return {
    title: String(source.title || '').trim() || 'Untitled source',
    passage,
    aroundBefore: around.aroundBefore,
    aroundAfter: around.aroundAfter,
    qualification: qualifyBoundSource(source, passage, doors),
    available: true,
    stale: Boolean(citedPassage && currentPassage && citedPassage !== currentPassage),
    href: doors.ownedHref,
    originalHref: doors.originalHref,
    isLibrary: doors.isLibrary,
    here: false,
    articleId: libraryIds.articleId,
    highlightId: libraryIds.highlightId
  };
};

const attachedPassages = (args) => {
  const { attached, indexes, notes } = attachedSourceRefs(args);
  return {
    attached,
    passages: attached.filter((source) => !isRecordedWork(source)),
    indexes,
    notes
  };
};

export const bindClaimSource = (args = {}) => {
  const { attached, passages, indexes, notes } = attachedPassages(args);
  if (!passages.length) {
    return indexes.length && !attached.length ? unavailableSource() : null;
  }
  return bindPassage(passages[0], notes);
};

export const bindClaimOther = (args = {}) => {
  const { passages, notes } = attachedPassages(args);
  if (passages.length < 2) return null;
  const first = passages[0];
  const firstKey = sourceIdentity(first);
  const other = passages.find((item, index) => (
    index > 0 && sourceIdentity(item) && sourceIdentity(item) !== firstKey
  ));
  if (!other) return null;
  const bound = bindPassage(other, notes);
  if (!bound?.available || !String(bound.passage || '').trim()) return null;
  const primary = bindPassage(first, notes);
  if (bound.passage === String(primary?.passage || '').trim()) return null;
  return bound;
};

export const draftStorageKey = (pageId, claimId) => (
  `noeis.open-sentence.${String(pageId || '').trim()}.${String(claimId || '').trim()}`
);

export const openedStorageKey = (pageId) => (
  `noeis.open-sentence.${String(pageId || '').trim()}.opened`
);

export const claimsInParagraph = (node) => {
  const found = [];
  const walk = (content = []) => {
    content.forEach((child) => {
      if (child?.type === 'text' && Array.isArray(child.marks)) {
        const mark = child.marks.find((item) => item?.type === 'claim');
        const claimId = String(mark?.attrs?.claimId || '').trim();
        if (claimId) {
          found.push({
            claimId,
            text: String(child.text || ''),
            citationIndexes: Array.isArray(mark.attrs?.citationIndexes) ? mark.attrs.citationIndexes : [],
            contradictionIndexes: Array.isArray(mark.attrs?.contradictionIndexes) ? mark.attrs.contradictionIndexes : []
          });
        }
      }
      if (Array.isArray(child?.content)) walk(child.content);
    });
  };
  walk(node?.content);
  return found;
};

export const claimIdFromSelection = (root, claims = []) => {
  const fallback = claims[0]?.claimId || '';
  if (!root || typeof window === 'undefined' || !window.getSelection) return fallback;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return fallback;
  const node = selection.anchorNode;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  if (!element || !root.contains(element)) return fallback;
  const claimNode = element.closest?.('[data-claim-id]');
  const claimId = claimNode && root.contains(claimNode)
    ? String(claimNode.getAttribute('data-claim-id') || '').trim()
    : '';
  return claims.some((claim) => claim.claimId === claimId) ? claimId : fallback;
};

export const claimTextOnPage = (doc, claimId) => {
  const target = String(claimId || '').trim();
  if (!target || !doc) return '';
  let found = '';
  const walk = (node) => {
    if (found || !node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;
    if (node.type === 'text' && Array.isArray(node.marks)) {
      const mark = node.marks.find((item) => item?.type === 'claim' && String(item.attrs?.claimId || '') === target);
      if (mark) found = String(node.text || '');
    }
    walk(node.content);
  };
  walk(doc);
  return found;
};

const earlierClaimTextFromRevisions = (revisions, claimId, now) => {
  const list = Array.isArray(revisions) ? revisions : [];
  for (const revision of list) {
    if (revision?.snapshotPrunedAt) continue;
    const before = revision?.before;
    if (!before) continue;
    const fromBody = String(claimTextOnPage(before.body, claimId) || '').trim();
    if (fromBody && fromBody !== now) return fromBody;
    const fromClaims = (Array.isArray(before.claims) ? before.claims : [])
      .find((claim) => idsMatch(claim?.claimId, claimId));
    const text = String(fromClaims?.text || '').trim();
    if (text && text !== now) return text;
  }
  return '';
};

const earlierClaimTextFromHistory = (history, now) => {
  const list = Array.isArray(history) ? history : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const text = String(list[index]?.text || '').trim();
    if (text && text !== now) return text;
  }
  return '';
};

export const recordedThen = ({ claimId, currentText, revisions, history } = {}) => {
  const now = String(currentText || '').trim();
  if (!claimId || !now) return null;
  const prior = earlierClaimTextFromRevisions(revisions, claimId, now)
    || earlierClaimTextFromHistory(history, now);
  return prior ? { text: prior } : null;
};

export const liveExplorationForClaim = ({
  claimMark,
  ledgerClaim,
  citations = [],
  sourceRefs = [],
  then = null
} = {}) => {
  const bound = { claimMark, ledgerClaim, citations, sourceRefs };
  return createExploration({
    id: String(claimMark?.claimId || ledgerClaim?.claimId || '').trim(),
    originalText: claimMark && 'text' in claimMark
      ? String(claimMark.text ?? '')
      : String(ledgerClaim?.text || ''),
    source: bindClaimSource(bound),
    other: bindClaimOther(bound),
    then
  });
};

export const liveExplorationForPageClaim = (page, claimMark = {}, extras = {}) => {
  const claimId = String(claimMark?.claimId || '').trim();
  const onPage = claimTextOnPage(page?.body, claimId);
  const text = onPage || String(claimMark?.text || '');
  const ledgerClaim = text
    ? (page?.claims || []).find((claim) => idsMatch(claim?.claimId, claimId))
    : null;
  return liveExplorationForClaim({
    claimMark: {
      ...claimMark,
      claimId,
      text
    },
    ledgerClaim,
    citations: text ? (page?.citations || []) : [],
    sourceRefs: text ? (page?.sourceRefs || []) : [],
    then: recordedThen({
      claimId,
      currentText: text,
      revisions: extras.revisions,
      history: ledgerClaim?.history
    })
  });
};
