import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui';
import {
  applyWikiAutolink,
  deleteWikiPage,
  getWikiPage,
  listWikiAutolinks,
  maintainWikiPage,
  updateWikiPage
} from '../../api/wiki';
import WikiPageMetaBar from './WikiPageMetaBar';
import ClaimCitationPopover from './ClaimCitationPopover';
import Claim, { SUPPORT_STATES } from './extensions/Claim';
import Pullquote from './extensions/Pullquote';
import WikiLink from './extensions/WikiLink';
import { useNoeisSurface } from '../../surface/NoeisSurfaceContext';
import { buildWikiSurfaceDescriptor } from './wikiSurfaceModel';
import { displayWikiPageTitle, unnamedTitlePreview } from './wikiRepoDossierModel';
import { canMakeThisTheTitle } from './open-sentence/openSentenceModel';

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const normalizeId = (value) => String(value || '').trim();

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
  const [linkifying, setLinkifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [selectionTick, setSelectionTick] = useState(0);
  const saveTimer = useRef(null);
  const pendingSaveRef = useRef({});
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
      setError('That did not save.');
      setSaveStatus('failed');
    } finally {
    }
  };

  const scheduleSave = (updates) => {
    pendingSaveRef.current = { ...pendingSaveRef.current, ...updates };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('dirty');
    saveTimer.current = setTimeout(() => {
      const patch = pendingSaveRef.current;
      pendingSaveRef.current = {};
      saveTimer.current = null;
      savePage(patch);
    }, 650);
  };

  // Hovered/focused claim → drives the citation popover. Stored as the claim
  // attributes plus the anchor rect so the popover can position against it.
  const [activeClaim, setActiveClaim] = useState(null);
  useNoeisSurface(buildWikiSurfaceDescriptor({
    page,
    pageId,
    claimId: activeClaim?.claimId || searchParams.get('claimId') || '',
    revisionId: searchParams.get('revisionId') || '',
    mode: 'edit'
  }));

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write the page.' }),
      Pullquote,
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
      pendingSaveRef.current = {};
    };
  }, [editor, pageId]);

  useEffect(() => {
    if (!editor) return undefined;
    const bump = () => setSelectionTick((n) => n + 1);
    editor.on('selectionUpdate', bump);
    return () => editor.off('selectionUpdate', bump);
  }, [editor]);

  const handleTitleChange = (event) => {
    const title = event.target.value;
    setPage(current => ({ ...(current || latestPageRef.current), title }));
    scheduleSave({ title });
  };

  const selectedWording = (() => {
    if (!editor) return '';
    void selectionTick;
    const selection = editor.state?.selection;
    if (!selection || selection.empty) return '';
    return String(editor.state.doc.textBetween(selection.from, selection.to, ' ') || '')
      .replace(/\s+/g, ' ')
      .trim();
  })();

  const handleMakeThisTheTitle = () => {
    if (!canMakeThisTheTitle(page?.title, selectedWording)) return;
    setPage((current) => ({ ...(current || latestPageRef.current), title: selectedWording }));
    scheduleSave({ title: selectedWording });
  };

  const handleInsertPullquote = () => {
    const chain = editor?.chain?.();
    if (chain?.focus && chain?.insertPullquote && chain?.run) {
      chain.focus().insertPullquote('').run();
      return;
    }
    editor?.commands?.insertPullquote?.('');
  };

  const handleMetaChange = (updates) => {
    setPage(current => ({ ...(current || latestPageRef.current), ...updates }));
    savePage(updates);
  };

  const handleMaintain = async () => {
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
      setError('The sources could not be reread. Try again.');
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

  const handleDeletePage = async () => {
    const title = displayWikiPageTitle(page);
    if (!window.confirm(`Delete "${title}"?`)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setDeleting(true);
    setError('');
    try {
      await deleteWikiPage(pageId);
      navigate('/wiki');
    } catch (_error) {
      setError('That did not save.');
      setDeleting(false);
    }
  };

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
    <main className="wiki-page wiki-editor wiki-editor--workspace">
      <div className="wiki-editor__topline">
        <span className="wiki-editor__mode-label">Editing page</span>
        {onDoneEditing ? (
          <Button type="button" variant="primary" className="wiki-editor__done" onClick={onDoneEditing}>
            Done editing
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={handleLinkify} disabled={linkifying}>
          {linkifying ? 'Linkifying...' : 'Linkify'}
        </Button>
        <Button type="button" variant="secondary" onClick={handleDeletePage} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete Wiki'}
        </Button>
        {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
      </div>
      <div className="wiki-editor__layout">
        <section
          className="wiki-editor__main"
          aria-label="Wiki page editor"
          onMouseOver={handleClaimHover}
          onMouseOut={handleClaimLeave}
          onFocus={handleClaimHover}
        >
          <input
            className="wiki-editor__title"
            value={page.title || ''}
            onChange={handleTitleChange}
            placeholder={unnamedTitlePreview(page) || 'Untitled wiki page'}
            aria-label="Wiki page title"
          />
          <WikiPageMetaBar page={page} onChange={handleMetaChange} saveStatus={saveStatus} />
          <div className="wiki-editor__inline-tools" aria-label="Wiki editor insert tools">
            <Button type="button" variant="secondary" onClick={handleInsertPullquote}>
              Pullquote
            </Button>
            {canMakeThisTheTitle(page?.title, selectedWording) ? (
              <Button type="button" variant="secondary" onClick={handleMakeThisTheTitle}>
                Make this the title
              </Button>
            ) : null}
          </div>
          <EditorContent editor={editor} />
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
      </div>
    </main>
  );
};

export default WikiPageEditor;
