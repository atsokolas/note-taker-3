import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';

const formatDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const Notebook = () => {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [highlightModalOpen, setHighlightModalOpen] = useState(false);
  const [allHighlights, setAllHighlights] = useState([]);
  const [hlSearch, setHlSearch] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/notebook', { headers: { Authorization: `Bearer ${token}` } });
        setEntries(res.data || []);
        if (res.data && res.data.length > 0) {
          setActiveId(res.data[0]._id);
          setTitle(res.data[0].title);
          setContent(res.data[0].content);
        }
      } catch (err) {
        console.error('Error loading notebook entries:', err);
        setError(err.response?.data?.error || 'Failed to load notebook.');
      } finally {
        setLoading(false);
      }
    };
    fetchEntries();
  }, []);

  useEffect(() => {
    if (highlightModalOpen && allHighlights.length === 0) {
      const fetchHighlights = async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await api.get('/api/highlights/all', { headers: { Authorization: `Bearer ${token}` } });
          setAllHighlights(res.data || []);
        } catch (err) {
          console.error('Error loading highlights:', err);
        }
      };
      fetchHighlights();
    }
  }, [highlightModalOpen, allHighlights.length]);

  const filteredHighlights = useMemo(() => {
    const q = hlSearch.toLowerCase();
    if (!q) return allHighlights.slice(0, 100);
    return allHighlights.filter(h =>
      (h.text || '').toLowerCase().includes(q) ||
      (h.note || '').toLowerCase().includes(q) ||
      (h.articleTitle || '').toLowerCase().includes(q)
    ).slice(0, 100);
  }, [allHighlights, hlSearch]);

  const selectEntry = (entry) => {
    setActiveId(entry._id);
    setTitle(entry.title);
    setContent(entry.content);
    setStatus('');
    setError('');
  };

  const createEntry = async () => {
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.post('/api/notebook', { title: 'Untitled', content: '' }, { headers: { Authorization: `Bearer ${token}` } });
      setEntries(prev => [res.data, ...prev]);
      selectEntry(res.data);
      setStatus('New entry created');
    } catch (err) {
      console.error('Error creating entry:', err);
      setError(err.response?.data?.error || 'Failed to create entry.');
    } finally {
      setSaving(false);
    }
  };

  const saveEntry = async () => {
    if (!activeId) return;
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.put(`/api/notebook/${activeId}`, { title: title || 'Untitled', content }, { headers: { Authorization: `Bearer ${token}` } });
      setEntries(prev => prev.map(e => e._id === activeId ? res.data : e));
      setStatus('Saved');
    } catch (err) {
      console.error('Error saving entry:', err);
      setError(err.response?.data?.error || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async () => {
    if (!activeId) return;
    if (!window.confirm('Delete this entry?')) return;
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      await api.delete(`/api/notebook/${activeId}`, { headers: { Authorization: `Bearer ${token}` } });
      const remaining = entries.filter(e => e._id !== activeId);
      setEntries(remaining);
      if (remaining.length > 0) {
        selectEntry(remaining[0]);
      } else {
        setActiveId(null);
        setTitle('');
        setContent('');
      }
      setStatus('Entry deleted');
    } catch (err) {
      console.error('Error deleting entry:', err);
      setError(err.response?.data?.error || 'Failed to delete entry.');
    } finally {
      setSaving(false);
    }
  };

  const insertHighlight = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const next = `${before}${text}${after}`;
    setContent(next);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
    setHighlightModalOpen(false);
  };

  const buildHighlightBlock = (h) => {
    const notePart = h.note ? `\nNote: ${h.note}` : '';
    return `> ${h.text}\n— ${h.articleTitle || 'Article'}${notePart}\n\n`;
  };

  return (
    <div className="content-viewer">
      <div className="article-content" style={{ maxWidth: '1100px' }}>
        <div className="search-section-header" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Notebook</h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="notebook-button" onClick={createEntry} disabled={saving}>New</button>
            <button className="notebook-button primary" onClick={saveEntry} disabled={saving || !activeId}>Save</button>
            <button className="notebook-button" onClick={deleteEntry} disabled={saving || !activeId}>Delete</button>
          </div>
        </div>
        {status && <p className="status-message success-message">{status}</p>}
        {error && <p className="status-message error-message">{error}</p>}
        <div className="notebook-wrapper" style={{ background: 'transparent', border: 'none' }}>
          <aside className="notebook-sidebar" style={{ width: '320px' }}>
            <div className="notebook-sidebar-header">
              <div>
                <p className="eyebrow">Entries</p>
                <h2>My notes</h2>
              </div>
            </div>
            {loading && <p className="status-message">Loading entries...</p>}
            {!loading && entries.length === 0 && <p className="muted small">No entries yet. Create one to start writing.</p>}
            <ul className="notebook-list">
              {entries.map(e => (
                <li
                  key={e._id}
                  className={`notebook-list-item ${activeId === e._id ? 'active' : ''}`}
                  onClick={() => selectEntry(e)}
                >
                  <div className="notebook-list-title">{e.title || 'Untitled'}</div>
                  <div className="notebook-list-meta">
                    <span>{formatDate(e.updatedAt)}</span>
                  </div>
                  <p className="notebook-list-preview">{(e.content || '').slice(0, 80)}</p>
                </li>
              ))}
            </ul>
          </aside>
          <section className="notebook-editor">
            {activeId ? (
              <>
                <input
                  type="text"
                  className="notebook-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                />
                <div className="notebook-actions">
                  <span className="notebook-updated">Updated {formatDate(entries.find(e => e._id === activeId)?.updatedAt)}</span>
                  <button className="notebook-button" onClick={() => setHighlightModalOpen(true)}>Insert Highlight</button>
                </div>
                <textarea
                  ref={textareaRef}
                  className="notebook-textarea"
                  style={{ minHeight: 400 }}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write freely..."
                />
              </>
            ) : (
              <p className="muted">Select or create an entry to start writing.</p>
            )}
          </section>
        </div>
      </div>

      {highlightModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <h3>Insert Highlight</h3>
            <input
              type="text"
              value={hlSearch}
              onChange={(e) => setHlSearch(e.target.value)}
              placeholder="Search highlights..."
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}
            />
            <div className="search-card-grid" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {filteredHighlights.map(h => (
                <div key={h._id} className="search-card" onClick={() => insertHighlight(buildHighlightBlock(h))} style={{ cursor: 'pointer' }}>
                  <div className="search-card-top">
                    <span className="article-title-link">{h.articleTitle || 'Untitled article'}</span>
                    <span className="feedback-date">{formatRelativeTime(h.createdAt)}</span>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <p className="feedback-meta" style={{ marginBottom: '6px' }}>
                    {h.tags && h.tags.length > 0 ? h.tags.map(tag => (
                      <span key={tag} className="highlight-tag" style={{ marginRight: 6 }}>{tag}</span>
                    )) : <span className="muted small">No tags</span>}
                  </p>
                  <p className="search-snippet">{h.note ? h.note.slice(0, 100) + (h.note.length > 100 ? '…' : '') : <span className="muted small">No note</span>}</p>
                </div>
              ))}
              {filteredHighlights.length === 0 && <p className="muted small">No highlights found.</p>}
            </div>
            <div className="modal-actions" style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="notebook-button" onClick={() => setHighlightModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notebook;
