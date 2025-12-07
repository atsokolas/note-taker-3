import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip, Button } from '../components/ui';

const Section = ({ title, items }) => (
  <Card className="search-section">
    <div className="search-section-header">
      <span className="eyebrow">{title}</span>
      <span className="muted small">{items?.length || 0} items</span>
    </div>
    {items && items.length > 0 ? (
      <div className="section-stack">
        {items.map((h) => (
          <div key={h._id} className="search-card">
            <div className="search-card-top">
              <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
              <span className="muted small">{new Date(h.createdAt).toLocaleString()}</span>
            </div>
            <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
            <div className="highlight-tag-chips">
              {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={() => { /* placeholder for send-to-notebook */ }}>Send to Notebook</Button>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p className="muted small">Nothing to show.</p>
    )}
  </Card>
);

const Resurface = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchResurface = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/api/resurface', { headers: { Authorization: `Bearer ${token}` } });
        setData(res.data);
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
        <h1>Old gems, fresh eyes</h1>
        <p className="muted">Pull up highlights from last year, last month, and your marked “important” notes.</p>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {data && (
        <div className="section-stack">
          <Section title="From One Year Ago" items={data.highlightsFrom1YearAgo} />
          <Section title="From Last Month" items={data.highlightsFrom30DaysAgo} />
          <Section title="Important Highlights" items={data.importantHighlights} />
        </div>
      )}
    </Page>
  );
};

export default Resurface;
