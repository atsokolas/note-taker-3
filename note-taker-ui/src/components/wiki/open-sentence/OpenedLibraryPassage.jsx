import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { libraryExplorations } from '../../../api/authoredExplorations';
import useAuthoredExplorations, { authorshipFor } from './useAuthoredExplorations';
import { draftStorageKey, openedStorageKey } from './openSentenceBinding';
import { readStore, writeStore } from './openSentenceStore';
import OpenSentence from './OpenSentence';
import AuthoredWorkList from './AuthoredWorkList';
import { isOpen, keepsClosedDraft, thoughtTitle } from './openSentenceModel';
import {
  liveExplorationForHighlight,
  matchingReturnTicket,
  placeBesideWikiDraft,
  cancelWikiDraftPlacement,
  libraryDraftScope,
  bindDraft,
  wikiReturnHref
} from './openSentenceJourney';

const highlightSelector = (highlightId) => `[data-highlight-id="highlight-${highlightId}"]`;

const findPassageHosts = (root, highlightId) => {
  if (!root || !highlightId) return null;
  const target = root.querySelector(highlightSelector(highlightId));
  if (!target) return null;
  const mark = target.matches('mark') ? target : target.querySelector('mark.highlight');
  const insertAfter = mark || target.querySelector('blockquote') || target;
  const block = (mark || target).closest('p, li, blockquote, h2, h3, h4, section') || target;
  const controls = document.createElement('span');
  controls.className = 'open-sentence__library-open';
  controls.dataset.readerControl = '';
  insertAfter.after(controls);
  const pocket = document.createElement('div');
  pocket.className = 'open-sentence__library-pocket';
  pocket.dataset.readerControl = '';
  block.after(pocket);
  return { controls, pocket, line: block, mark: mark || insertAfter };
};

export const LibraryOriginReturn = ({ ticket }) => ticket ? (
  <p className="open-sentence-library-arrival">
    You were holding {ticket.sentence || 'that sentence'}
    <Link className="open-sentence-library-arrival__back" to={wikiReturnHref(ticket)}>
      Back to {ticket.pageTitle || 'the Wiki'} →
    </Link>
  </p>
) : null;

const LibraryPassage = ({
  article,
  highlight,
  rootRef,
  contentHtml = '',
  readFresh = false,
  inArticle = false,
  onOpenedText,
  work
}) => {
  const highlightId = String(highlight?._id || highlight?.id || '').trim();
  const articleId = String(article?._id || article?.id || '').trim();
  const scope = libraryDraftScope(articleId);
  const ticket = matchingReturnTicket({ articleId, highlightId });
  const live = useMemo(
    () => liveExplorationForHighlight({ article, highlight }),
    [article, highlight]
  );
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('exploration') === '1';
  const [opened, setOpened] = useState(() => requested || readStore(openedStorageKey(scope)) === highlightId);
  const [hosts, setHosts] = useState(null);
  const [unwritten, setUnwritten] = useState(null);
  // Preserve old device work until its first deliberate edit migrates it.
  const exploration = bindDraft(live, work.records[highlightId]?.draft || unwritten || (work.owner ? readStore(draftStorageKey(scope, highlightId)) : null), opened, { preserveAuthorship: true });
  const placed = Boolean(exploration.placed);

  useEffect(() => {
    setOpened(requested || readStore(openedStorageKey(scope)) === highlightId);
  }, [highlightId, requested, scope, location.key]);

  const commit = useCallback((next) => {
    // Opening an empty experiment is a reading control, not a saved draft.
    setUnwritten(!work.records[highlightId] && !keepsClosedDraft(next, { preserveAuthorship: true }) ? next : null);
    work.change(highlightId, next);
    if (ticket) {
      if (next.placed && !placed) placeBesideWikiDraft(ticket);
      if (!next.placed && placed) cancelWikiDraftPlacement(ticket);
    }
    const nextOpened = isOpen(next);
    if (!nextOpened) writeStore(openedStorageKey(scope), '');
    setOpened(nextOpened);
  }, [highlightId, placed, scope, ticket, work]);

  useEffect(() => {
    onOpenedText?.(opened && !readFresh ? String(live.originalText || '').trim() : '');
    return () => onOpenedText?.('');
  }, [live.originalText, onOpenedText, opened, readFresh]);

  useEffect(() => {
    if (!inArticle) {
      setHosts(null);
      return undefined;
    }
    const next = findPassageHosts(rootRef?.current, highlightId);
    setHosts(next);
    return () => {
      next?.controls.remove();
      next?.pocket.remove();
      next?.mark?.classList.remove('open-sentence__held', 'is-open', 'is-placed');
      setHosts(null);
    };
  }, [contentHtml, highlightId, inArticle, rootRef]);

  useEffect(() => {
    const mark = hosts?.mark;
    if (!mark) return undefined;
    mark.classList.add('open-sentence__held');
    mark.classList.toggle('is-open', opened);
    mark.classList.toggle('is-placed', placed);
    return () => mark.classList.remove('is-open', 'is-placed');
  }, [hosts, opened, placed]);

  useEffect(() => {
    if (requested) hosts?.line?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  }, [hosts, requested, location.key]);

  const pocket = (
    <OpenSentence
      exploration={exploration}
      suspended={readFresh}
      authorship={authorshipFor({ ...work, discard: async itemId => {
        await work.discard(itemId);
        setUnwritten(null);
        setOpened(false);
      } }, highlightId)}
      onChange={commit}
      hideHeld={inArticle}
      hosts={inArticle ? hosts : null}
      armRoot={hosts?.mark || null}
      acceptedLabel="The saved passage still reads"
      placeBesideTitle={ticket?.pageTitle || ''}
    >
      {inArticle ? null : (highlight?.text || live.originalText)}
    </OpenSentence>
  );

  const arrival = <LibraryOriginReturn ticket={ticket} />;

  if (inArticle) {
    return (
      <>
        {arrival}
        {hosts ? pocket : null}
      </>
    );
  }

  return (
    <aside
      className="article-cited-passage"
      data-highlight-id={`highlight-${highlightId}`}
      aria-label="Saved passage"
    >
      {arrival}
      <span className="eyebrow">Saved passage</span>
      {pocket}
      {highlight?.note ? <p>{highlight.note}</p> : null}
    </aside>
  );
};

