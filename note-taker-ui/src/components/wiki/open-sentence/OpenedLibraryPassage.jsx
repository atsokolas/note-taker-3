import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OpenSentence from './OpenSentence';
import { isOpen } from './openSentenceModel';
import {
  liveExplorationForHighlight,
  matchingReturnTicket,
  placeBesideWikiDraft,
  cancelWikiDraftPlacement,
  libraryDraftScope,
  readRemembered,
  rememberDraft,
  rememberOpened,
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
  insertAfter.after(controls);
  const pocket = document.createElement('div');
  pocket.className = 'open-sentence__library-pocket';
  block.after(pocket);
  return { controls, pocket, line: block, mark: mark || insertAfter };
};

const OpenedLibraryPassage = ({
  article,
  highlight,
  rootRef,
  contentHtml = '',
  inArticle = false,
  onOpenedText
}) => {
  const highlightId = String(highlight?._id || highlight?.id || '').trim();
  const articleId = String(article?._id || article?.id || '').trim();
  const scope = libraryDraftScope(articleId);
  const ticket = matchingReturnTicket({ articleId, highlightId });
  const live = useMemo(
    () => liveExplorationForHighlight({ article, highlight }),
    [article, highlight]
  );
  const [exploration, setExploration] = useState(() => readRemembered(scope, highlightId, live));
  const [hosts, setHosts] = useState(null);
  const opened = isOpen(exploration);
  const placed = Boolean(exploration.placed);

  useEffect(() => {
    setExploration(readRemembered(scope, highlightId, live));
  }, [highlightId, live, scope]);

  const commit = useCallback((next) => {
    const remembered = rememberDraft(scope, highlightId, next, live);
    rememberOpened(scope, highlightId, remembered, highlightId);
    if (ticket) {
      if (remembered.placed && !placed) placeBesideWikiDraft(ticket);
      if (!remembered.placed && placed) cancelWikiDraftPlacement(ticket);
    }
    setExploration(remembered);
  }, [highlightId, live, placed, scope, ticket]);

  useEffect(() => {
    onOpenedText?.(opened ? String(live.originalText || '').trim() : '');
    return () => onOpenedText?.('');
  }, [live.originalText, onOpenedText, opened]);

  useLayoutEffect(() => {
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

  const pocket = (
    <OpenSentence
      exploration={exploration}
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

  const arrival = ticket ? (
    <p className="open-sentence-library-arrival">
      You were holding {ticket.sentence || 'that sentence'}
      {wikiReturnHref(ticket) ? (
        <Link className="open-sentence-library-arrival__back" to={wikiReturnHref(ticket)}>
          Back to {ticket.pageTitle || 'the Wiki'} →
        </Link>
      ) : null}
    </p>
  ) : null;

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

export default OpenedLibraryPassage;
