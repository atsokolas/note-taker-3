import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button, TagChip } from '../components/ui';

const Views = () => {
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    targetType: 'highlights',
    tags: '',
    textQuery: '',
    dateFrom: '',
    dateTo: ''
  });
  const navigate = useNavigate();

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadViews = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/views', authHeaders());
      setViews(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load views.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadViews();
  }, []);

  const createView = async () => {
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
          dateTo: form.dateTo || null
        }
      };
      const res = await api.post('/api/views', payload, authHeaders());
      setViews(prev => [res.data, ...prev]);
      setShowModal(false);
      setForm({ name: '', description: '', targetType: 'highlights', tags: '', textQuery: '', dateFrom: '', dateTo: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create view.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Saved Views</p>
        <h1>Smart Folders</h1>
        <p className="muted">Reusable filters across articles, highlights, or notebook entries.</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button onClick={() => setShowModal(true)}>New View</Button>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      <div className="search-card-grid">
        {views.length === 0 && !loading && <p className="muted small">No views yet.</p>}
        {views.map(v => (
          <Card key={v._id} className="search-card" onClick={() => navigate(`/views/${v._id}`)} style={{ cursor: 'pointer' }}>
            <div className="search-card-top">
              <span className="article-title-link">{v.name}</span>
              <span className="muted small">{v.targetType}</span>
            </div>
            <p className="muted">{v.description || 'No description'}</p>
            {v.filters?.tags && v.filters.tags.length > 0 && (
              <div className="highlight-tag-chips" style={{ marginTop: 6 }}>
                {v.filters.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>)}
              </div>
            )}
          </Card>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3>New Saved View</h3>
              <button className="icon-button" onClick={() => setShowModal(false)}>×</button>
            </div>
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
            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={createView} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default Views;
