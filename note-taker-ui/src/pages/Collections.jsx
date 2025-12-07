import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button } from '../components/ui';

const Collections = () => {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const loadCollections = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/collections', { headers: { Authorization: `Bearer ${token}` } });
      setCollections(res.data || []);
    } catch (err) {
      console.error('Error loading collections:', err);
      setError(err.response?.data?.error || 'Failed to load collections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const createCollection = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.post('/api/collections', {
        name: form.name.trim(),
        description: form.description.trim()
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowModal(false);
      setForm({ name: '', description: '' });
      setCollections(prev => [res.data, ...prev]);
      navigate(`/collections/${res.data.slug}`);
    } catch (err) {
      console.error('Error creating collection:', err);
      setError(err.response?.data?.error || 'Failed to create collection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Collections</p>
        <h1>Your curated sets</h1>
        <p className="muted">Group articles and highlights into custom collections.</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button onClick={() => setShowModal(true)}>New Collection</Button>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}

      <div className="search-card-grid">
        {collections.length === 0 && !loading && <p className="muted small">No collections yet.</p>}
        {collections.map(c => (
          <Card key={c._id} className="search-card">
            <div className="search-card-top">
              <Link to={`/collections/${c.slug}`} className="article-title-link">{c.name}</Link>
              <span className="muted small">{new Date(c.updatedAt).toLocaleString()}</span>
            </div>
            <p className="muted">{c.description || 'No description'}</p>
            <p className="muted small" style={{ marginTop: 6 }}>
              {c.articleIds?.length || 0} articles · {c.highlightIds?.length || 0} highlights
            </p>
          </Card>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>New Collection</h3>
              <button className="icon-button" onClick={() => setShowModal(false)}>×</button>
            </div>
            <label className="feedback-field">
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="feedback-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </label>
            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={createCollection} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
};

export default Collections;
