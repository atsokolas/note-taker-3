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

const Journey = ({ embedded = false }) => {
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

  const grouped = React.useMemo(() => {
    const groups = new Map();
    items.forEach(item => {
      const date = item.createdAt ? new Date(item.createdAt) : new Date();
      const key = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      if (!groups.has(key)) {
        groups.set(key, { key, items: [], highlightCount: 0, tagCounts: {} });
      }
      const group = groups.get(key);
      group.items.push(item);
      group.highlightCount += item.highlightCount || 0;
      (item.topTags || []).forEach(tag => {
        group.tagCounts[tag] = (group.tagCounts[tag] || 0) + 1;
      });
    });
    return Array.from(groups.values()).map(group => {
      const topTags = Object.entries(group.tagCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([tag]) => tag);
      return { ...group, topTags };
    });
  }, [items]);

  const content = (
    <>
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
          <div className="journey-group-list">
            {items.length === 0 && <p className="muted small">No activity yet.</p>}
            {grouped.map(group => (
              <div key={group.key} className="journey-group">
                <div className="journey-group-header">
                  <div className="journey-group-title">{group.key}</div>
                  <div className="muted small">{group.highlightCount} highlights</div>
                </div>
                <div className="journey-group-tags">
                  {group.topTags.length > 0 ? (
                    group.topTags.map(tag => <TagChip key={`${group.key}-${tag}`}>{tag}</TagChip>)
                  ) : (
                    <span className="muted small">No tags</span>
                  )}
                </div>
                <div className="journey-group-items">
                  {group.items.map(item => (
                    <div key={item._id} className="journey-group-row">
                      <Link to={`/articles/${item._id}`} className="article-title-link">
                        {item.title || 'Untitled article'}
                      </Link>
                      <span className="muted small">{item.highlightCount} highlights</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );

  if (embedded) {
    return content;
  }

  return <Page>{content}</Page>;
};

export default Journey;
