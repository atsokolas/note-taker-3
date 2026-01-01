import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button } from '../components/ui';
import { SkeletonCard } from '../components/Skeleton';
import { fetchWithCache, setCached } from '../utils/cache';

const Collections = ({ embedded = false, filters = {} }) => {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const loadCollections = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const data = await fetchWithCache('collections.list', async () => {
        const res = await api.get('/api/collections', { headers: { Authorization: `Bearer ${token}` } });
        return res.data || [];
      }, { force });
      setCollections(data);
    } catch (err) {
      console.error('Error loading collections:', err);
      setError(err.response?.data?.error || 'Failed to load collections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections(false);
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
      setCollections(prev => {
        const next = [res.data, ...prev];
        setCached('collections.list', next);
        return next;
      });
      navigate(`/collections/${res.data.slug}`);
    } catch (err) {
      console.error('Error creating collection:', err);
      setError(err.response?.data?.error || 'Failed to create collection.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCollections = useMemo(() => {
    const query = (filters.query || '').trim().toLowerCase();
    if (!query) return collections;
    return collections.filter(c => `${c.name || ''} ${c.description || ''}`.toLowerCase().includes(query));
  }, [collections, filters.query]);

  const content = (
    <>
      {!embedded && (
        <div className="page-header">
          <p className="muted-label">Collections</p>
          <h1>Your curated sets</h1>
          <p className="muted">Group articles and highlights into custom collections.</p>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <Button variant="secondary" onClick={() => loadCollections(true)} disabled={loading}>Refresh</Button>
        <Button onClick={() => setShowModal(true)}>New Collection</Button>
      </div>
      {loading && (
        <div className="search-card-grid">
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonCard key={`collection-skeleton-${idx}`} />
          ))}
        </div>
      )}
      {error && <p className="status-message error-message">{error}</p>}

      <div className="search-card-grid">
        {filteredCollections.length === 0 && !loading && <p className="muted small">No collections yet.</p>}
        {filteredCollections.map(c => (
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
    </>
  );

  return embedded ? content : <Page>{content}</Page>;
};

export default Collections;
