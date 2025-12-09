import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip } from '../components/ui';

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

const TagBrowser = () => {
  const [tags, setTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagsError, setTagsError] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [tagDetail, setTagDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [pairs, setPairs] = useState([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [pairsError, setPairsError] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [filteredHighlights, setFilteredHighlights] = useState([]);
  const [loadingFiltered, setLoadingFiltered] = useState(false);
  const [filteredError, setFilteredError] = useState('');

  useEffect(() => {
    const fetchTags = async () => {
      setLoadingTags(true);
      setTagsError('');
      try {
        const token = localStorage.getItem('token');
        const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
        const res = await api.get('/api/tags', authHeaders);
        setTags(res.data || []);
      } catch (err) {
        console.error('Error loading tags:', err);
        setTagsError(err.response?.data?.error || 'Failed to load tags.');
      } finally {
        setLoadingTags(false);
      }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    const fetchPairs = async () => {
      setLoadingPairs(true);
      setPairsError('');
      try {
        const token = localStorage.getItem('token');
        const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
        const res = await api.get('/api/tags/cooccurrence', authHeaders);
        setPairs(res.data || []);
      } catch (err) {
        console.error('Error loading co-occurrence:', err);
        setPairsError(err.response?.data?.error || 'Failed to load co-occurrence.');
      } finally {
        setLoadingPairs(false);
      }
    };
    fetchPairs();
  }, []);

  useEffect(() => {
    const fetchFiltered = async () => {
      if (selectedTags.length === 0) {
        setFilteredHighlights([]);
        setFilteredError('');
        return;
      }
      setLoadingFiltered(true);
      setFilteredError('');
      try {
        const token = localStorage.getItem('token');
        const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
        const res = await api.get(`/api/tags/filter?tags=${encodeURIComponent(selectedTags.join(','))}`, authHeaders);
        setFilteredHighlights(res.data || []);
      } catch (err) {
        console.error('Error loading filtered highlights:', err);
        setFilteredError(err.response?.data?.error || 'Failed to load highlights for those tags.');
      } finally {
        setLoadingFiltered(false);
      }
    };
    fetchFiltered();
  }, [selectedTags]);

  const toggleSelectedTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const selectTag = async (tag) => {
    setSelectedTag(tag);
    setDetailError('');
    setDetailLoading(true);
    try {
      const token = localStorage.getItem('token');
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
      const res = await api.get(`/api/tags/${encodeURIComponent(tag)}`, authHeaders);
      setTagDetail(res.data || null);
    } catch (err) {
      console.error('Error loading tag detail:', err);
      setDetailError(err.response?.data?.error || 'Failed to load tag detail.');
      setTagDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    [tags]
  );

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Tags & collections</p>
        <h1>Tags</h1>
        <p className="muted">Browse your highlights by tag. Click a tag to see its highlights and related tags.</p>
      </div>

      {loadingTags && <p className="status-message">Loading tags...</p>}
      {tagsError && <p className="status-message error-message">{tagsError}</p>}

      <div className="section-stack">
        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">All tags</span>
            <span className="muted small">{tags.length} tags</span>
          </div>
          <div className="tag-grid">
            {sortedTags.map(t => (
              <TagChip
                key={t.tag}
                className={`${selectedTag === t.tag ? 'active' : ''} ${selectedTags.includes(t.tag) ? 'ui-tag-chip-selected' : ''}`}
                onClick={() => toggleSelectedTag(t.tag)}
              >
                {t.tag} <span className="tag-count">{t.count}</span>
              </TagChip>
            ))}
            {sortedTags.length === 0 && !loadingTags && <p className="muted small">No tags yet.</p>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Tag Explorer (Top pairs)</span>
            <span className="muted small">{pairs.length} pairs</span>
          </div>
          {loadingPairs && <p className="status-message">Loading pairs...</p>}
          {pairsError && <p className="status-message error-message">{pairsError}</p>}
          {!loadingPairs && !pairsError && (
            <div className="search-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {pairs.length === 0 && <p className="muted small">No pairs yet.</p>}
              {pairs.map((p, idx) => (
                <div key={`${p.tagA}-${p.tagB}-${idx}`} className="search-card">
                  <div className="highlight-tag-chips" style={{ marginBottom: 6 }}>
                    <TagChip>{p.tagA}</TagChip>
                    <TagChip>{p.tagB}</TagChip>
                  </div>
                  <p className="muted small">{p.count} co-occurrences</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="search-section">
          <div className="search-section-header" style={{ alignItems: 'center', gap: 8 }}>
            <span className="eyebrow">Highlights</span>
            <span className="muted small">{filteredCount} results</span>
            {selectedTags.length === 1 && (
              <Link to={`/tags/${encodeURIComponent(selectedTags[0])}`} className="article-title-link" style={{ marginLeft: 'auto' }}>
                Open concept page
              </Link>
            )}
          </div>
          {loadingFiltered && <p className="status-message">Loading highlights…</p>}
          {filteredError && <p className="status-message error-message">{filteredError}</p>}
          {!loadingFiltered && !filteredError && filteredHighlights.length > 0 ? (
            <div className="search-card-grid">
              {filteredHighlights.map(h => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <span className="feedback-date">{formatRelativeTime(h.createdAt)}</span>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips" style={{ marginBottom: '6px' }}>
                    {h.tags && h.tags.length > 0 ? h.tags.map(tag => (
                      <TagChip key={tag}>{tag}</TagChip>
                    )) : <span className="muted small">No tags</span>}
                  </div>
                  <p className="search-snippet">{h.note ? h.note.slice(0, 120) + (h.note.length > 120 ? '…' : '') : <span className="muted small">No note</span>}</p>
                </div>
              ))}
            </div>
          ) : (
            !loadingFiltered && <p className="muted small">Select a tag to see highlights.</p>
          )}

          {tagDetail?.relatedTags && tagDetail.relatedTags.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <span className="eyebrow">Related tags</span>
              <div className="tag-grid" style={{ marginTop: '8px' }}>
                {tagDetail.relatedTags.map(rt => (
                  <TagChip key={rt.tag} onClick={() => selectTag(rt.tag)}>
                    {rt.tag} <span className="tag-count">{rt.count}</span>
                  </TagChip>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
};

export default TagBrowser;
  const filteredCount = filteredHighlights.length;
