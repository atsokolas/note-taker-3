import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, QuietButton, SectionHeader } from '../ui';
import HighlightBlock from '../blocks/HighlightBlock';
import useHighlightsQuery from '../../hooks/useHighlightsQuery';
import useTags from '../../hooks/useTags';
import LibraryConceptModal from './LibraryConceptModal';
import LibraryNotebookModal from './LibraryNotebookModal';
import LibraryQuestionModal from './LibraryQuestionModal';
import { updateHighlightTags } from '../../api/highlights';
import { createQuestion } from '../../api/questions';
import api from '../../api';
import { getAuthHeaders } from '../../hooks/useAuthHeaders';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

/**
 * @param {{
 *  folderOptions: Array<{ value: string, label: string }>,
 *  articleOptions: Array<{ value: string, label: string }>,
 *  externalQuery?: string,
 *  onQueryChange?: (value: string) => void
 * }} props
 */
const LibraryHighlights = ({ folderOptions, articleOptions, externalQuery = '', onQueryChange }) => {
  const [folderId, setFolderId] = useState('');
  const [tag, setTag] = useState('');
  const [articleId, setArticleId] = useState('');
  const [query, setQuery] = useState(externalQuery || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [conceptModal, setConceptModal] = useState({ open: false, highlight: null });
  const [notebookModal, setNotebookModal] = useState({ open: false, highlight: null });
  const [questionModal, setQuestionModal] = useState({ open: false, highlight: null });
  const listRef = useRef(null);

  const { tags } = useTags();
  const filters = useMemo(() => ({
    folderId: folderId || undefined,
    tag: tag || undefined,
    articleId: articleId || undefined,
    q: query || undefined
  }), [folderId, tag, articleId, query]);
  const { highlights, loading, error, setHighlights } = useHighlightsQuery(filters);

  const rows = useMemo(
    () => highlights.map(h => ({ ...h, tags: h.tags || [] })),
    [highlights]
  );

  const selectedHighlight = rows[selectedIndex] || null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [folderId, tag, articleId, query]);

  useEffect(() => {
    if (externalQuery === query) return;
    setQuery(externalQuery || '');
  }, [externalQuery]);

  useEffect(() => {
    if (!selectedHighlight || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-highlight-id="${selectedHighlight._id}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }, [selectedHighlight]);

  const handleKeyDown = useCallback((event) => {
    if (rows.length === 0) return;
    if (event.key === 'j') {
      event.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, rows.length - 1));
    }
    if (event.key === 'k') {
      event.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    }
    if (event.key === 'Enter' && selectedHighlight) {
      if (event.metaKey || event.ctrlKey) {
        setNotebookModal({ open: true, highlight: selectedHighlight });
      } else if (selectedHighlight.articleId) {
        window.location.href = `/articles/${selectedHighlight.articleId}`;
      }
    }
  }, [rows.length, selectedHighlight]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleAddConcept = async (highlight, conceptName) => {
    const nextTags = Array.from(new Set([...(highlight.tags || []), conceptName]));
    const updated = await updateHighlightTags({
      articleId: highlight.articleId,
      highlightId: highlight._id,
      tags: nextTags
    });
    if (updated) {
      setHighlights(prev => prev.map(h => h._id === highlight._id ? { ...h, tags: updated.tags || nextTags } : h));
    }
    setConceptModal({ open: false, highlight: null });
  };

  const handleAddQuestion = async (highlight, conceptName, text) => {
    await createQuestion({
      text,
      conceptName,
      blocks: [
        { id: createId(), type: 'paragraph', text },
        { id: createId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ]
    });
    setQuestionModal({ open: false, highlight: null });
  };

  const handleSendToNotebook = async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/link-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setNotebookModal({ open: false, highlight: null });
  };

  return (
    <div className="section-stack">
      <SectionHeader title="Highlights" subtitle="Thumb through and send them forward." />
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
      <div className="library-highlights-list" ref={listRef}>
        {rows.map(highlight => (
          <div
            key={highlight._id}
            data-highlight-id={highlight._id}
            className={`library-highlight-row ${selectedHighlight?._id === highlight._id ? 'is-active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedIndex(rows.findIndex(item => item._id === highlight._id))}
          >
            <HighlightBlock highlight={highlight} compact />
            <div className="library-highlight-row-actions">
              <Button
                variant="secondary"
                onClick={() => setConceptModal({ open: true, highlight })}
              >
                Add to Concept
              </Button>
              <Button
                variant="secondary"
                onClick={() => setNotebookModal({ open: true, highlight })}
              >
                Send to Notebook
              </Button>
              <Button
                variant="secondary"
                onClick={() => setQuestionModal({ open: true, highlight })}
              >
                Add to Question
              </Button>
              <QuietButton onClick={() => window.location.href = `/articles/${highlight.articleId}`}>
                Open Source
              </QuietButton>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <p className="muted small">No highlights match those filters.</p>
        )}
      </div>

      <LibraryConceptModal
        open={conceptModal.open}
        highlight={conceptModal.highlight}
        onClose={() => setConceptModal({ open: false, highlight: null })}
        onSelect={handleAddConcept}
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
      />
    </div>
  );
};

export default LibraryHighlights;
