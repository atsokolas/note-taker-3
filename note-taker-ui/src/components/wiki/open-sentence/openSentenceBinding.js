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
  return { attached, indexes };
};

export const bindClaimSource = ({
  claimMark,
  ledgerClaim,
  citations = [],
  sourceRefs = []
} = {}) => {
  const { attached, indexes } = attachedSourceRefs({
    claimMark,
    ledgerClaim,
    citations,
    sourceRefs
  });

  const source = attached.find((item) => item?.type !== 'question' && item?.type !== 'notebook');
  if (!source) {
    return indexes.length && !attached.length ? unavailableSource() : null;
  }

  const notes = Array.isArray(citations) ? citations : [];
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

export const claimMarkOnPage = (doc, claimId) => {
  const target = String(claimId || '').trim();
  if (!target || !doc) return null;
  let found = null;
  const walk = (node) => {
    if (found || !node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;
    if (node.type === 'text' && Array.isArray(node.marks)) {
      const mark = node.marks.find((item) => item?.type === 'claim' && String(item.attrs?.claimId || '') === target);
      if (mark) {
        found = {
          claimId: target,
          text: String(node.text || ''),
          citationIndexes: Array.isArray(mark.attrs?.citationIndexes) ? mark.attrs.citationIndexes : [],
          contradictionIndexes: Array.isArray(mark.attrs?.contradictionIndexes) ? mark.attrs.contradictionIndexes : []
        };
      }
    }
    walk(node.content);
  };
  walk(doc);
  return found;
};

export const claimTextOnPage = (doc, claimId) => String(claimMarkOnPage(doc, claimId)?.text || '');

const earlierFromRevisions = (revisions, claimId, now) => {
  const list = Array.isArray(revisions) ? revisions : [];
  for (const revision of list) {
    if (revision?.snapshotPrunedAt) continue;
    const before = revision?.before;
    if (!before) continue;
    const mark = claimMarkOnPage(before.body, claimId);
    const fromClaims = (Array.isArray(before.claims) ? before.claims : [])
      .find((claim) => idsMatch(claim?.claimId, claimId));
    const text = String(mark?.text || fromClaims?.text || '').trim();
    if (text && text !== now) {
      return {
        text,
        before,
        mark: mark || { claimId, text }
      };
    }
  }
  return null;
};

const earlierClaimTextFromHistory = (history, now) => {
  const list = Array.isArray(history) ? history : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const text = String(list[index]?.text || '').trim();
    if (text && text !== now) return text;
  }
  return '';
};

const snapshotForClaim = (found, claimId) => {
  if (!found?.before) return null;
  const ledgerClaim = (Array.isArray(found.before.claims) ? found.before.claims : [])
    .find((claim) => idsMatch(claim?.claimId, claimId));
  return {
    claimMark: found.mark,
    ledgerClaim,
    citations: found.before.citations || [],
    sourceRefs: found.before.sourceRefs || []
  };
};

const quotationFromBefore = (found, claimId) => {
  const snapshot = snapshotForClaim(found, claimId);
  if (!snapshot) return null;
  const bound = bindClaimSource(snapshot);
  if (!bound || bound.available === false) return null;
  const passage = String(bound.passage || '').trim();
  if (!passage) return null;
  return {
    title: bound.title,
    passage,
    aroundBefore: bound.aroundBefore,
    aroundAfter: bound.aroundAfter
  };
};

const pickAttachedLine = (attached, type) => {
  const ref = (attached || []).find((item) => item?.type === type);
  return String(ref?.snippet || ref?.title || '').trim();
};

const workFromBefore = (found, claimId) => {
  const snapshot = snapshotForClaim(found, claimId);
  if (!snapshot) return {};
  const { attached } = attachedSourceRefs(snapshot);
  return {
    question: pickAttachedLine(attached, 'question'),
    draft: pickAttachedLine(attached, 'notebook')
  };
};

const thenDraftFromHistory = (history, thenText) => {
  const list = Array.isArray(history) ? history : [];
  const match = list.find((entry) => (
    String(entry?.text || '').trim() === thenText
    && entry?.actorType === 'user'
    && String(entry?.note || '').trim()
  ));
  return match ? String(match.note).trim() : '';
};

const asRecordedThen = ({ text, quotation, question, draft }) => {
  if (!text) return null;
  return {
    text,
    ...(quotation ? { quotation } : {}),
    ...(question ? { question } : {}),
    ...(draft ? { draft } : {})
  };
};

export const recordedThen = ({ claimId, currentText, revisions, history } = {}) => {
  const now = String(currentText || '').trim();
  if (!claimId || !now) return null;
  const fromRevision = earlierFromRevisions(revisions, claimId, now);
  const text = fromRevision?.text || earlierClaimTextFromHistory(history, now);
  if (!text) return null;
  const work = workFromBefore(fromRevision, claimId);
  return asRecordedThen({
    text,
    quotation: quotationFromBefore(fromRevision, claimId),
    question: work.question,
    draft: work.draft || thenDraftFromHistory(history, text)
  });
};

export const liveExplorationForClaim = ({
  claimMark,
  ledgerClaim,
  citations = [],
  sourceRefs = [],
  then = null
} = {}) => createExploration({
  id: String(claimMark?.claimId || ledgerClaim?.claimId || '').trim(),
  originalText: claimMark && 'text' in claimMark
    ? String(claimMark.text ?? '')
    : String(ledgerClaim?.text || ''),
  source: bindClaimSource({ claimMark, ledgerClaim, citations, sourceRefs }),
  then
});

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
