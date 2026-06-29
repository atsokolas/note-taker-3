/* Before: highlights and articles could blend visually in Library.
   After: highlights mount on a distinct surface shell so section identity is clearer without layout changes. */
import React, { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuietButton, SectionHeader } from '../ui';
import HighlightCard from '../blocks/HighlightCard';
import useHighlightsQuery from '../../hooks/useHighlightsQuery';
import useTags from '../../hooks/useTags';
import LibraryConceptModal from './LibraryConceptModal';
import LibraryNotebookModal from './LibraryNotebookModal';
import LibraryQuestionModal from './LibraryQuestionModal';
import { createQuestion } from '../../api/questions';
import { createWikiPage } from '../../api/wiki';
import api from '../../api';
import { getAuthHeaders } from '../../hooks/useAuthHeaders';
import VirtualList from '../virtual/VirtualList';
import { createProfilerLogger } from '../../utils/perf';
import useTourSignal from '../../tour/useTourSignal';
import { deleteHighlight } from '../../api/highlights';
import { buildCanonicalArticlePath } from '../../utils/firstInsight';
import {
  buildQuestionPayloadFromHighlights,
  buildQuestionReviewPath,
  buildWikiSectionPayloadFromHighlights,
  writeHighlightActionContext
} from '../../utils/highlightToThinkingModel';
import { openWikiDraft } from '../../utils/wikiCreate';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const GROUP_HEADER_HEIGHT = 34;
const HIGHLIGHT_ROW_HEIGHT = 228;

/**
 * @param {{
 *  folderOptions: Array<{ value: string, label: string }>,
 *  articleOptions: Array<{ value: string, label: string }>,
 *  externalQuery?: string,
 *  onQueryChange?: (value: string) => void,
 *  view?: 'concept' | 'article' | 'untagged'
 * }} props
 */
