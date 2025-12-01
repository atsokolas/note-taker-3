import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

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

const AllHighlights = () => {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // { id, note, tags, articleId }
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
        const res = await api.get('/api/highlights/all', authHeaders);
        setHighlights(res.data || []);
      } catch (err) {
        console.error('Error fetching highlights:', err);
        setError(err.response?.data?.error || 'Failed to load highlights.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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

  const startEdit = (h) => {
    setEditing({
      id: h._id,
      articleId: h.articleId,
      note: h.note || '',
      tags: (h.tags || []).join(', ')
    });
    setSaveMessage('');
    setError('');
  };

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
      setHighlights(prev => prev.map(h => h._id === editing.id ? {
        ...h,
        note: res.data.note,
        tags: res.data.tags
      } : h));
      setSaveMessage('Saved');
      setEditing(null);
    } catch (err) {
      console.error('Error saving highlight:', err);
      setError(err.response?.data?.error || 'Could not save highlight.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-viewer">
      <div className="article-content" style={{ maxWidth: '960px' }}>
        <h1>All Highlights</h1>
        <p className="muted">A unified feed of your newest highlights.</p>
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

        {loading && <p className="status-message">Loading highlights...</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {saveMessage && <p className="status-message success-message">{saveMessage}</p>}

        {!loading && !error && pagedHighlights.map((h) => (
          <div key={h._id} className="feedback-list-item" style={{ borderRadius: '10px' }}>
            <div className="feedback-list-top">
              <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
              <span className="feedback-date">{formatRelativeTime(h.createdAt)}</span>
            </div>
            <p className="highlight-text" style={{ margin: '8px 0', fontWeight: 600 }}>{h.text}</p>
            <p className="feedback-meta" style={{ marginBottom: '6px' }}>
              {h.tags && h.tags.length > 0 ? h.tags.map(tag => (
                <span key={tag} className="highlight-tag" style={{ marginRight: 6 }}>{tag}</span>
              )) : <span className="muted small">No tags</span>}
            </p>
            <p className="feedback-message">
              {h.note ? `${h.note.slice(0, 100)}${h.note.length > 100 ? '…' : ''}` : <span className="muted small">No note</span>}
            </p>
            {editing && editing.id === h._id ? (
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
                <div className="feedback-actions">
                  <button className="notebook-button primary" onClick={saveEdit} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button className="notebook-button" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="feedback-actions">
                <button className="notebook-button" onClick={() => startEdit(h)}>Edit tags/note</button>
              </div>
            )}
          </div>
        ))}

        {!loading && !error && (
          <div className="pagination-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' }}>
            <button className="notebook-button" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
            <span className="muted small">Page {page} of {totalPages}</span>
            <button className="notebook-button" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllHighlights;
