import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button, TagChip } from '../components/ui';

const CollectionDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [articles, setArticles] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState('');
  const [selectedHighlight, setSelectedHighlight] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/collections/${slug}`, headers());
      setData(res.data);
    } catch (err) {
      console.error('Error loading collection:', err);
      setError(err.response?.data?.error || 'Failed to load collection.');
    } finally {
      setLoading(false);
    }
  };

  const loadExtras = async () => {
    try {
      const art = await api.get('/get-articles', headers());
      setArticles(art.data || []);
      const hl = await api.get('/api/highlights/all', headers());
      setHighlights(hl.data || []);
    } catch (err) {
      console.error('Error loading lists:', err);
    }
  };

  useEffect(() => {
    load();
    loadExtras();
  }, [slug]);

  const updateCollectionItems = async (newArticleIds, newHighlightIds) => {
    if (!data?.collection?._id) return;
    setSaving(true);
    try {
      await api.put(`/api/collections/${data.collection._id}`, {
        articleIds: newArticleIds,
        highlightIds: newHighlightIds
      }, headers());
      await load();
    } catch (err) {
      console.error('Error updating collection:', err);
      setError(err.response?.data?.error || 'Failed to update collection.');
    } finally {
      setSaving(false);
    }
  };

  const addArticle = () => {
    if (!selectedArticle || !data?.collection) return;
    const ids = new Set(data.collection.articleIds?.map(String) || []);
    ids.add(selectedArticle);
    updateCollectionItems(Array.from(ids), data.collection.highlightIds || []);
    setSelectedArticle('');
  };

  const addHighlight = () => {
    if (!selectedHighlight || !data?.collection) return;
    const ids = new Set(data.collection.highlightIds?.map(String) || []);
    ids.add(selectedHighlight);
    updateCollectionItems(data.collection.articleIds || [], Array.from(ids));
    setSelectedHighlight('');
  };

  const removeArticle = (id) => {
    if (!data?.collection) return;
    const ids = (data.collection.articleIds || []).filter(x => String(x) !== String(id));
    updateCollectionItems(ids, data.collection.highlightIds || []);
  };

  const removeHighlight = (id) => {
    if (!data?.collection) return;
    const ids = (data.collection.highlightIds || []).filter(x => String(x) !== String(id));
    updateCollectionItems(data.collection.articleIds || [], ids);
  };

  const deleteCollection = async () => {
    if (!data?.collection?._id) return;
    if (!window.confirm('Delete this collection?')) return;
    try {
      await api.delete(`/api/collections/${data.collection._id}`, headers());
      navigate('/collections');
    } catch (err) {
      console.error('Error deleting collection:', err);
      setError(err.response?.data?.error || 'Failed to delete.');
    }
  };

  return (
    <Page>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {data && (
        <>
          <div className="page-header">
            <p className="muted-label">Collection</p>
            <h1>{data.collection.name}</h1>
            <p className="muted">{data.collection.description || 'No description'}</p>
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={deleteCollection}>Delete</Button>
            </div>
          </div>

          <div className="section-stack">
            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Articles</span>
                <span className="muted small">{data.articles?.length || 0} items</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select
                  className="compact-select"
                  value={selectedArticle}
                  onChange={(e) => setSelectedArticle(e.target.value)}
                  style={{ minWidth: 220 }}
                >
                  <option value="">Add article…</option>
                  {articles.map(a => (
                    <option key={a._id} value={a._id}>{a.title || a.url}</option>
                  ))}
                </select>
                <Button onClick={addArticle} disabled={!selectedArticle || saving}>Add</Button>
              </div>
              <div className="search-card-grid">
                {(data.articles || []).map(a => (
                  <div key={a._id} className="search-card">
                    <div className="search-card-top">
                      <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || a.url}</Link>
                      <button className="icon-button" onClick={() => removeArticle(a._id)}>×</button>
                    </div>
                    <p className="muted small">{new Date(a.createdAt).toLocaleString()}</p>
                    <p className="muted small">{a.highlightCount || 0} highlights</p>
                  </div>
                ))}
                {(data.articles || []).length === 0 && <p className="muted small">No articles yet.</p>}
              </div>
            </Card>

            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Highlights</span>
                <span className="muted small">{data.highlights?.length || 0} items</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select
                  className="compact-select"
                  value={selectedHighlight}
                  onChange={(e) => setSelectedHighlight(e.target.value)}
                  style={{ minWidth: 240 }}
                >
                  <option value="">Add highlight…</option>
                  {highlights.map(h => (
                    <option key={h._id} value={h._id}>
                      {h.text.slice(0, 60)}…
                    </option>
                  ))}
                </select>
                <Button onClick={addHighlight} disabled={!selectedHighlight || saving}>Add</Button>
              </div>
              <div className="section-stack">
                {(data.highlights || []).map(h => (
                  <div key={h._id} className="search-card">
                    <div className="search-card-top">
                      <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled'}</Link>
                      <button className="icon-button" onClick={() => removeHighlight(h._id)}>×</button>
                    </div>
                    <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                    <div className="highlight-tag-chips">
                      {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
                    </div>
                  </div>
                ))}
                {(data.highlights || []).length === 0 && <p className="muted small">No highlights yet.</p>}
              </div>
            </Card>
          </div>
        </>
      )}
    </Page>
  );
};

export default CollectionDetail;
