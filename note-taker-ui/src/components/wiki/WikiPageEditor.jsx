import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui';
import {
  addWikiSource,
  deleteWikiPage,
  getWikiPage,
  maintainWikiPage,
  removeWikiSource,
  updateWikiPage
} from '../../api/wiki';
import WikiAiSourcePanel from './WikiAiSourcePanel';
import WikiAgentPresence from './WikiAgentPresence';
import WikiChangesSinceLastVisit from './WikiChangesSinceLastVisit';
import WikiPageMetaBar from './WikiPageMetaBar';
import ClaimCitationPopover from './ClaimCitationPopover';
import Claim, { SUPPORT_STATES } from './extensions/Claim';
import { diffClaimSnapshots, extractClaimTexts, getLastVisitState, recordVisit } from './wikiVisitTracker';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const WikiPageEditor = ({ pageId }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [maintaining, setMaintaining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
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
    const target = event.target.closest?.('span.wiki-claim');
    if (!target) return;
    const claimId = target.getAttribute('data-claim-id') || '';
    const support = target.getAttribute('data-support') || 'supported';
    const indexes = (target.getAttribute('data-citation-indexes') || '')
      .split(',')
      .map(token => Number(token.trim()))
      .filter(Number.isFinite);
    setActiveClaim({
      claimId,
      support: SUPPORT_STATES.has(support) ? support : 'supported',
      citationIndexes: indexes,
      anchorRect: target.getBoundingClientRect()
    });
  }, []);

  const handleClaimLeave = useCallback((event) => {
    // Don't dismiss if the cursor moved into the popover itself.
    const next = event.relatedTarget;
    if (next && (
      next.closest?.('.wiki-claim-popover') ||
      next.closest?.('span.wiki-claim')
    )) return;
    setActiveClaim(null);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write the page. Use the AI/source panel for support.' }),
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
    return diffClaimSnapshots(lastVisit.claimSnapshot, currentClaims);
  }, [lastVisit, page]);

  const handleMarkReviewed = useCallback(() => {
    if (!page) return;
    const next = recordVisit(pageId, page.body);
    setLastVisit(next);
  }, [page, pageId]);

  // Resolve the active claim's citation indexes into the page's sourceRefs.
  // citationIndex is 1-based to match the agent's convention.
  const resolvedActiveSources = useMemo(() => {
    if (!activeClaim || !page?.sourceRefs?.length) return [];
    return activeClaim.citationIndexes
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index } : null;
      })
      .filter(Boolean);
  }, [activeClaim, page]);

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
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSourcePanelOpen(open => !open)}
          aria-expanded={sourcePanelOpen}
          aria-controls="wiki-source-panel"
        >
          {sourcePanelOpen ? 'Hide AI/Sources' : 'Show AI/Sources'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDeletePage} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete Wiki'}
        </Button>
        {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
      </div>
      <div className={`wiki-editor__layout ${sourcePanelOpen ? '' : 'wiki-editor__layout--panel-collapsed'}`}>
        <section className="wiki-editor__main" aria-label="Wiki page editor">
          <WikiAgentPresence
            page={page}
            isMaintaining={maintaining}
            onMaintain={handleMaintain}
          />
          <WikiChangesSinceLastVisit
            lastViewedAt={lastVisit?.lastViewedAt}
            added={visitDiff.added}
            removed={visitDiff.removed}
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
          {activeClaim ? (
            <ClaimCitationPopover
              anchorRect={activeClaim.anchorRect}
              support={activeClaim.support}
              sources={resolvedActiveSources}
              onClose={() => setActiveClaim(null)}
            />
          ) : null}
        </section>
        {sourcePanelOpen ? (
          <WikiAiSourcePanel
            id="wiki-source-panel"
            page={page}
            maintaining={maintaining}
            onMaintain={handleMaintain}
            onAddSource={handleAddSource}
            onRemoveSource={handleRemoveSource}
          />
        ) : null}
      </div>
    </main>
  );
};

export default WikiPageEditor;
