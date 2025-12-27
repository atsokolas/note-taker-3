import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip, Button } from '../components/ui';
import QuestionModal from '../components/QuestionModal';
import { SkeletonCard } from '../components/Skeleton';
import { fetchWithCache, setCached } from '../utils/cache';

const PAGE_SIZE = 20;

const formatRelativeTime = (dateString) => {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
};

const HighlightListItem = React.memo(({
  highlight,
  refs,
  onToggleRefs,
  onOpenQuestion,
  onStartEdit,
  editing,
  setEditing,
  onSaveEdit,
  onCancelEdit,
  saving
}) => {
  const isEditing = editing?.id === highlight._id;
  return (
    <Card className="tag-highlight-item">
      <div className="feedback-list-top">
        <Link to={`/articles/${highlight.articleId}`} className="article-title-link">{highlight.articleTitle || 'Untitled article'}</Link>
        <span className="feedback-date">{formatRelativeTime(highlight.createdAt)}</span>
      </div>
      <p className="highlight-text" style={{ margin: '8px 0', fontWeight: 600 }}>{highlight.text}</p>
      <div className="highlight-tag-chips" style={{ marginBottom: '6px' }}>
        {highlight.tags && highlight.tags.length > 0 ? highlight.tags.map(tag => (
          <TagChip key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>
        )) : <span className="muted small">No tags</span>}
      </div>
      <p className="feedback-message">
        {highlight.note ? `${highlight.note.slice(0, 100)}${highlight.note.length > 100 ? '…' : ''}` : <span className="muted small">No note</span>}
      </p>
      <Button variant="secondary" onClick={() => onToggleRefs(highlight._id)} style={{ marginTop: 6 }}>
        {refs[highlight._id]?.show ? 'Hide references' : 'Referenced in'}
      </Button>
      <Button
        variant="secondary"
        onClick={() => onOpenQuestion(highlight)}
        style={{ marginTop: 6 }}
      >
        Add Question
      </Button>
      {refs[highlight._id]?.loading && <p className="muted small">Loading references…</p>}
      {refs[highlight._id]?.error && <p className="status-message error-message">{refs[highlight._id].error}</p>}
      {refs[highlight._id]?.data && refs[highlight._id]?.show && (
        <div className="muted small" style={{ marginTop: 6 }}>
          {refs[highlight._id].data.notebookEntries.length === 0 && refs[highlight._id].data.collections.length === 0 && (
            <p className="muted small">No references yet.</p>
          )}
          {refs[highlight._id].data.notebookEntries.length > 0 && (
            <p>Notebook: {refs[highlight._id].data.notebookEntries.map(n => n.title).join(', ')}</p>
          )}
          {refs[highlight._id].data.collections.length > 0 && (
            <p>Collections: {refs[highlight._id].data.collections.map(c => c.name).join(', ')}</p>
          )}
        </div>
      )}
      {isEditing ? (
        <div className="feedback-body" style={{ paddingTop: 8 }}>
          <label className="feedback-field">
            <span>Tags (comma-separated)</span>
            <input
              type="text"
              value={editing.tags}
              onChange={(e) => setEditing(prev => ({ ...prev, tags: e.target.value }))}
            />
          </label>
          <label className="feedback-field">
            <span>Note</span>
            <textarea
              rows={3}
              value={editing.note}
              onChange={(e) => setEditing(prev => ({ ...prev, note: e.target.value }))}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onSaveEdit} disabled={saving}>Save</Button>
            <Button variant="secondary" onClick={onCancelEdit} disabled={saving}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" onClick={() => onStartEdit(highlight)}>Edit</Button>
        </div>
      )}
    </Card>
  );
});

