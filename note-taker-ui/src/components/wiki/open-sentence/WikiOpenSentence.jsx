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
import AuthoredWorkList from './AuthoredWorkList';
import {
  claimIdFromSelection,
  claimsInParagraph,
  claimTextOnPage,
  draftStorageKey,
  liveExplorationForPageClaim,
  openedStorageKey
} from './openSentenceBinding';
import { closeExploration, forgetExperiment, isOpen, keepsClosedDraft, liveProposal, openExploration } from './openSentenceModel';
import {
  alignRemembered,
  bindDraft,
  homecomingLine,
  keepExploration,
  matchingWikiTicket,
  readRemembered,
  rememberOpened,
  rememberDraft,
  writeReturnTicket
} from './openSentenceJourney';
import { listenOpenSentenceStore, readStore, writeStore } from './openSentenceStore';
import useAuthoredExplorations, { explorationDraft, authorshipFor } from './useAuthoredExplorations';

const WikiOpenSentenceContext = createContext(null);

export const WikiOpenSentenceProvider = ({
  page,
  pageId,
  enabled = false,
  readFresh = false,
  revisions,
  onOpenedClaim,
  onOpenedExploration,
  durable = false,
  persistence,
  onAcceptWording,
  onMakeTitle,
  children
}) => {
  const [openedId, setOpenedId] = useState(() => (
    enabled && pageId && !durable ? (readStore(openedStorageKey(pageId)) || null) : null
  ));
  const [walk, setWalk] = useState(0);
  const [acceptSilence, setAcceptSilence] = useState('');
  const acceptingRef = useRef(false);
  const cloud = useAuthoredExplorations({ scopeId: pageId, enabled: enabled && durable, api: persistence });
  const { change: changeAuthoredWork, discard: discardAuthoredWork } = cloud;
  const scope = durable ? `account:${cloud.owner}:${pageId}` : pageId;

  useEffect(() => {
    if (!enabled || !pageId || (durable && !cloud.owner)) {
      setOpenedId(null);
      return undefined;
    }
    const readOpened = () => {
      setOpenedId(readStore(openedStorageKey(scope)) || null);
      setWalk((n) => n + 1);
    };
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('exploration') === '1' ? params.get('claimId') : '';
    setOpenedId(requested || readStore(openedStorageKey(scope)) || null);
    return listenOpenSentenceStore(readOpened);
  }, [cloud.owner, durable, enabled, pageId, scope]);

  const liveFor = useCallback((claimMark) => (
    liveExplorationForPageClaim(page, claimMark, { revisions })
  ), [page, revisions]);

  useEffect(() => {
    if (!enabled || !pageId || durable) return;
    const opened = openedId || readStore(openedStorageKey(pageId));
    if (opened) alignRemembered(pageId, opened, liveFor({ claimId: opened }));
  }, [durable, enabled, liveFor, openedId, page, pageId]);

  const explorationFor = useCallback((claimMark) => {
    if (!claimMark?.claimId) return liveFor(claimMark);
    return bindDraft(
      liveFor(claimMark),
      durable
        ? cloud.records[claimMark.claimId]?.draft || (cloud.owner ? readStore(draftStorageKey(pageId, claimMark.claimId)) : null)
        : readStore(draftStorageKey(pageId, claimMark.claimId)),
      openedId === claimMark.claimId,
      { preserveAuthorship: durable }
    );
    // `walk` is the store's revision, not an unused value: this callback reads
    // the draft store imperatively above, so bumping it on every store change is
    // what makes a saved draft show up. Removing it satisfies the rule and
    // silently stops drafts refreshing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.owner, cloud.records, durable, liveFor, openedId, pageId, walk]);

  const commit = useCallback((claimId, next) => {
    if (!claimId) return;
    if (durable) {
      changeAuthoredWork(claimId, next);
      setOpenedId(rememberOpened(scope, claimId, next, openedId));
      return;
    }
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
  }, [changeAuthoredWork, durable, liveFor, openedId, pageId, scope]);

  useEffect(() => {
    if (!onOpenedExploration) return;
    onOpenedExploration(enabled && !readFresh && openedId ? {
      pageId,
      claimId: openedId,
      draft: explorationDraft(explorationFor({ claimId: openedId }))
    } : null);
  }, [enabled, explorationFor, onOpenedExploration, openedId, pageId, readFresh]);

  const discard = useCallback(async (claimId) => {
    await discardAuthoredWork(claimId);
    writeStore(draftStorageKey(pageId, claimId), '');
    const reset = forgetExperiment(liveFor({ claimId }));
    setOpenedId(rememberOpened(scope, claimId, reset, openedId));
  }, [discardAuthoredWork, liveFor, openedId, pageId, scope]);

  useEffect(() => {
    if (!onOpenedClaim) return;
    const liveText = openedId ? String(claimTextOnPage(page?.body, openedId) || '').trim() : '';
    onOpenedClaim(liveText && !readFresh ? openedId : '');
  }, [onOpenedClaim, openedId, page, readFresh]);

  const leaveForLibrary = useCallback((source, exploration) => {
    writeReturnTicket({
      articleId: source?.articleId,
      highlightId: source?.highlightId,
      passage: source?.passage,
      anchor: source?.anchor,
      reopen: durable && keepsClosedDraft(exploration, { preserveAuthorship: true }),
      sentence: claimTextOnPage(page?.body, exploration?.id)
        || exploration?.originalText
        || '',
      pageId,
      pageTitle: page?.title || '',
      sourceTitle: source?.title || '',
      claimId: exploration?.id
    });
  }, [durable, page, pageId]);

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

  const makeTitle = useCallback(async (text) => {
    if (!onMakeTitle) return;
    try {
      await onMakeTitle(text);
    } catch (_error) {
      // The page title stays. The sentence stays.
    }
  }, [onMakeTitle]);

  const value = useMemo(() => ({
    enabled,
    readFresh,
    openedId,
    pageId,
    pageTitle: String(page?.title || ''),
    explorationFor,
    commit,
    leaveForLibrary,
    accept: onAcceptWording ? accept : null,
    acceptSilence,
    makeTitle: onMakeTitle ? makeTitle : null,
    authorship: durable ? { ...cloud, discard } : null
  }), [accept, acceptSilence, cloud, commit, discard, durable, enabled, explorationFor, leaveForLibrary, makeTitle, onAcceptWording, onMakeTitle, openedId, page?.title, pageId, readFresh]);

  return (
    <WikiOpenSentenceContext.Provider value={value}>
      {children}
      {enabled && durable ? <AuthoredWorkList records={cloud.records} isAvailable={claimId => Boolean(claimTextOnPage(page?.body, claimId)) && (page?.claims || []).some(claim => claim.claimId === claimId)} openedId={openedId} onDiscard={discard} onKeep={cloud.keep} onResolveConflict={cloud.resolveConflict} onOpen={claimId => {
        commit(claimId, openExploration(explorationFor({ claimId })));
        requestAnimationFrame(() => Array.from(document.querySelectorAll('[data-claim-id]'))
          .find(node => node.getAttribute('data-claim-id') === claimId)?.scrollIntoView?.({ block: 'center', behavior: 'instant' }));
      }} /> : null}
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
      suspended={ctx.readFresh}
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
      authorship={ctx.authorship ? authorshipFor(ctx.authorship, claim.claimId) : null}
      pageTitle={ctx.pageTitle}
      onMakeTitle={ctx.makeTitle}
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
