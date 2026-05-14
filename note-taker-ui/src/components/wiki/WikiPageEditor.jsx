import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui';
import {
  addWikiSource,
  applyWikiAutolink,
  askWikiPage,
  deleteWikiPage,
  getWikiPage,
  listWikiAutolinks,
  maintainWikiPage,
  promoteWikiDiscussion,
  removeWikiDiscussion,
  removeWikiSource,
  updateWikiPage
} from '../../api/wiki';
import WikiAiSourcePanel from './WikiAiSourcePanel';
import WikiAgentPresence from './WikiAgentPresence';
import WikiAskComposer from './WikiAskComposer';
import WikiBacklinkPanel from './WikiBacklinkPanel';
import WikiAutolinkSuggestions from './WikiAutolinkSuggestions';
import WikiChangesSinceLastVisit from './WikiChangesSinceLastVisit';
import WikiDiscussions from './WikiDiscussions';
import WikiPageMetaBar from './WikiPageMetaBar';
import WikiPageActivityRail from './WikiPageActivityRail';
import ClaimCitationPopover from './ClaimCitationPopover';
import Claim, { SUPPORT_STATES } from './extensions/Claim';
import WikiLink from './extensions/WikiLink';
import {
  diffClaimLedgerSnapshots,
  diffClaimSnapshots,
  extractClaimTexts,
  getLastVisitState,
  recordVisit
} from './wikiVisitTracker';
import { trackWikiQaPromoted } from '../../utils/wikiAnalytics';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const normalizeId = (value) => String(value || '').trim();

const docHasWikiLinks = (node) => {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(docHasWikiLinks);
  if (typeof node !== 'object') return false;
  if (Array.isArray(node.marks) && node.marks.some(mark => mark?.type === 'wikiLink' && mark?.attrs?.pageId)) {
    return true;
  }
  return Array.isArray(node.content) && node.content.some(docHasWikiLinks);
};

const idsMatch = (a, b) => normalizeId(a) && normalizeId(a) === normalizeId(b);

const parseIndexAttribute = (value = '') => (
  String(value || '')
    .split(',')
    .map(token => Number(token.trim()))
    .filter(Number.isFinite)
    .filter(index => index >= 1)
);

const sourceIdsForCitationIds = ({ citationIds = [], citations = [] } = {}) => (
  (citations || [])
    .filter(citation => (citationIds || []).some(id => idsMatch(id, citation._id || citation.id)))
    .map(citation => citation.sourceRefId || citation.sourceId)
    .filter(Boolean)
);

const claimContradictsSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = source._id || source.id;
  const contradictionCitationIds = Array.isArray(claim.contradictedByCitationIds)
    ? claim.contradictedByCitationIds
    : [];
  return sourceIdsForCitationIds({ citationIds: contradictionCitationIds, citations })
    .some(id => idsMatch(id, sourceId));
};

const claimMatchesSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = source._id || source.id;
  if ((claim.sourceRefIds || []).some(id => idsMatch(id, sourceId))) return true;
  const supportingSourceIds = sourceIdsForCitationIds({ citationIds: claim.citationIds || [], citations });
  if (supportingSourceIds.some(id => idsMatch(id, sourceId))) return true;
  return claimContradictsSource({ claim, source, citations });
};

