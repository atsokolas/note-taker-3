import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip, Button } from '../components/ui';

const ranges = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' }
];

const Journey = () => {
  const [items, setItems] = useState([]);
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchJourney = async (selectedRange) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get(`/api/journey?range=${selectedRange}`, { headers: { Authorization: `Bearer ${token}` } });
      setItems(res.data || []);
    } catch (err) {
      console.error('Error loading journey:', err);
      setError(err.response?.data?.error || 'Failed to load journey.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJourney(range);
  }, [range]);

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Journey</p>
        <h1>Your reading trail</h1>
        <p className="muted">Recent articles, their highlights, and the tags that define them.</p>
      </div>

      <Card className="search-section">
        <div className="search-section-header" style={{ alignItems: 'center' }}>
          <span className="eyebrow">Range</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {ranges.map(r => (
              <Button
                key={r.value}
                variant={range === r.value ? 'primary' : 'secondary'}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
        {loading && <p className="status-message">Loading…</p>}
        {error && <p className="status-message error-message">{error}</p>}
        {!loading && !error && (
          <div className="search-card-grid">
            {items.length === 0 && <p className="muted small">No activity yet.</p>}
            {items.map(item => (
              <div key={item._id} className="search-card">
                <div className="search-card-top">
                  <Link to={`/articles/${item._id}`} className="article-title-link">{item.title || 'Untitled article'}</Link>
                  <span className="feedback-date">{item.highlightCount} highlights</span>
                </div>
                <p className="muted small">{new Date(item.createdAt).toLocaleString()}</p>
                <div className="highlight-tag-chips" style={{ marginTop: 6 }}>
                  {item.topTags && item.topTags.length > 0 ? (
                    item.topTags.map(tag => <TagChip key={tag}>{tag}</TagChip>)
                  ) : (
                    <span className="muted small">No tags</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
};

export default Journey;
