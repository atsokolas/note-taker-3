import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Brain from './Brain';
import { Page, Card, Button, TagChip } from '../components/ui';

const TodayMode = () => {
  const tabs = [
    { key: 'desk', label: 'Desk' },
    { key: 'brain', label: 'Brain Snapshot' }
  ];
  const [active, setActive] = useState('desk');

  const [highlights, setHighlights] = useState([]);
  const [articles, setArticles] = useState([]);
  const [notebook, setNotebook] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadDesk = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [resurfaceRes, journeyRes, notebookRes, brainRes] = await Promise.all([
        api.get('/api/resurface', { headers }),
        api.get('/api/journey?range=7d', { headers }),
        api.get('/api/notebook', { headers }),
        api.get('/api/brain/summary', { headers })
      ]);
      setHighlights(resurfaceRes.data?.dailyRandomHighlights || []);
      setArticles((journeyRes.data || []).slice(0, 5));
      const notebookList = (notebookRes.data || []).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      setNotebook(notebookList.slice(0, 3));
      setInsights(brainRes.data || null);
    } catch (err) {
      console.error('Error loading today desk:', err);
      setError(err.response?.data?.error || 'Failed to load today.');
    } finally {
      setLoading(false);
    }
  };

  const reshuffle = async () => {
    try {
      const res = await api.get('/api/resurface', authHeaders());
      setHighlights(res.data?.dailyRandomHighlights || []);
    } catch (err) {
      console.error('Error reshuffling highlights:', err);
      setError(err.response?.data?.error || 'Failed to reshuffle highlights.');
    }
  };

  useEffect(() => {
    if (active === 'desk') loadDesk();
  }, [active]);

  const renderDesk = () => (
    <div className="section-stack">
      <Card className="search-section">
        <div className="search-section-header">
          <span className="eyebrow">Resurfaced for you</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted small">{highlights.length} items</span>
            <Button variant="secondary" onClick={reshuffle} disabled={loading}>Reshuffle</Button>
          </div>
        </div>
        <div className="section-stack">
          {highlights.length > 0 ? highlights.map(h => (
            <div key={h._id} className="search-card">
              <div className="search-card-top">
                <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                <span className="muted small">{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}</span>
              </div>
              <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
              <div className="highlight-tag-chips">
                {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
              </div>
            </div>
          )) : <p className="muted small">No highlights yet.</p>}
        </div>
      </Card>

      <Card className="search-section">
        <div className="search-section-header">
          <span className="eyebrow">Recent articles</span>
        </div>
        <div className="section-stack">
          {articles.length > 0 ? articles.map(a => (
            <div key={a._id} className="search-card">
              <div className="search-card-top">
                <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                <span className="muted small">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
              </div>
              <p className="muted small">{a.url}</p>
            </div>
          )) : <p className="muted small">No recent articles.</p>}
        </div>
      </Card>

      <Card className="search-section">
        <div className="search-section-header">
          <span className="eyebrow">Continue thinking</span>
          <Link to="/think" className="muted small">Open Notebook</Link>
        </div>
        <div className="section-stack">
          {notebook.length > 0 ? notebook.map(n => (
            <div key={n._id} className="search-card">
              <div className="search-card-top">
                <span className="article-title-link">{n.title || 'Untitled'}</span>
                <span className="muted small">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : ''}</span>
              </div>
              <p className="muted small">{(n.content || '').slice(0, 140)}{(n.content || '').length > 140 ? '…' : ''}</p>
            </div>
          )) : <p className="muted small">No notebook entries yet.</p>}
        </div>
      </Card>

      <Card className="search-section">
        <div className="search-section-header">
          <span className="eyebrow">Insights snapshot</span>
        </div>
        <div className="section-stack">
          <div>
            <span className="muted-label">Top tags</span>
            <div className="highlight-tag-chips" style={{ flexWrap: 'wrap' }}>
              {insights?.topTags && insights.topTags.length > 0 ? insights.topTags.map(t => (
                <TagChip key={t.tag}>{t.tag} <span className="tag-count">{t.count}</span></TagChip>
              )) : <span className="muted small">No tags yet.</span>}
            </div>
          </div>
          <div>
            <span className="muted-label">Most highlighted articles</span>
            <div className="section-stack">
              {insights?.mostHighlightedArticles && insights.mostHighlightedArticles.length > 0 ? insights.mostHighlightedArticles.map(a => (
                <div key={a.articleId} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${a.articleId}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                    <span className="muted small">{a.count} highlights</span>
                  </div>
                </div>
              )) : <p className="muted small">No highlight activity yet.</p>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderTab = () => {
    if (active === 'brain') return <Brain />;
    return (
      <>
        {loading && <p className="status-message">Loading…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {renderDesk()}
      </>
    );
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Today</h1>
        <p className="muted">Desk view: resurfaced highlights, recent reading, notebook, and quick insights.</p>
      </div>
      <Card className="tab-card">
        <div className="tab-bar">
          {tabs.map(t => (
            <Button
              key={t.key}
              variant={active === t.key ? 'primary' : 'secondary'}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="tab-body">
          {renderTab()}
        </div>
      </Card>
    </Page>
  );
};

export default TodayMode;
