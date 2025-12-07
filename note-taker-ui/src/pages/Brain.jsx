import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip } from '../components/ui';

const Brain = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/brain/summary', { headers: { Authorization: `Bearer ${token}` } });
        setSummary(res.data);
      } catch (err) {
        console.error('Error loading brain summary:', err);
        setError(err.response?.data?.error || 'Failed to load insights.');
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Brain</p>
        <h1>Reading Patterns</h1>
        <p className="muted">No AI here—just your own data surfaced cleanly.</p>
      </div>

      {loading && <p className="status-message">Loading insights...</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {summary && (
        <div className="section-stack">
          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Top Tags (30d)</span>
            </div>
            <div className="highlight-tag-chips" style={{ gap: 10 }}>
              {summary.topTags && summary.topTags.length > 0 ? (
                summary.topTags.map(t => (
                  <TagChip key={t.tag}>
                    {t.tag} <span className="tag-count">{t.count}</span>
                  </TagChip>
                ))
              ) : (
                <p className="muted small">No tags yet.</p>
              )}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Most Highlighted Articles (30d)</span>
            </div>
            {summary.mostHighlightedArticles && summary.mostHighlightedArticles.length > 0 ? (
              <div className="search-card-grid">
                {summary.mostHighlightedArticles.map(a => (
                  <div key={a.articleId} className="search-card">
                    <div className="search-card-top">
                      <Link to={`/articles/${a.articleId}`} className="article-title-link">{a.title || 'Untitled'}</Link>
                      <span className="feedback-date">{a.count} highlights</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No highlights in the last 30 days.</p>
            )}
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Recent Highlights</span>
              <span className="muted small">{summary.recentHighlights?.length || 0} items</span>
            </div>
            {summary.recentHighlights && summary.recentHighlights.length > 0 ? (
              <div className="section-stack">
                {summary.recentHighlights.map((h, idx) => (
                  <div key={`${h.articleId}-${idx}`} className="search-card">
                    <div className="search-card-top">
                      <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                      <span className="feedback-date">{new Date(h.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                    <div className="highlight-tag-chips" style={{ marginTop: 6 }}>
                      {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No highlights yet.</p>
            )}
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Tag Correlations (30d)</span>
            </div>
            {summary.tagCorrelations && summary.tagCorrelations.length > 0 ? (
              <div className="search-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {summary.tagCorrelations.map((pair, idx) => (
                  <div key={`${pair.tagA}-${pair.tagB}-${idx}`} className="search-card">
                    <div className="highlight-tag-chips" style={{ marginBottom: 6 }}>
                      <TagChip>{pair.tagA}</TagChip>
                      <TagChip>{pair.tagB}</TagChip>
                    </div>
                    <p className="muted small">{pair.count} co-occurrences</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No tag correlations yet.</p>
            )}
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Reading Streak (14d)</span>
            </div>
            <p style={{ fontWeight: 700, fontSize: '18px' }}>
              {summary.readingStreaks || 0} days with highlights in the last 14 days.
            </p>
          </Card>
        </div>
      )}
    </Page>
  );
};

export default Brain;
