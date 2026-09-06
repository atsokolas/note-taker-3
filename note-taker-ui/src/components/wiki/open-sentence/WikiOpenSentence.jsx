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
import { closeExploration, isOpen, liveProposal } from './openSentenceModel';
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
  revisions,
  onOpenedClaim,
  onAcceptWording,
  children
}) => {
  const [openedId, setOpenedId] = useState(() => (
    enabled && pageId ? (readStore(openedStorageKey(pageId)) || null) : null
  ));
  const [walk, setWalk] = useState(0);
  const [acceptSilence, setAcceptSilence] = useState('');
  const acceptingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !pageId) {
      setOpenedId(null);
      return undefined;
    }
    const readOpened = () => {
      setOpenedId(readStore(openedStorageKey(pageId)) || null);
      setWalk((n) => n + 1);
    };
    readOpened();
    return listenOpenSentenceStore(readOpened);
  }, [enabled, pageId]);

  const liveFor = useCallback((claimMark) => (
    liveExplorationForPageClaim(page, claimMark, { revisions })
  ), [page, revisions]);

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
    // `walk` is the store's revision, not an unused value: this callback reads
    // the draft store imperatively above, so bumping it on every store change is
    // what makes a saved draft show up. Removing it satisfies the rule and
    // silently stops drafts refreshing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFor, openedId, pageId, walk]);

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
    setWalk((n) => n + 1);
  }, [liveFor, openedId, pageId]);

  useEffect(() => {
    if (!onOpenedClaim) return;
    const liveText = openedId ? String(claimTextOnPage(page?.body, openedId) || '').trim() : '';
    onOpenedClaim(liveText ? openedId : '');
  }, [onOpenedClaim, openedId, page]);

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

  useEffect(() => {
    setAcceptSilence('');
  }, [openedId, page]);

  const accept = useCallback(async (exploration) => {
    if (!onAcceptWording || acceptingRef.current) return;
    const proposal = liveProposal(exploration);
    if (!proposal) return;
    acceptingRef.current = true;
    setAcceptSilence('');
    try {
      await onAcceptWording({
        claimId: exploration.id,
        against: proposal.against,
        text: proposal.text
      });
    } catch (error) {
      const message = String(error?.response?.data?.error || '').trim();
      setAcceptSilence(message || 'The article moved on. This proposal was not applied.');
    } finally {
      acceptingRef.current = false;
    }
  }, [onAcceptWording]);

  const value = useMemo(() => ({
    enabled,
    openedId,
    pageId,
    explorationFor,
    commit,
    leaveForLibrary,
    accept: onAcceptWording ? accept : null,
    acceptSilence
  }), [accept, acceptSilence, commit, enabled, explorationFor, leaveForLibrary, onAcceptWording, openedId, pageId]);

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
      onAccept={ctx.accept}
      acceptSilence={ctx.acceptSilence}
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
