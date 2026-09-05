import { wikiReadPath } from '../../../utils/wikiFeatureFlags';
import { cleanSourceTextForDisplay } from '../../../utils/sourceDisplayText';
import {
  EXPLORATION_STATUS,
  cancelPlacement,
  closeExploration,
  createExploration,
  forgetExperiment,
  keepsClosedDraft,
  openExploration,
  placeSource,
  restoreExploration,
  snapshotExploration
} from './openSentenceModel';
import { draftStorageKey, openedStorageKey } from './openSentenceBinding';
import { readStore, writeStore } from './openSentenceStore';

export const RETURN_TICKET_KEY = 'noeis.open-sentence.return';

const asId = (value) => String(value?._id || value?.id || value || '').trim();

const AROUND_WINDOW = 160;

export const libraryDraftScope = (articleId) => `library:${asId(articleId)}`;

export const writeReturnTicket = (ticket = {}) => {
  const articleId = asId(ticket.articleId);
  const pageId = asId(ticket.pageId);
  const claimId = asId(ticket.claimId);
  if (!articleId || !pageId || !claimId) return;
  writeStore(RETURN_TICKET_KEY, JSON.stringify({
    articleId,
    highlightId: asId(ticket.highlightId),
    sentence: String(ticket.sentence || ''),
    pageId,
    pageTitle: String(ticket.pageTitle || '').trim(),
    sourceTitle: String(ticket.sourceTitle || '').trim(),
    claimId
  }));
};

export const readReturnTicket = () => {
  const raw = readStore(RETURN_TICKET_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const articleId = asId(parsed.articleId);
    const pageId = asId(parsed.pageId);
    const claimId = asId(parsed.claimId);
    if (!articleId || !pageId || !claimId) return null;
    return {
      articleId,
      highlightId: asId(parsed.highlightId),
      sentence: String(parsed.sentence || ''),
      pageId,
      pageTitle: String(parsed.pageTitle || '').trim(),
      sourceTitle: String(parsed.sourceTitle || '').trim(),
      claimId
    };
  } catch (_unreadable) {
    return null;
  }
};

export const matchingReturnTicket = ({ articleId, highlightId } = {}) => {
  const ticket = readReturnTicket();
  if (!ticket || ticket.articleId !== asId(articleId)) return null;
  if (ticket.highlightId && ticket.highlightId !== asId(highlightId)) return null;
  return ticket;
};

export const matchingWikiTicket = ({ pageId, claimId } = {}) => {
  const ticket = readReturnTicket();
  if (!ticket || ticket.pageId !== asId(pageId)) return null;
  if (ticket.claimId && ticket.claimId !== asId(claimId)) return null;
  return ticket;
};

export const homecomingLine = (ticket) => {
  if (!ticket) return '';
  const sourceTitle = String(ticket.sourceTitle || '').trim();
  return sourceTitle ? `You were in ${sourceTitle}.` : 'You were in the Library.';
};

export const bindDraft = (live, draft, opened) => {
  const raw = typeof draft === 'string' ? draft : (draft ? snapshotExploration(draft) : '');
  const restored = restoreExploration(raw, live);
  return opened ? openExploration(restored) : closeExploration(restored);
};

export const rememberDraft = (scope, itemId, next, live) => {
  const restored = restoreExploration(snapshotExploration(next), live);
  if (restored.status === EXPLORATION_STATUS.closed && !keepsClosedDraft(restored)) {
    writeStore(draftStorageKey(scope, itemId), '');
    return forgetExperiment(live);
  }
  writeStore(draftStorageKey(scope, itemId), snapshotExploration(restored));
  return restored;
};

export const rememberOpened = (scope, itemId, exploration, openedId) => {
  if (exploration.status === EXPLORATION_STATUS.open) {
    writeStore(openedStorageKey(scope), itemId);
    return itemId;
  }
  if (openedId === itemId) {
    writeStore(openedStorageKey(scope), '');
    return null;
  }
  return openedId;
};

export const readRemembered = (scope, itemId, live) => bindDraft(
  live,
  readStore(draftStorageKey(scope, itemId)),
  readStore(openedStorageKey(scope)) === itemId
);

export const wikiReturnHref = (ticket) => {
  if (!ticket?.pageId) return '';
  const claim = asId(ticket.claimId);
  return wikiReadPath(ticket.pageId, claim ? `claimId=${encodeURIComponent(claim)}` : '');
};

const indexesOf = (haystack, needle) => {
  const found = [];
  if (!haystack || !needle) return found;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    found.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return found;
};

export const surroundingFromArticle = ({ article, highlight } = {}) => {
  const anchor = highlight?.anchor && typeof highlight.anchor === 'object' ? highlight.anchor : {};
  const savedBefore = cleanSourceTextForDisplay(anchor.prefix || '');
  const savedAfter = cleanSourceTextForDisplay(anchor.suffix || '');
  if (savedBefore || savedAfter) {
    return { aroundBefore: savedBefore, aroundAfter: savedAfter };
  }

  const body = cleanSourceTextForDisplay(article?.content || '');
  const needle = cleanSourceTextForDisplay(anchor.text || highlight?.text || '');
  const starts = indexesOf(body, needle);
  if (!starts.length) return { aroundBefore: '', aroundAfter: '' };

  let start = starts[0];
  if (starts.length > 1) {
    const approx = Number(anchor.startOffsetApprox);
    if (!Number.isFinite(approx)) return { aroundBefore: '', aroundAfter: '' };
    start = starts.reduce((best, index) => (
      Math.abs(index - approx) < Math.abs(best - approx) ? index : best
    ));
  }

  return {
    aroundBefore: body.slice(Math.max(0, start - AROUND_WINDOW), start).trim(),
    aroundAfter: body.slice(start + needle.length, start + needle.length + AROUND_WINDOW).trim()
  };
};

export const bindLibraryPassage = ({ article, highlight } = {}) => {
  const passage = cleanSourceTextForDisplay(highlight?.text || highlight?.anchor?.text || '');
  const around = surroundingFromArticle({ article, highlight });
  return {
    title: String(article?.title || '').trim() || 'Untitled source',
    passage,
    aroundBefore: around.aroundBefore,
    aroundAfter: around.aroundAfter,
    qualification: 'Saved passage · already here',
    available: true,
    stale: false,
    href: '',
    originalHref: String(article?.url || '').trim(),
    isLibrary: true,
    here: true,
    articleId: asId(article),
    highlightId: asId(highlight)
  };
};

export const liveExplorationForHighlight = ({ article, highlight } = {}) => createExploration({
  id: asId(highlight),
  originalText: String(highlight?.text || highlight?.anchor?.text || ''),
  source: bindLibraryPassage({ article, highlight })
});

const wikiDraftFallback = (ticket) => createExploration({
  id: asId(ticket?.claimId),
  originalText: String(ticket?.sentence || '')
});

export const placeBesideWikiDraft = (ticket) => {
  if (!ticket?.pageId || !ticket?.claimId) return;
  const live = wikiDraftFallback(ticket);
  const current = bindDraft(live, readStore(draftStorageKey(ticket.pageId, ticket.claimId)), false);
  rememberDraft(ticket.pageId, ticket.claimId, placeSource(current), live);
};

export const cancelWikiDraftPlacement = (ticket) => {
  if (!ticket?.pageId || !ticket?.claimId) return;
  const live = wikiDraftFallback(ticket);
  const current = bindDraft(live, readStore(draftStorageKey(ticket.pageId, ticket.claimId)), false);
  rememberDraft(ticket.pageId, ticket.claimId, cancelPlacement(current), live);
};
