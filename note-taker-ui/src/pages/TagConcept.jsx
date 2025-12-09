import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';
import { Page, Card, TagChip, Button } from '../components/ui';

const TagConcept = () => {
  const { tag } = useParams();
  const [highlights, setHighlights] = useState([]);
  const [relatedTags, setRelatedTags] = useState([]);
  const [concept, setConcept] = useState({ description: '', notes: '', pinnedHighlightIds: [] });
  const [pinnedHighlights, setPinnedHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detailRes, conceptRes] = await Promise.all([
        api.get(`/api/tags/${encodeURIComponent(tag)}`, authHeaders()),
        api.get(`/api/tags/${encodeURIComponent(tag)}/concept`, authHeaders())
      ]);
      setHighlights(detailRes.data?.highlights || []);
      setRelatedTags(detailRes.data?.relatedTags || []);
      setConcept(conceptRes.data?.concept || { description: '', notes: '', pinnedHighlightIds: [] });
      setPinnedHighlights(conceptRes.data?.pinnedHighlights || []);
    } catch (err) {
      console.error('Error loading tag concept:', err);
      setError(err.response?.data?.error || 'Failed to load concept.');
    } finally {
      setLoading(false);
    }
  }, [tag]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const togglePin = (id) => {
    setConcept(prev => {
      const exists = prev.pinnedHighlightIds?.some(hid => String(hid) === String(id));
      const nextIds = exists
        ? prev.pinnedHighlightIds.filter(hid => String(hid) !== String(id))
        : [...(prev.pinnedHighlightIds || []), id];
      return { ...prev, pinnedHighlightIds: nextIds };
    });
  };

  const saveConcept = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/tags/${encodeURIComponent(tag)}/concept`, {
        description: concept.description || '',
        notes: concept.notes || '',
        pinnedHighlightIds: concept.pinnedHighlightIds || []
      }, authHeaders());
      await loadData();
    } catch (err) {
      console.error('Error saving concept:', err);
      setError(err.response?.data?.error || 'Failed to save concept.');
    } finally {
      setSaving(false);
    }
  };

  const isPinned = (id) => concept.pinnedHighlightIds?.some(hid => String(hid) === String(id));

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Concept</p>
        <h1>{tag}</h1>
        <p className="muted">A home for everything you know about this idea.</p>
      </div>
      {loading && <p className="status-message">Loading…</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {!loading && !error && (
        <div className="section-stack">
          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Overview</span>
            </div>
            <label className="feedback-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={concept.description || ''}
                onChange={(e) => setConcept(prev => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <label className="feedback-field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={concept.notes || ''}
                onChange={(e) => setConcept(prev => ({ ...prev, notes: e.target.value }))}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={loadData}>Reset</Button>
              <Button onClick={saveConcept} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Key Highlights (Pinned)</span>
              <span className="muted small">{concept.pinnedHighlightIds?.length || 0} saved</span>
            </div>
            <div className="section-stack">
              {pinnedHighlights.length === 0 && <p className="muted small">Pin highlights below to feature them here.</p>}
              {pinnedHighlights.map(h => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <button className="icon-button" onClick={() => togglePin(h._id)}>×</button>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips">
                    {h.tags && h.tags.length > 0 ? h.tags.map(t => <TagChip key={t}>{t}</TagChip>) : <span className="muted small">No tags</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">All Highlights</span>
              <span className="muted small">{highlights.length} items</span>
            </div>
            <div className="section-stack">
              {highlights.map(h => (
                <div key={h._id} className="search-card">
                  <div className="search-card-top">
                    <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="secondary" onClick={() => togglePin(h._id)}>
                        {isPinned(h._id) ? 'Unpin' : 'Pin'}
                      </Button>
                    </div>
                  </div>
                  <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                  <div className="highlight-tag-chips">
                    {h.tags && h.tags.length > 0 ? h.tags.map(t => <TagChip key={t}>{t}</TagChip>) : <span className="muted small">No tags</span>}
                  </div>
                </div>
              ))}
              {highlights.length === 0 && <p className="muted small">No highlights yet for this tag.</p>}
            </div>
          </Card>

          <Card className="search-section">
            <div className="search-section-header">
              <span className="eyebrow">Related tags</span>
            </div>
            <div className="highlight-tag-chips" style={{ flexWrap: 'wrap' }}>
              {relatedTags && relatedTags.length > 0 ? relatedTags.map(rt => (
                <TagChip key={rt.tag}>{rt.tag} <span className="tag-count">{rt.count}</span></TagChip>
              )) : <span className="muted small">No related tags yet.</span>}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
};

export default TagConcept;
