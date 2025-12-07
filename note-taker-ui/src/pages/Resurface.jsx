import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip, Button } from '../components/ui';

const Resurface = () => {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResurface = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/resurface', { headers: { Authorization: `Bearer ${token}` } });
        setHighlights(res.data?.dailyRandomHighlights || []);
      } catch (err) {
        console.error('Error loading resurfacing highlights:', err);
        setError(err.response?.data?.error || 'Failed to load resurfacing highlights.');
      } finally {
        setLoading(false);
      }
    };
    fetchResurface();
  }, []);

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Resurface</p>
        <h1>Daily Resurface</h1>
        <p className="muted">Here are 5 highlights randomly resurfaced from your library.</p>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {!loading && !error && (
        <Card className="search-section">
          {highlights.length === 0 ? (
            <p className="muted small">No highlights to resurface yet. Start saving some highlights first.</p>
          ) : (
            <div className="section-stack">
              {highlights.map((h) => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <span className="muted small">{h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}</span>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips">
                    {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Button variant="secondary" as={Link} to={`/articles/${h.articleId}`}>View Article</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </Page>
  );
};

export default Resurface;
