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
  const [data, setData] = useState({ recommended: [], highlighted: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTrending = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/trending', { headers: { Authorization: `Bearer ${token}` } });
        setData(res.data || { recommended: [], highlighted: [] });
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
                <span className="eyebrow">Top Recommended Articles</span>
                <span className="muted small">{data.recommended.length} items</span>
              </div>
              {data.recommended.length > 0 ? (
                <div className="search-card-grid">
                  {data.recommended.map(r => (
                    <div key={r._id} className="search-card">
                      <div className="search-card-top">
                        <span className="article-title-link">{r.articleTitle || 'Untitled article'}</span>
                        <span className="feedback-date">{r.recommendationCount} recs</span>
                      </div>
                      <p className="search-snippet">{r._id}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No recommendations this week.</p>
              )}
            </div>

            <div className="search-section">
              <div className="search-section-header">
                <span className="eyebrow">Most Highlighted Articles</span>
                <span className="muted small">{data.highlighted.length} articles</span>
              </div>
              {data.highlighted.length > 0 ? (
                <div className="search-card-grid">
                  {data.highlighted.map(a => (
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
          </div>
        )}
      </div>
    </div>
  );
};

export default Trending;
