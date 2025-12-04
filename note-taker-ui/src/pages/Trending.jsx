import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

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

const Trending = () => {
  const [data, setData] = useState({ tags: [], articles: [], latestHighlights: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTrending = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/trending', { headers: { Authorization: `Bearer ${token}` } });
        setData(res.data || { tags: [], articles: [], latestHighlights: [] });
      } catch (err) {
        console.error('Error loading trending:', err);
        setError(err.response?.data?.error || 'Failed to load trending.');
      } finally {
        setLoading(false);
      }
    };
    fetchTrending();
  }, []);

  return (
    <div className="content-viewer">
      <div className="article-content" style={{ maxWidth: '1100px' }}>
        <h1>Trending</h1>
        <p className="muted">Hot tags and highlights from the last 7 days.</p>
        {loading && <p className="status-message">Loading trending...</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {!loading && !error && (
          <div className="search-card-grid" style={{ gridTemplateColumns: '1fr', gap: '14px' }}>
            <div className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Hot Tags This Week</span>
                <span className="muted small">{data.tags.length} tags</span>
              </div>
              <div className="tag-grid">
                {data.tags.map(t => (
                  <Link key={t.tag} to={`/tags`} className="tag-chip">
                    {t.tag} <span className="tag-count">{t.count}</span>
                  </Link>
                ))}
                {data.tags.length === 0 && <p className="muted small">No tag activity yet.</p>}
              </div>
            </div>

            <div className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Most Highlighted Articles</span>
                <span className="muted small">{data.articles.length} articles</span>
              </div>
              {data.articles.length > 0 ? (
                <div className="search-card-grid">
                  {data.articles.map(a => (
                    <div key={a._id} className="search-card">
                      <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                      <p className="feedback-meta">Highlights this week: {a.count}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No highlights this week.</p>
              )}
            </div>

            <div className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Latest Highlights</span>
                <span className="muted small">{data.latestHighlights.length} items</span>
              </div>
              {data.latestHighlights.length > 0 ? (
                <div className="search-card-grid">
                  {data.latestHighlights.map(h => (
                    <div key={h._id} className="search-card">
                      <div className="search-card-top">
                        <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                        <span className="feedback-date">{formatRelativeTime(h.createdAt)}</span>
                      </div>
                      <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                      <p className="feedback-meta" style={{ marginBottom: '6px' }}>
                        {h.tags && h.tags.length > 0 ? h.tags.map(tag => (
                          <span key={tag} className="highlight-tag" style={{ marginRight: 6 }}>{tag}</span>
                        )) : <span className="muted small">No tags</span>}
                      </p>
                      <p className="search-snippet">{h.note ? h.note.slice(0, 120) + (h.note.length > 120 ? '…' : '') : <span className="muted small">No note</span>}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No highlights yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Trending;