const LibraryHighlights = ({
  folderOptions,
  articleOptions,
  externalQuery = '',
  onQueryChange,
  view = 'concept',
  onDumpHighlight
}) => {
  const [folderId, setFolderId] = useState('');
  const [tag, setTag] = useState('');
  const [articleId, setArticleId] = useState('');
  const [query, setQuery] = useState(externalQuery || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [cardsExpandVersion, setCardsExpandVersion] = useState(0);
  const [conceptModal, setConceptModal] = useState({ open: false, highlight: null });
  const [notebookModal, setNotebookModal] = useState({ open: false, highlight: null });
  const [questionModal, setQuestionModal] = useState({ open: false, highlight: null });
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [bulkConceptModal, setBulkConceptModal] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const fireTourSignal = useTourSignal();
  const navigate = useNavigate();
  const virtualListRef = useRef(null);
  const virtualHeight = useMemo(() => {
    const viewport = typeof window !== 'undefined' ? window.innerHeight : 0;
    return Math.min(700, Math.max(360, viewport ? viewport - 300 : 580));
  }, []);

  const { tags } = useTags();
  const filters = useMemo(() => ({
    folderId: folderId || undefined,
    tag: tag || undefined,
    articleId: articleId || undefined,
    q: query || undefined
  }), [folderId, tag, articleId, query]);
  const { highlights, loading, error, setHighlights } = useHighlightsQuery(filters, { debounceMs: 260 });

  const rows = useMemo(
    () => highlights.map(h => ({ ...h, tags: h.tags || [] })),
    [highlights]
  );

  const filteredRows = useMemo(() => {
    if (view === 'untagged') return rows.filter(h => !h.tags || h.tags.length === 0);
    return rows;
  }, [rows, view]);

  const groupedRows = useMemo(() => {
    if (view === 'concept') {
      return filteredRows.reduce((acc, highlight) => {
        const tags = highlight.tags?.length ? highlight.tags : ['Untagged'];
        tags.forEach(tagName => {
          if (!acc[tagName]) acc[tagName] = [];
          acc[tagName].push(highlight);
        });
        return acc;
      }, {});
    }
    if (view === 'article') {
      return filteredRows.reduce((acc, highlight) => {
        const key = highlight.articleTitle || 'Untitled article';
        if (!acc[key]) acc[key] = [];
        acc[key].push(highlight);
        return acc;
      }, {});
    }
    return {};
  }, [filteredRows, view]);

  const groupedKeys = useMemo(() => {
    if (view === 'concept' || view === 'article') {
      return Object.keys(groupedRows).sort((a, b) => a.localeCompare(b));
    }
    return [];
  }, [groupedRows, view]);

  const displayRows = useMemo(() => {
    if (view === 'concept' || view === 'article') {
      return groupedKeys.flatMap(key => groupedRows[key]);
    }
    return filteredRows;
  }, [filteredRows, groupedKeys, groupedRows, view]);

  const virtualRows = useMemo(() => {
    if (view === 'concept' || view === 'article') {
      return groupedKeys.flatMap(group => ([
        { kind: 'header', id: `header:${group}`, group },
        ...groupedRows[group].map(highlight => ({
          kind: 'highlight',
          id: `highlight:${highlight._id}`,
          group,
          highlight
        }))
      ]));
    }
    return filteredRows.map(highlight => ({
      kind: 'highlight',
      id: `highlight:${highlight._id}`,
      highlight
    }));
  }, [filteredRows, groupedKeys, groupedRows, view]);

  const selectedHighlight = displayRows[selectedIndex] || null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [folderId, tag, articleId, query, view]);

  useEffect(() => {
    setQuery(externalQuery || '');
  }, [externalQuery]);

  useEffect(() => {
    if (!selectedHighlight || !virtualListRef.current) return;
    const virtualIndex = virtualRows.findIndex(row => (
      row.kind === 'highlight' && String(row.highlight._id) === String(selectedHighlight._id)
    ));
    if (virtualIndex < 0) return;
    virtualListRef.current.scrollToIndex(virtualIndex, 'auto');
  }, [selectedHighlight, virtualRows]);

  const handleKeyDown = useCallback((event) => {
    if (displayRows.length === 0) return;
    if (event.key === 'j') {
      event.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, displayRows.length - 1));
    }
    if (event.key === 'k') {
      event.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    }
    if (event.key === 'Enter' && selectedHighlight) {
      if (event.metaKey || event.ctrlKey) {
        setNotebookModal({ open: true, highlight: selectedHighlight });
      } else if (selectedHighlight.articleId) {
        window.location.href = buildCanonicalArticlePath(selectedHighlight.articleId);
      }
    }
  }, [displayRows.length, selectedHighlight]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleAddConcept = async (highlight, conceptName) => {
    await api.post(`/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`, {
      highlightId: highlight._id
    }, getAuthHeaders());
    setConceptModal({ open: false, highlight: null });
    fireTourSignal('concept_from_highlight', { highlightId: highlight._id, conceptName });
  };

  const handleAddQuestion = async (highlight, conceptName, text) => {
    const created = await createQuestion({
      text,
      conceptName,
      blocks: [
        { id: createId(), type: 'paragraph', text },
        { id: createId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ],
      linkedHighlightIds: [highlight._id]
    });
    if (created?._id) {
      await api.post(`/api/questions/${created._id}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    }
    setQuestionModal({ open: false, highlight: null });
  };

  const handleAttachQuestion = async (highlight, questionId) => {
    await api.post(`/api/questions/${questionId}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setQuestionModal({ open: false, highlight: null });
  };

  const handleSendToNotebook = async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/append-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setNotebookModal({ open: false, highlight: null });
  };

  const handleToggleExpandAll = () => {
    const next = !cardsExpanded;
    setCardsExpanded(next);
    setCardsExpandVersion(prev => prev + 1);
  };

  const handleSelectRow = useCallback((highlightId) => {
    const index = displayRows.findIndex(item => String(item._id) === String(highlightId));
    if (index >= 0) setSelectedIndex(index);
  }, [displayRows]);

  const handleOpenSource = useCallback((highlight) => {
    const articleId = String(highlight?.articleId || '').trim();
    if (!articleId) return;
    window.location.href = buildCanonicalArticlePath(articleId);
  }, []);

  const handleHighlightOrganized = useCallback((updated) => {
    if (!updated?._id) return;
    setHighlights(prev => prev.map(item => (
      String(item._id) === String(updated._id) ? { ...item, ...updated } : item
    )));
  }, [setHighlights]);

  const handleDeleteHighlight = useCallback(async (highlight) => {
    if (!highlight?._id || !highlight?.articleId) return;
    if (!window.confirm('Delete this highlight?')) return;
    await deleteHighlight({ articleId: highlight.articleId, highlightId: highlight._id });
    setHighlights(prev => prev.filter(item => String(item._id) !== String(highlight._id)));
  }, [setHighlights]);

  // Bulk selection helpers --------------------------------------------------
  // Selection is a Set of highlight ids. We keep it independent of filter state
  // so users can build a selection across pages of filters; selection is only
  // explicitly cleared by the user or after a bulk action completes.

  const toggleBulkSelected = useCallback((highlightId) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(highlightId)) next.delete(highlightId);
      else next.add(highlightId);
      return next;
    });
  }, []);

  const handleSelectAllInView = useCallback(() => {
    setBulkSelected(new Set(displayRows.map(row => String(row._id))));
  }, [displayRows]);

  const handleClearBulkSelection = useCallback(() => {
    setBulkSelected(new Set());
  }, []);

  const selectedHighlightObjects = useMemo(() => (
    displayRows.filter(row => bulkSelected.has(String(row._id)))
  ), [displayRows, bulkSelected]);

  useEffect(() => {
    writeHighlightActionContext(selectedHighlightObjects);
  }, [selectedHighlightObjects]);

  const handleBulkTurnIntoQuestion = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      const payload = buildQuestionPayloadFromHighlights({
        highlights: selectedHighlightObjects,
        createId
      });
      const created = await createQuestion(payload);
      for (const highlightId of payload.linkedHighlightIds) {
        if (!created?._id || !highlightId) continue;
        try {
          await api.post(
            `/api/questions/${created._id}/add-highlight`,
            { highlightId },
            getAuthHeaders()
          );
        } catch (_err) {
          // Best-effort graph link; blocks already carry refs.
        }
      }
      setBulkSelected(new Set());
      navigate(buildQuestionReviewPath(created?._id));
    } catch (_err) {
      setBulkError('Could not draft a question from the selected highlights.');
    } finally {
      setBulkBusy(false);
    }
  }, [bulkSelected.size, navigate, selectedHighlightObjects]);

  const handleBulkTurnIntoWikiSection = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      const payload = buildWikiSectionPayloadFromHighlights({
        highlights: selectedHighlightObjects
      });
      const page = await createWikiPage(payload);
      setBulkSelected(new Set());
      openWikiDraft({ navigate, pageId: page._id });
    } catch (_err) {
      setBulkError('Could not draft a wiki section from the selected highlights.');
    } finally {
      setBulkBusy(false);
    }
  }, [bulkSelected.size, navigate, selectedHighlightObjects]);

  const handleBulkDelete = useCallback(async () => {
    if (bulkSelected.size === 0) return;
    if (!window.confirm(`Delete ${bulkSelected.size} highlight${bulkSelected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    setBulkError('');
    const idsByArticle = new Map();
    selectedHighlightObjects.forEach(highlight => {
      if (!highlight?.articleId) return;
      const list = idsByArticle.get(highlight.articleId) || [];
      list.push(highlight._id);
      idsByArticle.set(highlight.articleId, list);
    });
    let succeeded = 0;
    let failed = 0;
    // Iterate single-delete endpoints. No server bulk route exists yet — once
    // it does, swap this for a single call. Sequential keeps the error
    // surface predictable and avoids hammering the API on slow connections.
    for (const [articleId, highlightIds] of idsByArticle.entries()) {
      for (const highlightId of highlightIds) {
        try {
          await deleteHighlight({ articleId, highlightId });
          succeeded += 1;
        } catch (_err) {
          failed += 1;
        }
      }
    }
    setHighlights(prev => prev.filter(item => !bulkSelected.has(String(item._id))));
    setBulkSelected(new Set());
    setBulkBusy(false);
    if (failed > 0) {
      setBulkError(`Deleted ${succeeded}, failed ${failed}.`);
    }
  }, [bulkSelected, selectedHighlightObjects, setHighlights]);

  const handleOpenBulkConceptModal = useCallback(() => {
    if (bulkSelected.size === 0) return;
    setBulkConceptModal(true);
  }, [bulkSelected.size]);

  const handleBulkAddToConcept = useCallback(async (_highlight, conceptName) => {
    // LibraryConceptModal calls this with (highlight, conceptName); ignore the
    // highlight arg here — we apply to every selected highlight.
    if (!conceptName || bulkSelected.size === 0) return;
    setBulkBusy(true);
    setBulkError('');
    let succeeded = 0;
    let failed = 0;
    for (const highlight of selectedHighlightObjects) {
      try {
        await api.post(
          `/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`,
          { highlightId: highlight._id },
          getAuthHeaders()
        );
        succeeded += 1;
      } catch (_err) {
        failed += 1;
      }
    }
    setBulkConceptModal(false);
    setBulkSelected(new Set());
    setBulkBusy(false);
    if (succeeded > 0) {
      fireTourSignal('concept_from_highlight', { conceptName, count: succeeded });
    }
    if (failed > 0) {
      setBulkError(`Added ${succeeded} to "${conceptName}", failed ${failed}.`);
    }
  }, [bulkSelected.size, selectedHighlightObjects, fireTourSignal]);

  return (
    <div className="section-stack library-highlights-surface" data-tour-anchor="library-highlights-panel">
      <SectionHeader
        title="Highlights"
        subtitle="Thumb through and send them forward."
        className="library-section-head is-highlights"
        action={(
          <QuietButton onClick={handleToggleExpandAll}>
            {cardsExpanded ? 'Collapse all' : 'Expand all'}
          </QuietButton>
        )}
      />
      <div className="library-highlight-filters">
        <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
          <option value="">All folders</option>
          {folderOptions.map(folder => (
            <option key={folder.value} value={folder.value}>{folder.label}</option>
          ))}
        </select>
        <select value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="">All concepts</option>
          {tags.map(t => (
            <option key={t.tag} value={t.tag}>{t.tag}</option>
          ))}
        </select>
        <select value={articleId} onChange={(event) => setArticleId(event.target.value)}>
          <option value="">All articles</option>
          {articleOptions.map(article => (
            <option key={article.value} value={article.value}>{article.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search text"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (onQueryChange) onQueryChange(next);
          }}
        />
      </div>
      {loading && <p className="muted small">Loading highlights…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      <Profiler id="LibraryHighlightsRows" onRender={createProfilerLogger('library.highlights-list')}>
        <div className="library-highlights-list">
          {displayRows.length > 0 && (
            <VirtualList
              ref={virtualListRef}
              items={virtualRows}
              height={virtualHeight}
              itemSize={(index, row) => (row.kind === 'header' ? GROUP_HEADER_HEIGHT : HIGHLIGHT_ROW_HEIGHT)}
              overscan={4}
              dynamicItemHeights
              className="library-highlights-list-virtual"
              renderItem={(row) => {
                if (row.kind === 'header') {
                  return (
                    <div key={row.id} className="library-highlight-group-title library-highlight-group-title--virtual">
                      {row.group}
                    </div>
                  );
                }
                const highlight = row.highlight;
                const highlightIdStr = String(highlight._id);
                const isBulkSelected = bulkSelected.has(highlightIdStr);
                return (
                  <div
                    key={row.id}
                    data-highlight-id={highlight._id}
                    className={`library-highlight-row ${selectedHighlight?._id === highlight._id ? 'is-active' : ''} ${isBulkSelected ? 'is-bulk-selected' : ''}`.trim()}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectRow(highlight._id)}
                  >
                    <label
                      className="library-highlight-row__bulk-check"
                      onClick={(event) => event.stopPropagation()}
                      aria-label={isBulkSelected ? 'Deselect this highlight' : 'Select this highlight'}
                    >
                      <input
                        type="checkbox"
                        checked={isBulkSelected}
                        onChange={() => toggleBulkSelected(highlightIdStr)}
                      />
                    </label>
                    <HighlightCard
                      highlight={highlight}
                      compact
                      organizable
                      forceExpandedState={cardsExpanded}
                      forceExpandedVersion={cardsExpandVersion}
                      onOrganized={handleHighlightOrganized}
                      onDelete={handleDeleteHighlight}
                      onDumpToWorkingMemory={onDumpHighlight}
                      onAddConcept={(h) => setConceptModal({ open: true, highlight: h })}
                      onAddNotebook={(h) => setNotebookModal({ open: true, highlight: h })}
                      onAddQuestion={(h) => setQuestionModal({ open: true, highlight: h })}
                    />
                    <div className="library-highlight-row-actions">
                      <QuietButton onClick={() => handleOpenSource(highlight)}>
                        Open Source
                      </QuietButton>
                    </div>
                  </div>
                );
              }}
            />
          )}
          {!loading && displayRows.length === 0 && (
            <p className="muted small">No highlights match those filters.</p>
          )}
        </div>
      </Profiler>

      {bulkSelected.size > 0 && (
        <div
          className="library-highlights-bulk-bar"
          role="region"
          aria-label="Bulk highlight actions"
          data-testid="library-highlights-bulk-bar"
        >
          <div className="library-highlights-bulk-bar__count">
            <strong>{bulkSelected.size}</strong> selected
          </div>
          <div className="library-highlights-bulk-bar__actions">
            <QuietButton
              onClick={handleSelectAllInView}
              disabled={bulkBusy || displayRows.length === 0 || bulkSelected.size === displayRows.length}
            >
              Select all in view
            </QuietButton>
            <QuietButton onClick={handleOpenBulkConceptModal} disabled={bulkBusy}>
              Add to concept…
            </QuietButton>
            <QuietButton onClick={handleBulkTurnIntoQuestion} disabled={bulkBusy}>
              Question draft
            </QuietButton>
            <QuietButton onClick={handleBulkTurnIntoWikiSection} disabled={bulkBusy}>
              Wiki section draft
            </QuietButton>
            <QuietButton
              className="library-highlights-bulk-bar__danger"
              onClick={handleBulkDelete}
              disabled={bulkBusy}
            >
              {bulkBusy ? 'Working…' : 'Delete'}
            </QuietButton>
            <QuietButton onClick={handleClearBulkSelection} disabled={bulkBusy}>
              Clear
            </QuietButton>
          </div>
          {bulkError && (
            <p className="status-message error-message library-highlights-bulk-bar__error">
              {bulkError}
            </p>
          )}
        </div>
      )}

      <LibraryConceptModal
        open={conceptModal.open}
        highlight={conceptModal.highlight}
        onClose={() => setConceptModal({ open: false, highlight: null })}
        onSelect={handleAddConcept}
      />

      {/* Bulk add-to-concept reuses LibraryConceptModal; we feed it a synthetic
          "highlight" representing the selection so the modal's title slot reads
          right, then onSelect routes to handleBulkAddToConcept which iterates
          over the actual selected highlights. */}
      <LibraryConceptModal
        open={bulkConceptModal}
        highlight={{ _id: 'bulk', text: `${bulkSelected.size} highlight${bulkSelected.size === 1 ? '' : 's'}` }}
        onClose={() => setBulkConceptModal(false)}
        onSelect={handleBulkAddToConcept}
      />

      <LibraryNotebookModal
        open={notebookModal.open}
        highlight={notebookModal.highlight}
        onClose={() => setNotebookModal({ open: false, highlight: null })}
        onSend={handleSendToNotebook}
      />

      <LibraryQuestionModal
        open={questionModal.open}
        highlight={questionModal.highlight}
        onClose={() => setQuestionModal({ open: false, highlight: null })}
        onCreate={handleAddQuestion}
        onAttach={handleAttachQuestion}
      />
    </div>
  );
};

export default React.memo(LibraryHighlights);
