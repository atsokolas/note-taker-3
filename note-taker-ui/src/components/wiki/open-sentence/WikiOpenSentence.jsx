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
  liveExplorationForClaim,
  openedStorageKey
} from './openSentenceBinding';
import { EXPLORATION_STATUS, closeExploration, keepsClosedDraft } from './openSentenceModel';
import {
  bindDraft,
  homecomingLine,
  matchingWikiTicket,
  rememberDraft,
  rememberOpened,
  writeReturnTicket
} from './openSentenceJourney';
import { readStore } from './openSentenceStore';

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
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    if (!enabled || !pageId) {
      setOpenedId(null);
      setDrafts({});
      return;
    }
    setOpenedId(readStore(openedStorageKey(pageId)) || null);
    setDrafts({});
  }, [enabled, pageId]);

  const liveFor = useCallback((claimMark) => {
    const ledgerClaim = (page?.claims || []).find((claim) => claim?.claimId === claimMark?.claimId);
    return liveExplorationForClaim({
      claimMark,
      ledgerClaim,
      citations: page?.citations || [],
      sourceRefs: page?.sourceRefs || []
    });
  }, [page]);

  const explorationFor = useCallback((claimMark) => {
    if (!claimMark?.claimId) return liveFor(claimMark);
    const live = liveFor(claimMark);
    return bindDraft(
      live,
      draftsRef.current[claimMark.claimId]
        ?? readStore(draftStorageKey(pageId, claimMark.claimId)),
      openedId === claimMark.claimId
    );
  }, [liveFor, openedId, pageId]);

  const commit = useCallback((claimId, next) => {
    if (!claimId) return;
    setDrafts((current) => {
      const drafts = { ...current };
      if (openedId && openedId !== claimId && current[openedId]) {
        const closedPrevious = rememberDraft(
          pageId,
          openedId,
          closeExploration(current[openedId]),
          liveFor({ claimId: openedId })
        );
        if (keepsClosedDraft(closedPrevious)) drafts[openedId] = closedPrevious;
        else delete drafts[openedId];
      }
      const remembered = rememberDraft(pageId, claimId, next, liveFor({ claimId }));
      if (remembered.status === EXPLORATION_STATUS.closed && !keepsClosedDraft(remembered)) {
        delete drafts[claimId];
      } else {
        drafts[claimId] = remembered;
      }
      return drafts;
    });
    setOpenedId((currentOpened) => rememberOpened(pageId, claimId, next, currentOpened));
  }, [liveFor, openedId, pageId]);

  useEffect(() => {
    if (!onOpenedText) return;
    if (!openedId) {
      onOpenedText('');
      return;
    }
    const ledger = (page?.claims || []).find((claim) => claim?.claimId === openedId);
    const draft = drafts[openedId];
    onOpenedText(String(
      claimTextOnPage(page?.body, openedId) || ledger?.text || draft?.originalText || ''
    ).trim());
  }, [drafts, onOpenedText, openedId, page]);

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
  const activeId = openedHere ? ctx.openedId : (armedId || claims[0].claimId);
  const claim = claims.find((item) => item.claimId === activeId) || claims[0];
  const exploration = ctx.explorationFor(claim);
  const homecoming = homecomingLine(matchingWikiTicket({
    pageId: ctx.pageId,
    claimId: claim.claimId
  }));

  return (
    <OpenSentence
      exploration={exploration}
      onChange={(next) => ctx.commit(claim.claimId, next)}
      heldInteractive={false}
      lineRef={lineRef}
      homecoming={homecoming}
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