const AllHighlights = () => {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // { id, note, tags, articleId }
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [refs, setRefs] = useState({});
  const [questionModal, setQuestionModal] = useState({ open: false, highlight: null });

  const fetchData = useCallback(async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
      const data = await fetchWithCache('highlights.all', async () => {
        const res = await api.get('/api/highlights/all', authHeaders);
        return res.data || [];
      }, { force });
      setHighlights(data);
    } catch (err) {
      console.error('Error fetching highlights:', err);
      setError(err.response?.data?.error || 'Failed to load highlights.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const tagOptions = useMemo(() => {
    const set = new Set();
    highlights.forEach(h => (h.tags || []).forEach(t => set.add(t)));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [highlights]);

  const filteredHighlights = useMemo(() => {
    if (selectedTag === 'all') return highlights;
    return highlights.filter(h => Array.isArray(h.tags) && h.tags.includes(selectedTag));
  }, [highlights, selectedTag]);

  const pagedHighlights = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredHighlights.slice(start, start + PAGE_SIZE);
  }, [filteredHighlights, page]);

  const totalPages = Math.max(1, Math.ceil(filteredHighlights.length / PAGE_SIZE));

  const startEdit = useCallback((h) => {
    setEditing({
      id: h._id,
      articleId: h.articleId,
      note: h.note || '',
      tags: (h.tags || []).join(', ')
    });
    setSaveMessage('');
    setError('');
  }, []);

  const cancelEdit = () => {
    setEditing(null);
    setSaveMessage('');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const token = localStorage.getItem('token');
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
      const tagsArray = editing.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      const payload = { note: editing.note, tags: tagsArray };
      const res = await api.patch(`/articles/${editing.articleId}/highlights/${editing.id}`, payload, authHeaders);
      // Update local cache
      setHighlights(prev => {
        const next = prev.map(h => h._id === editing.id ? {
          ...h,
          note: res.data.note,
          tags: res.data.tags
        } : h);
        setCached('highlights.all', next);
        return next;
      });
      setSaveMessage('Saved');
      setEditing(null);
    } catch (err) {
      console.error('Error saving highlight:', err);
      setError(err.response?.data?.error || 'Could not save highlight.');
    } finally {
      setSaving(false);
    }
  };

  const fetchRefs = async (id) => {
    setRefs(prev => ({ ...prev, [id]: { ...(prev[id] || {}), loading: true, error: '', show: true } }));
    try {
      const token = localStorage.getItem('token');
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.get(`/api/highlights/${id}/references`, authHeaders);
      setRefs(prev => ({ ...prev, [id]: { data: res.data, loading: false, error: '', show: true } }));
    } catch (err) {
      setRefs(prev => ({ ...prev, [id]: { data: null, loading: false, error: err.response?.data?.error || 'Failed to load references.', show: true } }));
    }
  };

  const toggleRefs = useCallback((id) => {
    const current = refs[id];
    if (!current || (!current.data && !current.loading)) {
      fetchRefs(id);
    } else {
      setRefs(prev => ({ ...prev, [id]: { ...(prev[id] || {}), show: !current.show } }));
    }
  }, [refs]);

  const openQuestionModal = useCallback((highlight) => {
    setQuestionModal({ open: true, highlight });
  }, []);

  const handleRefresh = () => {
    setPage(1);
    fetchData(true);
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Highlights</p>
        <div className="page-header-row">
          <h1>All Highlights</h1>
          <Button variant="secondary" onClick={handleRefresh} disabled={loading}>Refresh</Button>
        </div>
        <p className="muted">A unified feed of your newest highlights.</p>
      </div>

      <Card className="highlight-tag-card">
        <div className="filter-row" style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
          <label className="feedback-field" style={{ margin: 0, flex: 1 }}>
            <span style={{ display: 'block', marginBottom: '4px' }}>Filter by tag</span>
            <select
              value={selectedTag}
              onChange={(e) => { setSelectedTag(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
            >
              {tagOptions.map(tag => (
                <option key={tag} value={tag}>{tag === 'all' ? 'All tags' : tag}</option>
              ))}
            </select>
          </label>
        </div>

        {loading && (
          <div className="section-stack">
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonCard key={`highlight-skeleton-${idx}`} />
            ))}
          </div>
        )}
        {error && <p className="status-message error-message">{error}</p>}
        {saveMessage && <p className="status-message success-message">{saveMessage}</p>}

        <div className="section-stack">
          {!loading && !error && pagedHighlights.map((h) => (
            <HighlightListItem
              key={h._id}
              highlight={h}
              refs={refs}
              onToggleRefs={toggleRefs}
              onOpenQuestion={openQuestionModal}
              onStartEdit={startEdit}
              editing={editing}
              setEditing={setEditing}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              saving={saving}
            />
          ))}
        </div>

        {!loading && !error && (
          <div className="pagination-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' }}>
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
            <span className="muted small">Page {page} of {totalPages}</span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        )}
      </Card>

      <QuestionModal
        open={questionModal.open}
        onClose={() => setQuestionModal({ open: false, highlight: null })}
        defaults={{
          linkedHighlightId: questionModal.highlight?._id || null,
          linkedTagName: questionModal.highlight?.tags?.[0] || ''
        }}
      />
    </Page>
  );
};

export default AllHighlights;