const WikiPageEditor = ({ pageId, onDoneEditing }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [maintaining, setMaintaining] = useState(false);
  const [linkifying, setLinkifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  const [activeSourceIndex, setActiveSourceIndex] = useState(null);
  const [asking, setAsking] = useState(false);
  const [promotingDiscussionId, setPromotingDiscussionId] = useState('');
  const [error, setError] = useState('');
  // Snapshot from the previous visit, captured on first page load. We hold
  // this in a ref + state so subsequent edits within the visit don't clear
  // the banner — only "Mark reviewed" or a fresh page load should.
  const [lastVisit, setLastVisit] = useState(null);
  const lastVisitCapturedRef = useRef(false);
  const saveTimer = useRef(null);
  const latestPageRef = useRef(null);
  const draftTriggeredRef = useRef(false);

  const savePage = async (updates) => {
    setSaveStatus('saving');
    setError('');
    try {
      const saved = await updateWikiPage(pageId, updates);
      latestPageRef.current = saved;
      setPage(saved);
      setSaveStatus('saved');
    } catch (_error) {
      setError('Failed to save Wiki page.');
      setSaveStatus('failed');
    } finally {
    }
  };

  const scheduleSave = (updates) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('dirty');
    saveTimer.current = setTimeout(() => {
      savePage(updates);
    }, 650);
  };

  // Hovered/focused claim → drives the citation popover. Stored as the claim
  // attributes plus the anchor rect so the popover can position against it.
  const [activeClaim, setActiveClaim] = useState(null);

  const handleClaimHover = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return;
    const claimId = target.getAttribute('data-claim-id') || '';
    const support = target.getAttribute('data-support') || 'supported';
    const indexes = parseIndexAttribute(target.getAttribute('data-citation-indexes'));
    const contradictionIndexes = parseIndexAttribute(target.getAttribute('data-contradiction-indexes'));
    setActiveClaim({
      claimId,
      support: SUPPORT_STATES.has(support) ? support : 'supported',
      citationIndexes: indexes,
      contradictionIndexes,
      anchorRect: target.getBoundingClientRect()
    });
  }, []);

  const handleClaimLeave = useCallback((event) => {
    // Don't dismiss if the cursor moved into the popover itself.
    const next = event.relatedTarget;
    if (next && (
      next.closest?.('.wiki-claim-popover') ||
      next.closest?.('.wiki-claim-citation') ||
      next.closest?.('span.wiki-claim')
    )) return;
    setActiveClaim(null);
  }, []);

  const focusSourceByIndex = useCallback((citationIndex) => {
    if (!Number.isFinite(citationIndex) || citationIndex < 1) return;
    setActiveSourceIndex(citationIndex);
    setSourcePanelOpen(true);
    window.setTimeout(() => {
      const sourceNode = document.getElementById(`wiki-source-ref-${citationIndex}`);
      if (!sourceNode) return;
      sourceNode.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      sourceNode.focus?.({ preventScroll: true });
    }, 0);
  }, []);

  const handleClaimClick = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return false;
    const [firstIndex] = (target.getAttribute('data-citation-indexes') || '')
      .split(',')
      .map(token => Number(token.trim()))
      .filter(Number.isFinite);
    const claimId = target.getAttribute('data-claim-id') || '';
    const ledgerClaim = (latestPageRef.current?.claims || []).find(claim => claim.claimId === claimId);
    const firstLedgerIndex = ledgerClaim && latestPageRef.current?.sourceRefs?.length
      ? latestPageRef.current.sourceRefs.findIndex(source => (
          claimMatchesSource({
            claim: ledgerClaim,
            source,
            citations: latestPageRef.current?.citations || []
          })
        )) + 1
      : 0;
    const targetIndex = firstLedgerIndex || firstIndex;
    if (!targetIndex) return false;
    focusSourceByIndex(targetIndex);
    return true;
  }, [focusSourceByIndex]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write the page. Use the AI/source panel for support.' }),
      WikiLink,
      Claim
    ],
    content: emptyDoc,
    editorProps: {
      attributes: {
        class: 'tiptap-editor wiki-editor__body'
      },
      handleDOMEvents: {
        mouseover: (_view, event) => {
          handleClaimHover(event);
          return false;
        },
        mouseout: (_view, event) => {
          handleClaimLeave(event);
          return false;
        },
        focusin: (_view, event) => {
          handleClaimHover(event);
          return false;
        },
        click: (_view, event) => {
          handleClaimClick(event);
          return false;
        }
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      scheduleSave({ body: activeEditor.getJSON() });
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
        editor?.commands?.setContent(loaded.body || emptyDoc, false);
        // Capture the previous-visit snapshot ONCE per page load. Subsequent
        // page state updates (e.g. live saves) must not move the comparison
        // baseline — that would dismiss the banner mid-visit.
        if (!lastVisitCapturedRef.current) {
          lastVisitCapturedRef.current = true;
          setLastVisit(getLastVisitState(pageId));
        }
      } catch (_error) {
        if (!cancelled) setError('Failed to load Wiki page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (editor) load();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [editor, pageId]);

  const handleTitleChange = (event) => {
    const title = event.target.value;
    setPage(current => ({ ...(current || latestPageRef.current), title }));
    scheduleSave({ title });
  };

  const handleMetaChange = (updates) => {
    setPage(current => ({ ...(current || latestPageRef.current), ...updates }));
    savePage(updates);
  };

  const handleMaintain = async () => {
      setMaintaining(true);
      setError('');
      setPage(current => current ? ({
        ...current,
        aiState: {
          ...(current.aiState || {}),
          draftStatus: 'maintaining',
          draftRequestedAt: new Date().toISOString()
        }
      }) : current);
      try {
        const maintained = await maintainWikiPage(pageId);
        latestPageRef.current = maintained;
        setPage(maintained);
        editor?.commands?.setContent(maintained.body || emptyDoc, false);
    } catch (_error) {
      setError('Failed to maintain Wiki page.');
    } finally {
      setMaintaining(false);
    }
  };

  const handleLinkify = async () => {
    setLinkifying(true);
    setError('');
    try {
      const { suggestions = [] } = await listWikiAutolinks(pageId);
      let updated = latestPageRef.current || page;
      for (const suggestion of suggestions) {
        if (!suggestion?.pageId) continue;
        // Apply sequentially so later links see the body saved by earlier passes.
        // The backend skips duplicates, so this remains idempotent.
        // eslint-disable-next-line no-await-in-loop
        updated = await applyWikiAutolink(pageId, suggestion.pageId);
      }
      if (updated) {
        latestPageRef.current = updated;
        setPage(updated);
        if (updated.body) editor?.commands?.setContent(updated.body, false);
      }
    } catch (_error) {
      setError('Failed to linkify Wiki page.');
    } finally {
      setLinkifying(false);
    }
  };

  useEffect(() => {
    if (!page || draftTriggeredRef.current || searchParams.get('draft') !== '1') return;
    draftTriggeredRef.current = true;
    handleMaintain().finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('draft');
      setSearchParams(next, { replace: true });
    });
    // handleMaintain intentionally omitted so the URL flag triggers once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchParams, setSearchParams]);

  useEffect(() => {
    if (!onDoneEditing) return undefined;
    const handleKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target?.isContentEditable) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onDoneEditing();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDoneEditing]);

  const handleAddSource = async (source) => {
    setError('');
    try {
      const updated = await addWikiSource(pageId, source);
      latestPageRef.current = updated;
      setPage(updated);
    } catch (_error) {
      setError('Failed to attach source.');
    }
  };

  const handleRemoveSource = async (sourceRefId) => {
    setError('');
    try {
      const updated = await removeWikiSource(pageId, sourceRefId);
      latestPageRef.current = updated;
      setPage(updated);
    } catch (_error) {
      setError('Failed to remove source.');
    }
  };

  const handleAsk = async (question) => {
    setAsking(true);
    setError('');
    try {
      const updated = await askWikiPage(pageId, question);
      latestPageRef.current = updated;
      setPage(updated);
    } finally {
      setAsking(false);
    }
  };

  const handleRemoveDiscussion = async (discussionId) => {
    setError('');
    try {
      const updated = await removeWikiDiscussion(pageId, discussionId);
      latestPageRef.current = updated;
      setPage(updated);
    } catch (_error) {
      setError('Failed to remove discussion.');
    }
  };

  const handlePromoteDiscussion = async (discussion, title) => {
    const discussionId = discussion?._id || '';
    if (!discussionId) return;
    setPromotingDiscussionId(discussionId);
    setError('');
    try {
      const result = await promoteWikiDiscussion(pageId, discussionId, { title });
      const createdPage = result?.page || result;
      trackWikiQaPromoted({
        sourcePageId: pageId,
        promotedPageId: createdPage?._id || '',
        discussionId
      });
      if (createdPage?._id) navigate(`/wiki/${createdPage._id}`);
    } catch (_error) {
      setError('Failed to create Wiki page from discussion.');
    } finally {
      setPromotingDiscussionId('');
    }
  };

  const handleDeletePage = async () => {
    const title = page?.title || 'Untitled Wiki Page';
    if (!window.confirm(`Delete "${title}"?`)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDeleting(true);
    setError('');
    try {
      await deleteWikiPage(pageId);
      navigate('/wiki');
    } catch (_error) {
      setError('Failed to delete Wiki page.');
      setDeleting(false);
    }
  };

  // Reset the visit-snapshot capture flag when the user navigates to a
  // different page, so the banner re-evaluates against that page's history.
  useEffect(() => {
    lastVisitCapturedRef.current = false;
    setLastVisit(null);
  }, [pageId]);

  // Diff the previous visit's snapshot against the page's current claim
  // texts. We diff once per page state change so the banner stays accurate
  // as the live page updates (e.g., right after a maintenance run).
  const visitDiff = useMemo(() => {
    if (!lastVisit?.lastViewedAt) return { added: [], removed: [] };
    const currentClaims = extractClaimTexts(page?.body);
    return {
      ...diffClaimSnapshots(lastVisit.claimSnapshot, currentClaims),
      changed: diffClaimLedgerSnapshots(lastVisit.ledgerSnapshot, page?.claims || [])
    };
  }, [lastVisit, page]);

  const handleMarkReviewed = useCallback(() => {
    if (!page) return;
    const next = recordVisit(pageId, page.body, page.claims || []);
    setLastVisit(next);
  }, [page, pageId]);

  const claimLedgerById = useMemo(() => {
    const map = new Map();
    (page?.claims || []).forEach((claim) => {
      if (claim?.claimId) map.set(claim.claimId, claim);
    });
    return map;
  }, [page?.claims]);

  // Prefer the persisted claim ledger for source resolution. The inline mark's
  // citation indexes remain the compatibility path for older pages and drafts.
  const resolvedActiveSources = useMemo(() => {
    if (!activeClaim || !page?.sourceRefs?.length) return [];
    const ledgerClaim = claimLedgerById.get(activeClaim.claimId);
    if (ledgerClaim) {
      const ledgerSources = page.sourceRefs
        .map((source, index) => ({ ...source, citationIndex: index + 1 }))
        .filter(source => (
          claimMatchesSource({ claim: ledgerClaim, source, citations: page.citations || [] })
        ))
        .map(source => ({
          ...source,
          evidenceRole: claimContradictsSource({
            claim: ledgerClaim,
            source,
            citations: page.citations || []
          }) ? 'contradicts' : 'supports'
        }));
      if (ledgerSources.length) return ledgerSources;
    }
    const contradictionIndexSet = new Set(activeClaim.contradictionIndexes || []);
    const supportingFallbackSources = (activeClaim.citationIndexes || [])
      .filter(index => !contradictionIndexSet.has(index))
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index, evidenceRole: 'supports' } : null;
      })
      .filter(Boolean);
    const contradictionFallbackSources = (activeClaim.contradictionIndexes || [])
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index, evidenceRole: 'contradicts' } : null;
      })
      .filter(Boolean);
    return [...supportingFallbackSources, ...contradictionFallbackSources];
  }, [activeClaim, claimLedgerById, page]);

  const activeLedgerClaim = activeClaim ? claimLedgerById.get(activeClaim.claimId) : null;

  if (loading) {
    return <main className="wiki-page"><p className="wiki-index__status">Loading Wiki page...</p></main>;
  }

  if (!page) {
    return (
      <main className="wiki-page">
        <div className="wiki-index__error" role="alert">{error || 'Wiki page not found.'}</div>
      </main>
    );
  }

  return (
    <main className="wiki-page wiki-editor">
      <div className="wiki-editor__topline">
        <Button type="button" variant="secondary" onClick={() => navigate('/wiki')}>Back to Wiki</Button>
        {onDoneEditing ? (
          <Button type="button" variant="secondary" onClick={onDoneEditing}>Done editing</Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSourcePanelOpen(open => !open)}
          aria-expanded={sourcePanelOpen}
          aria-controls="wiki-source-panel"
        >
          {sourcePanelOpen ? 'Hide AI/Sources' : 'Show AI/Sources'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleLinkify} disabled={linkifying}>
          {linkifying ? 'Linkifying...' : 'Linkify'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDeletePage} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete Wiki'}
        </Button>
        {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
      </div>
      <div className={`wiki-editor__layout ${sourcePanelOpen ? '' : 'wiki-editor__layout--panel-collapsed'}`}>
        <section
          className="wiki-editor__main"
          aria-label="Wiki page editor"
          onMouseOver={handleClaimHover}
          onMouseOut={handleClaimLeave}
          onFocus={handleClaimHover}
          onClick={handleClaimClick}
        >
          <WikiAgentPresence
            page={page}
            isMaintaining={maintaining}
            onMaintain={handleMaintain}
          />
          <WikiChangesSinceLastVisit
            lastViewedAt={lastVisit?.lastViewedAt}
            added={visitDiff.added}
            removed={visitDiff.removed}
            changed={visitDiff.changed}
            onMarkReviewed={handleMarkReviewed}
          />
          <input
            className="wiki-editor__title"
            value={page.title || ''}
            onChange={handleTitleChange}
            placeholder="Untitled Wiki Page"
            aria-label="Wiki page title"
          />
          <WikiPageMetaBar page={page} onChange={handleMetaChange} saveStatus={saveStatus} />
          <EditorContent editor={editor} />
          <WikiDiscussions
            discussions={page.discussions || []}
            onRemove={handleRemoveDiscussion}
            onPromote={handlePromoteDiscussion}
            promotingId={promotingDiscussionId}
          />
          <WikiAskComposer onAsk={handleAsk} busy={asking} />
          {activeClaim ? (
            <ClaimCitationPopover
              anchorRect={activeClaim.anchorRect}
              support={activeLedgerClaim?.support || activeClaim.support}
              claim={activeLedgerClaim}
              sources={resolvedActiveSources}
              onClose={() => setActiveClaim(null)}
            />
          ) : null}
        </section>
        {sourcePanelOpen ? (
          <aside className="wiki-editor__rail" aria-label="AI, sources, and backlinks">
            <WikiPageActivityRail
              pageId={pageId}
              page={page}
              onPageUpdate={(updated) => {
                latestPageRef.current = updated;
                setPage(updated);
                if (updated?.body) editor?.commands?.setContent(updated.body, false);
              }}
            />
            <WikiAiSourcePanel
              id="wiki-source-panel"
              page={page}
              maintaining={maintaining}
              onMaintain={handleMaintain}
              onAddSource={handleAddSource}
              onRemoveSource={handleRemoveSource}
              activeSourceIndex={activeSourceIndex}
            />
            <WikiBacklinkPanel pageId={pageId} pageTitle={page.title} />
            {!docHasWikiLinks(page.body) ? (
              <WikiAutolinkSuggestions pageId={pageId} pageTitle={page.title} />
            ) : null}
          </aside>
        ) : null}
      </div>
    </main>
  );
};

export default WikiPageEditor;
