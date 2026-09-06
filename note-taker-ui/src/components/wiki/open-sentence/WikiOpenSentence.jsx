import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import OpenSentence from './OpenSentence';
import {
  claimIdFromSelection,
  claimsInParagraph,
  claimTextOnPage,
  draftStorageKey,
  liveExplorationForPageClaim,
  openedStorageKey
} from './openSentenceBinding';
import { closeExploration, isOpen } from './openSentenceModel';
import {
  alignRemembered,
  bindDraft,
  homecomingLine,
  keepExploration,
  matchingWikiTicket,
  readRemembered,
  rememberDraft,
  writeReturnTicket
} from './openSentenceJourney';
import { listenOpenSentenceStore, readStore } from './openSentenceStore';

const WikiOpenSentenceContext = createContext(null);

export const WikiOpenSentenceProvider = ({
  page,
  pageId,
  enabled = false,
  onOpenedText,
  children
}) => {
  const [openedId, setOpenedId] = useState(() => (
    enabled && pageId ? (readStore(openedStorageKey(pageId)) || null) : null
  ));

  useEffect(() => {
    if (!enabled || !pageId) {
      setOpenedId(null);
      return undefined;
    }
    const readOpened = () => setOpenedId(readStore(openedStorageKey(pageId)) || null);
    readOpened();
    return listenOpenSentenceStore(readOpened);
  }, [enabled, pageId]);

  const liveFor = useCallback((claimMark) => (
    liveExplorationForPageClaim(page, claimMark)
  ), [page]);

  useEffect(() => {
    if (!enabled || !pageId) return;
    const opened = openedId || readStore(openedStorageKey(pageId));
    if (opened) alignRemembered(pageId, opened, liveFor({ claimId: opened }));
  }, [enabled, liveFor, openedId, page, pageId]);

  const explorationFor = useCallback((claimMark) => {
    if (!claimMark?.claimId) return liveFor(claimMark);
    return bindDraft(
      liveFor(claimMark),
      readStore(draftStorageKey(pageId, claimMark.claimId)),
      openedId === claimMark.claimId
    );
  }, [liveFor, openedId, pageId]);

  const commit = useCallback((claimId, next) => {
    if (!claimId) return;
    if (openedId && openedId !== claimId) {
      const previousLive = liveFor({ claimId: openedId });
      rememberDraft(
        pageId,
        openedId,
        closeExploration(readRemembered(pageId, openedId, previousLive)),
        previousLive
      );
    }
    const remembered = keepExploration(pageId, claimId, next, liveFor({ claimId }));
    setOpenedId(isOpen(remembered) ? claimId : (openedId === claimId ? null : openedId));
  }, [liveFor, openedId, pageId]);

  useEffect(() => {
    if (!onOpenedText) return;
    const liveText = openedId ? String(claimTextOnPage(page?.body, openedId) || '').trim() : '';
    onOpenedText(liveText, liveText ? openedId : '');
  }, [onOpenedText, openedId, page]);

  const leaveForLibrary = useCallback((source, exploration) => {
    writeReturnTicket({
      articleId: source?.articleId,
      highlightId: source?.highlightId,
      sentence: claimTextOnPage(page?.body, exploration?.id)
        || exploration?.originalText
        || '',
      pageId,
      pageTitle: page?.title || '',
      sourceTitle: source?.title || '',
      claimId: exploration?.id
    });
  }, [page, pageId]);

  const value = useMemo(() => ({
    enabled,
    openedId,
    pageId,
    explorationFor,
    commit,
    leaveForLibrary
  }), [commit, enabled, explorationFor, leaveForLibrary, openedId, pageId]);

  return (
    <WikiOpenSentenceContext.Provider value={value}>
      {children}
    </WikiOpenSentenceContext.Provider>
  );
};

const OpenableParagraph = ({ node, id, className, children }) => {
  const ctx = useContext(WikiOpenSentenceContext);
  const lineRef = useRef(null);
  const claims = useMemo(() => claimsInParagraph(node), [node]);
  const [armedId, setArmedId] = useState(claims[0]?.claimId || '');

  useEffect(() => {
    if (!claims.length) return undefined;
    const syncArmed = () => {
      const selected = claimIdFromSelection(lineRef.current, claims);
      if (selected) setArmedId(selected);
    };
    document.addEventListener('selectionchange', syncArmed);
    return () => document.removeEventListener('selectionchange', syncArmed);
  }, [claims]);

  if (!ctx?.enabled || !claims.length) {
    return (
      <p id={id} data-wiki-block-anchor={id} className={className}>
        {children}
      </p>
    );
  }

  const openedHere = claims.some((claim) => claim.claimId === ctx.openedId);
  const claim = claims.find((item) => item.claimId === (
    openedHere ? ctx.openedId : (armedId || claims[0].claimId)
  )) || claims[0];

  return (
    <OpenSentence
      exploration={ctx.explorationFor(claim)}
      onChange={(next) => ctx.commit(claim.claimId, next)}
      heldInteractive={false}
      lineRef={lineRef}
      homecoming={homecomingLine(matchingWikiTicket({
        pageId: ctx.pageId,
        claimId: claim.claimId
      }))}
      onOpenSourceHome={ctx.leaveForLibrary}
      lineProps={{
        id,
        className,
        'data-wiki-block-anchor': id
      }}
    >
      {children}
    </OpenSentence>
  );
};

export const wrapOpenableParagraph = ({ node, key, id, className, children }) => (
  <OpenableParagraph key={key} node={node} id={id} className={className}>
    {children}
  </OpenableParagraph>
);