// The saved work outlives the mark. Keep one account-bound session while
// switching passages; a missing mark uses the same recovery view as Wiki.
const OpenedLibraryPassage = ({ focusedHighlightId, highlights, persistence = libraryExplorations, ...props }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const articleId = String(props.article?._id || props.article?.id || '');
  const highlightId = String(props.highlight?._id || props.highlight?.id || focusedHighlightId || '');
  const scope = libraryDraftScope(articleId);
  const cloud = useAuthoredExplorations({ scopeId: articleId, cacheScope: scope, enabled: Boolean(articleId), api: persistence });
  const available = new Set((highlights || props.article?.highlights || (props.highlight ? [props.highlight] : []))
    .map(item => String(item._id || item.id)));
  const openWork = itemId => {
    const params = new URLSearchParams(location.search);
    params.set('articleId', articleId);
    params.set('highlightId', itemId);
    params.set('exploration', '1');
    navigate({ pathname: '/library', search: params.toString(), hash: '' });
  };
  const work = { ...cloud, discard: async itemId => {
    await cloud.discard(itemId);
    writeStore(draftStorageKey(scope, itemId), '');
    if (readStore(openedStorageKey(scope)) === itemId) writeStore(openedStorageKey(scope), '');
  } };
  const requestedMissing = Boolean(highlightId && !props.highlight);
  return <>
    {cloud.error ? <p className="status-message" role="status">
      Your saved writing could not be loaded. <button type="button" onClick={cloud.retryLoad}>Try again</button>
    </p> : requestedMissing && cloud.loading ? <p className="status-message" role="status">Finding your saved writing…</p>
      : requestedMissing && !cloud.loading && !thoughtTitle(cloud.records[highlightId]?.draft)
        ? <p className="status-message" role="status">This saved passage is no longer here. No saved writing was found for it.</p> : null}
    <AuthoredWorkList records={cloud.records} openedId={highlightId} isAvailable={itemId => available.has(itemId)}
      missingMessage="This highlight is no longer saved in the article. Your earlier quotation and writing are here."
      missingLabel="Earlier passage" onOpen={openWork} onReveal={openWork}
      onDiscard={work.discard} onKeep={work.keep} onResolveConflict={work.resolveConflict} />
    {props.highlight ? <LibraryPassage key={highlightId} {...props} work={work} /> : null}
  </>;
};

export default OpenedLibraryPassage;
