import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuietButton, SectionHeader } from '../ui';
import HighlightCard from '../blocks/HighlightCard';
import useHighlightsQuery from '../../hooks/useHighlightsQuery';
import useTags from '../../hooks/useTags';
import LibraryConceptModal from './LibraryConceptModal';
import LibraryNotebookModal from './LibraryNotebookModal';
import LibraryQuestionModal from './LibraryQuestionModal';
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
 *  onQueryChange?: (value: string) => void,
 *  view?: 'concept' | 'article' | 'untagged'
 * }} props
 */
const LibraryHighlights = ({ folderOptions, articleOptions, externalQuery = '', onQueryChange, view = 'concept' }) => {
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
  const { highlights, loading, error } = useHighlightsQuery(filters);

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

  const selectedHighlight = displayRows[selectedIndex] || null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [folderId, tag, articleId, query, view]);

  useEffect(() => {
    setQuery(externalQuery || '');
  }, [externalQuery]);

  useEffect(() => {
    if (!selectedHighlight || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-highlight-id="${selectedHighlight._id}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }, [selectedHighlight]);

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
        window.location.href = `/articles/${selectedHighlight.articleId}`;
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
        {(view === 'concept' || view === 'article') ? groupedKeys.map(group => (
          <div key={group} className="library-highlight-group-block">
            <div className="library-highlight-group-title">{group}</div>
            {groupedRows[group].map(highlight => (
              <div
                key={highlight._id}
                data-highlight-id={highlight._id}
                className={`library-highlight-row ${selectedHighlight?._id === highlight._id ? 'is-active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedIndex(displayRows.findIndex(item => item._id === highlight._id))}
              >
                <HighlightCard
                  highlight={highlight}
                  compact
                  onAddConcept={(h) => setConceptModal({ open: true, highlight: h })}
                  onAddNotebook={(h) => setNotebookModal({ open: true, highlight: h })}
                  onAddQuestion={(h) => setQuestionModal({ open: true, highlight: h })}
                />
                <div className="library-highlight-row-actions">
                  <QuietButton onClick={() => window.location.href = `/articles/${highlight.articleId}`}>
                    Open Source
                  </QuietButton>
                </div>
              </div>
            ))}
          </div>
        )) : filteredRows.map(highlight => (
          <div
            key={highlight._id}
            data-highlight-id={highlight._id}
            className={`library-highlight-row ${selectedHighlight?._id === highlight._id ? 'is-active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedIndex(displayRows.findIndex(item => item._id === highlight._id))}
          >
            <HighlightCard
              highlight={highlight}
              compact
              onAddConcept={(h) => setConceptModal({ open: true, highlight: h })}
              onAddNotebook={(h) => setNotebookModal({ open: true, highlight: h })}
              onAddQuestion={(h) => setQuestionModal({ open: true, highlight: h })}
            />
            <div className="library-highlight-row-actions">
              <QuietButton onClick={() => window.location.href = `/articles/${highlight.articleId}`}>
                Open Source
              </QuietButton>
            </div>
          </div>
        ))}
        {!loading && displayRows.length === 0 && (
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
        onAttach={handleAttachQuestion}
      />
    </div>
  );
};

export default LibraryHighlights;
