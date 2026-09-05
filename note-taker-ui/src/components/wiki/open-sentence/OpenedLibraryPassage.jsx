import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OpenSentence from './OpenSentence';
import {
  closeExploration,
  openExploration,
  restoreExploration,
  snapshotExploration
} from './openSentenceModel';
import {
  cancelWikiDraftPlacement,
  libraryDraftScope,
  liveExplorationForHighlight,
  matchingReturnTicket,
  placeBesideWikiDraft,
  wikiReturnHref
} from './openSentenceJourney';
import { draftStorageKey, openedStorageKey } from './openSentenceBinding';
import { readStore, writeStore } from './openSentenceStore';

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
  const [exploration, setExploration] = useState(() => {
    const stored = restoreExploration(readStore(draftStorageKey(scope, highlightId)), live);
    const opened = readStore(openedStorageKey(scope)) === highlightId;
    return opened ? openExploration(stored) : closeExploration(stored);
  });
  const [hosts, setHosts] = useState(null);

  useEffect(() => {
    const stored = restoreExploration(readStore(draftStorageKey(scope, highlightId)), live);
    const opened = readStore(openedStorageKey(scope)) === highlightId;
    setExploration(opened ? openExploration(stored) : closeExploration(stored));
  }, [highlightId, live, scope]);

  const commit = useCallback((next) => {
    const restored = restoreExploration(snapshotExploration(next), live);
    writeStore(draftStorageKey(scope, highlightId), snapshotExploration(restored));
    writeStore(openedStorageKey(scope), restored.status === 'open' ? highlightId : '');
    if (ticket) {
      if (restored.placed && !exploration.placed) placeBesideWikiDraft(ticket);
      if (!restored.placed && exploration.placed) cancelWikiDraftPlacement(ticket);
    }
    setExploration(restored);
  }, [exploration.placed, highlightId, live, scope, ticket]);

  useEffect(() => {
    onOpenedText?.(exploration.status === 'open' ? String(live.originalText || '').trim() : '');
    return () => onOpenedText?.('');
  }, [exploration.status, live.originalText, onOpenedText]);

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
      next?.mark?.classList.remove('open-sentence__held', 'is-open');
      setHosts(null);
    };
  }, [contentHtml, highlightId, inArticle, rootRef]);

  useEffect(() => {
    const mark = hosts?.mark;
    if (!mark) return undefined;
    mark.classList.add('open-sentence__held');
    mark.classList.toggle('is-open', exploration.status === 'open');
    return () => mark.classList.remove('is-open');
  }, [exploration.status, hosts]);

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
