import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip } from '../components/ui';

const Today = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await api.get('/api/today', { headers });
        setData(res.data);
      } catch (err) {
        console.error('Error loading today snapshot:', err);
        setError(err.response?.data?.error || 'Failed to load today.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Today</p>
        <h1>Your desk</h1>
        <p className="muted">A calm snapshot of what to revisit and continue.</p>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {data && (
        <div className="section-stack">
          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Resurfaced for you</span>
              <span className="muted small">{data.resurfacedHighlights?.length || 0} items</span>
            </div>
            <div className="section-stack">
              {data.resurfacedHighlights && data.resurfacedHighlights.length > 0 ? data.resurfacedHighlights.map(h => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <span className="muted small">{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips">
                    {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
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
              {data.recentArticles && data.recentArticles.length > 0 ? data.recentArticles.map(a => (
                <div key={a._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                    <span className="muted small">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <p className="muted small">{a.url}</p>
                </div>
              )) : <p className="muted small">No articles yet.</p>}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Continue thinking</span>
            </div>
            <div className="section-stack">
              {data.recentNotebookEntries && data.recentNotebookEntries.length > 0 ? data.recentNotebookEntries.map(n => (
                <div key={n._id} className="search-card">
                  <div className="search-card-top">
                    <span className="article-title-link">{n.title || 'Untitled'}</span>
                    <span className="muted small">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              )) : <p className="muted small">No notebook entries yet.</p>}
            </div>
          </Card>

          {data.brainSummary && (
            <Card className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Insights snapshot</span>
              </div>
              <div className="highlight-tag-chips" style={{ flexWrap: 'wrap' }}>
                {data.brainSummary.topTags && data.brainSummary.topTags.length > 0 ? data.brainSummary.topTags.map(t => (
                  <TagChip key={t.tag}>{t.tag} <span className="tag-count">{t.count}</span></TagChip>
                )) : <span className="muted small">No insights yet.</span>}
              </div>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
};

export default Today;
