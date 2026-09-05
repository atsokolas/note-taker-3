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
  isLibrary: false
});

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

export const bindClaimSource = ({
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

  if (!attached.length) {
    return indexes.length ? unavailableSource() : null;
  }

  const source = attached[0];
  const citation = notes.find((item) => citationMatchesSource(item, source));
  const passage = cleanSourceTextForDisplay(citation?.quote || source.snippet || source.excerpt || '');
  const doors = resolveSourceDoors(source);
  const around = surrounding(source);

  return {
    title: String(source.title || '').trim() || 'Untitled source',
    passage,
    aroundBefore: around.aroundBefore,
    aroundAfter: around.aroundAfter,
    qualification: qualifyBoundSource(source, passage, doors),
    available: true,
    stale: false,
    href: doors.ownedHref,
    originalHref: doors.originalHref,
    isLibrary: doors.isLibrary
  };
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

export const liveExplorationForClaim = ({
  claimMark,
  ledgerClaim,
  citations = [],
  sourceRefs = []
} = {}) => createExploration({
  id: String(claimMark?.claimId || ledgerClaim?.claimId || '').trim(),
  originalText: String(claimMark?.text || ledgerClaim?.text || ''),
  source: bindClaimSource({ claimMark, ledgerClaim, citations, sourceRefs })
});
