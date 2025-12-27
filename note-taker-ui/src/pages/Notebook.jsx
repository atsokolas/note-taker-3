import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import { Page, Card, Button, TagChip } from '../components/ui';

const formatDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

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
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [articles, setArticles] = useState([]);
  const [linkedArticleId, setLinkedArticleId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [splitView, setSplitView] = useState(false);
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
          setLinkedArticleId(res.data[0].linkedArticleId || '');
          setTagsInput((res.data[0].tags || []).join(', '));
          setSelectedFolder(res.data[0].folder || 'all');
        }
      } catch (err) {
        console.error('Error loading notebook entries:', err);
        setError(err.response?.data?.error || 'Failed to load notebook.');
      } finally {
        setLoading(false);
      }
    };
    const fetchFolders = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/notebook/folders', { headers: { Authorization: `Bearer ${token}` } });
        setFolders(res.data || []);
      } catch (err) {
        console.error('Error loading folders:', err);
      }
    };
    const fetchArticles = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/get-articles', { headers: { Authorization: `Bearer ${token}` } });
        setArticles(res.data || []);
      } catch (err) {
        console.error('Error loading articles:', err);
      }
    };
    fetchEntries();
    fetchFolders();
    fetchArticles();
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

  const filteredEntries = useMemo(() => {
    if (selectedFolder === 'all') return entries;
    return entries.filter(e => (e.folder || null) === selectedFolder);
  }, [entries, selectedFolder]);

  const selectEntry = (entry) => {
    setActiveId(entry._id);
    setTitle(entry.title);
    setContent(entry.content);
    setLinkedArticleId(entry.linkedArticleId || '');
    setTagsInput((entry.tags || []).join(', '));
    setSelectedFolder(entry.folder || 'all');
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

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const token = localStorage.getItem('token');
      const res = await api.post('/api/notebook/folders', { name }, { headers: { Authorization: `Bearer ${token}` } });
      setFolders(prev => [...prev, res.data]);
      setNewFolderName('');
      setSelectedFolder(res.data._id);
      setStatus('Folder created');
    } catch (err) {
      console.error('Error creating folder:', err);
      setError(err.response?.data?.error || 'Failed to create folder.');
    }
  };

  const saveEntry = async () => {
    if (!activeId) return;
    setSaving(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const tagsArray = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const payload = {
        title: title || 'Untitled',
        content,
        linkedArticleId: linkedArticleId || null,
        tags: tagsArray,
        folder: selectedFolder === 'all' ? null : selectedFolder
      };
      const res = await api.put(`/api/notebook/${activeId}`, payload, { headers: { Authorization: `Bearer ${token}` } });
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

  const escapeHtml = (str = '') =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const renderMarkdown = (md = '') => {
    const lines = md.split(/\r?\n/);
    let html = '';
    let inList = false;
    lines.forEach((line) => {
      if (/^\s*$/.test(line)) {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        html += '<br />';
        return;
      }
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        const level = heading[1].length;
        html += `<h${level}>${escapeHtml(heading[2])}</h${level}>`;
        return;
      }
      const bullet = line.match(/^(\s*)\*\s+(.*)$/);
      if (bullet) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${escapeHtml(bullet[2])}</li>`;
        return;
      }
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${escapeHtml(line)}</p>`;
    });
    if (inList) html += '</ul>';
    return html;
  };

  const insertTextAtCursor = (text) => {
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

  const insertHighlight = async (h) => {
    const block = buildHighlightBlock(h);
    insertTextAtCursor(block);
    if (activeId && h?._id) {
      try {
        const token = localStorage.getItem('token');
        await api.post(`/api/notebook/${activeId}/link-highlight`, { highlightId: h._id }, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) {
        console.error('Error linking highlight to notebook:', err);
      }
    }
  };

  const buildHighlightBlock = (h) => {
    const notePart = h.note ? `\nNote: ${h.note}` : '';
    return `> ${h.text}\n— ${h.articleTitle || 'Article'}${notePart}\n\n`;
  };

  // Drag/drop support
  const onHighlightDragStart = (e, h) => {
    e.dataTransfer.setData('text/plain', buildHighlightBlock(h));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      insertTextAtCursor(text);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Basic key handling only (no custom caret moves)
  const handleEditorKeyDown = () => {};

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Thinking layer</p>
        <h1 className="notebook-title">Notebook</h1>
      </div>
      {status && <p className="status-message success-message">{status}</p>}
      {error && <p className="status-message error-message">{error}</p>}
      <div className="notebook-toolbar">
        <div className="left">
          <Button variant="secondary" onClick={createEntry} disabled={saving}>New</Button>
          <Button onClick={saveEntry} disabled={saving || !activeId}>{saving ? 'Saving...' : 'Save'}</Button>
          <Button variant="secondary" onClick={deleteEntry} disabled={saving || !activeId}>Delete</Button>
        </div>
      </div>
      <div className="notebook-grid">
        <Card className="notebook-pane">
          <div className="pane-inner">
            <div className="notebook-sidebar-header">
              <div>
                <p className="eyebrow">Entries</p>
                <h2>My notes</h2>
              </div>
            </div>
            <div className="folder-row">
              <input
                type="text"
                placeholder="New folder"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={async (e) => { if (e.key === 'Enter') await createFolder(); }}
              />
              <Button variant="secondary" onClick={async () => await createFolder()} style={{ padding: '10px 12px' }}>+</Button>
            </div>
            <div className="tag-grid pill-row">
              <TagChip className={selectedFolder === 'all' ? 'active' : ''} onClick={() => setSelectedFolder('all')}>
                All <span className="tag-count">{entries.length}</span>
              </TagChip>
              {folders.map(f => (
                <TagChip key={f._id} className={selectedFolder === f._id ? 'active' : ''} onClick={() => setSelectedFolder(f._id)}>
                  {f.name}
                </TagChip>
              ))}
            </div>
            {loading && <p className="status-message">Loading entries...</p>}
            {!loading && filteredEntries.length === 0 && <p className="muted small">No entries yet. Create one to start writing.</p>}
            <ul className="notebook-list">
              {filteredEntries.map(e => (
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
          </div>
        </Card>

        <Card className="notebook-pane">
          <div className="pane-inner">
            {activeId ? (
              <>
                <input
                  type="text"
                  className="notebook-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                />
                <div className="notebook-actions" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  <span className="notebook-updated">Updated {formatDate(entries.find(e => e._id === activeId)?.updatedAt)}</span>
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="compact-select"
                    style={{ maxWidth: '200px' }}
                  >
                    <option value="all">No folder</option>
                    {folders.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                  </select>
                  <select
                    value={linkedArticleId}
                    onChange={(e) => setLinkedArticleId(e.target.value)}
                    className="compact-select"
                    style={{ maxWidth: '240px' }}
                  >
                    <option value="">No article linked</option>
                    {articles.map(a => <option key={a._id} value={a._id}>{a.title}</option>)}
                  </select>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Tags (comma separated)"
                    className="notebook-title-input"
                    style={{ maxWidth: '240px', borderBottom: '1px solid var(--border-color)' }}
                  />
                  <Button variant="secondary" onClick={() => setHighlightModalOpen(true)}>Insert Highlight</Button>
                </div>
                <div className="notebook-editor-actions" style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                  <Button variant={showPreview ? 'secondary' : 'primary'} onClick={() => setShowPreview(p => !p)}>
                    {showPreview ? 'Hide Preview' : 'Show Preview'}
                  </Button>
                  <Button variant={splitView ? 'secondary' : 'primary'} onClick={() => setSplitView(v => !v)}>
                    {splitView ? 'Single View' : 'Split View'}
                  </Button>
                  <span className="muted small">Tip: "* " for bullets (preview to see dots), "## " for headings, Tab/Shift+Tab to indent.</span>
                </div>
                <div
                  className={`notebook-editor-area ${splitView ? 'split' : ''}`}
                  style={{ display: splitView ? 'grid' : 'block', gridTemplateColumns: splitView ? '1fr 1fr' : '1fr', gap: '12px' }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <textarea
                    ref={textareaRef}
                    className="notebook-textarea"
                    style={{ minHeight: 400, width: '100%' }}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write freely..."
                    onKeyDown={handleEditorKeyDown}
                  />
                  {showPreview && (
                    <div
                      className="notebook-preview"
                      style={{ minHeight: 400, padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff', overflowY: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="muted">Select or create an entry to start writing.</p>
            )}
          </div>
        </Card>
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
                <div
                  key={h._id}
                  className="search-card"
                  onClick={() => insertHighlight(h)}
                  style={{ cursor: 'pointer' }}
                  draggable
                  onDragStart={(e) => onHighlightDragStart(e, h)}
                >
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
              <Button variant="secondary" onClick={() => setHighlightModalOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default Notebook;
