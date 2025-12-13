import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button, TagChip } from '../components/ui';
import { Link } from 'react-router-dom';

const ViewDetail = () => {
  const { id } = useParams();
  const [view, setView] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [viewRes, runRes] = await Promise.all([
        api.get(`/api/views/${id}`, authHeaders()),
        api.get(`/api/views/${id}/run`, authHeaders())
      ]);
      setView(viewRes.data);
      setRunResult(runRes.data);
      setForm({
        name: viewRes.data.name,
        description: viewRes.data.description,
        targetType: viewRes.data.targetType,
        tags: (viewRes.data.filters?.tags || []).join(', '),
        textQuery: viewRes.data.filters?.textQuery || '',
        dateFrom: viewRes.data.filters?.dateFrom ? viewRes.data.filters.dateFrom.slice(0,10) : '',
        dateTo: viewRes.data.filters?.dateTo ? viewRes.data.filters.dateTo.slice(0,10) : '',
        folders: viewRes.data.filters?.folders || []
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load view.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const loadFolders = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/folders', authHeaders());
        setFolders(res.data || []);
      } catch (err) {
        console.error('Error loading folders for view detail:', err);
      }
    };
    loadFolders();
  }, [id]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        targetType: form.targetType,
        filters: {
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          textQuery: form.textQuery.trim(),
          dateFrom: form.dateFrom || null,
          dateTo: form.dateTo || null,
          folders: form.folders || []
        }
      };
      await api.put(`/api/views/${id}`, payload, authHeaders());
      setEditMode(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save view.');
    } finally {
      setSaving(false);
    }
  };

  const renderItems = () => {
    if (!runResult) return null;
    const { targetType, items } = runResult;
    if (targetType === 'articles') {
      return items.map(a => (
        <Card key={a._id} className="search-card">
          <div className="search-card-top">
            <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
            <span className="muted small">{new Date(a.createdAt).toLocaleDateString()}</span>
          </div>
          <p className="muted small">{a.url}</p>
        </Card>
      ));
    }
    if (targetType === 'notebook') {
      return items.map(n => (
        <Card key={n._id} className="search-card">
          <div className="search-card-top">
            <span className="article-title-link">{n.title || 'Untitled'}</span>
            <span className="muted small">{new Date(n.updatedAt || n.createdAt).toLocaleDateString()}</span>
          </div>
          <p className="muted small">{(n.content || '').slice(0,140)}{(n.content || '').length > 140 ? '…' : ''}</p>
        </Card>
      ));
    }
    // highlights
    return items.map(h => (
      <Card key={h._id} className="search-card">
        <div className="search-card-top">
          <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
          <span className="muted small">{new Date(h.createdAt).toLocaleDateString()}</span>
        </div>
        <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
        <div className="highlight-tag-chips">
          {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
        </div>
      </Card>
    ));
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Saved View</p>
        <h1>{view?.name || 'View'}</h1>
        <p className="muted">{view?.description}</p>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {view && form && (
        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Filters</span>
            <Button variant="secondary" onClick={() => setEditMode(!editMode)}>{editMode ? 'Cancel' : 'Edit View'}</Button>
          </div>

          {editMode ? (
            <>
              <label className="feedback-field">
                <span>Name</span>
                <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="feedback-field">
                <span>Description</span>
                <textarea rows={3} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
              </label>
              <label className="feedback-field">
                <span>Target</span>
                <select value={form.targetType} onChange={(e) => setForm(f => ({ ...f, targetType: e.target.value }))} className="compact-select">
                  <option value="highlights">Highlights</option>
                  <option value="articles">Articles</option>
                  <option value="notebook">Notebook</option>
                </select>
              </label>
              <label className="feedback-field">
                <span>Tags (comma separated)</span>
                <input type="text" value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} />
              </label>
              {form.targetType === 'articles' && (
                <div className="feedback-field">
                  <span>Folders</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {folders.map(folder => (
                      <label key={folder._id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={form.folders.includes(folder._id)}
                          onChange={(e) => {
                            setForm(prev => {
                              const exists = prev.folders.includes(folder._id);
                              const next = exists ? prev.folders.filter(id => id !== folder._id) : [...prev.folders, folder._id];
                              return { ...prev, folders: next };
                            });
                          }}
                        />
                        <span>{folder.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="feedback-field">
                <span>Text query</span>
                <input type="text" value={form.textQuery} onChange={(e) => setForm(f => ({ ...f, textQuery: e.target.value }))} />
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <label className="feedback-field" style={{ flex: 1 }}>
                  <span>Date from</span>
                  <input type="date" value={form.dateFrom} onChange={(e) => setForm(f => ({ ...f, dateFrom: e.target.value }))} />
                </label>
                <label className="feedback-field" style={{ flex: 1 }}>
                  <span>Date to</span>
                  <input type="date" value={form.dateTo} onChange={(e) => setForm(f => ({ ...f, dateTo: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
              </div>
            </>
          ) : (
            <div className="highlight-tag-chips" style={{ flexWrap: 'wrap', gap: 8 }}>
              <TagChip>{view.targetType}</TagChip>
              {view.filters?.tags?.map(tag => <TagChip key={tag}>{tag}</TagChip>)}
              {view.filters?.textQuery && <TagChip>Query: {view.filters.textQuery}</TagChip>}
              {view.filters?.dateFrom && <TagChip>From: {new Date(view.filters.dateFrom).toLocaleDateString()}</TagChip>}
              {view.filters?.dateTo && <TagChip>To: {new Date(view.filters.dateTo).toLocaleDateString()}</TagChip>}
            </div>
          )}
        </Card>
      )}

      {runResult && (
        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Results</span>
            <span className="muted small">{runResult.items?.length || 0} items</span>
          </div>
          <div className="section-stack">
            {runResult.items && runResult.items.length > 0 ? renderItems() : <p className="muted small">No items match this view.</p>}
          </div>
        </Card>
      )}
    </Page>
  );
};

export default ViewDetail;
