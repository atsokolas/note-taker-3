import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button, TagChip } from '../components/ui';
import { SkeletonCard } from '../components/Skeleton';

const TodayMode = () => {
  const [highlights, setHighlights] = useState([]);
  const [articles, setArticles] = useState([]);
  const [notebook, setNotebook] = useState([]);
  const [activeConcepts, setActiveConcepts] = useState([]);
  const [dailyPrompt, setDailyPrompt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadDesk = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/today', authHeaders());
      setHighlights(res.data?.resurfacedHighlights || []);
      setArticles((res.data?.recentArticles || []).slice(0, 5));
      setNotebook((res.data?.recentNotebookEntries || []).slice(0, 3));
      setActiveConcepts(res.data?.activeConcepts || []);
      setDailyPrompt(res.data?.dailyPrompt || null);
    } catch (err) {
      console.error('Error loading today desk:', err);
      setError(err.response?.data?.error || 'Failed to load today.');
    } finally {
      setLoading(false);
    }
  };

  const reshuffle = async () => {
    try {
      const res = await api.get('/api/resurface', authHeaders());
      setHighlights(res.data?.dailyRandomHighlights || []);
    } catch (err) {
      console.error('Error reshuffling highlights:', err);
      setError(err.response?.data?.error || 'Failed to reshuffle highlights.');
    }
  };

  useEffect(() => {
    loadDesk();
  }, []);

  const createId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const startDailyNote = async () => {
    if (!dailyPrompt?.text) return;
    setCreatingNote(true);
    setError('');
    try {
      const today = new Date();
      const dateLabel = today.toISOString().slice(0, 10);
      const title = `Daily Reflection — ${dateLabel}`;
      const headingBlock = { id: createId(), type: 'heading', level: 2, text: title };
      const promptBlock = { id: createId(), type: 'paragraph', text: dailyPrompt.text };
      const highlightBlocks = highlights.slice(0, 3).map(h => ({
        id: createId(),
        type: 'highlight-ref',
        text: `"${h.text}" — ${h.articleTitle || 'Untitled article'}`,
        highlightId: h._id
      }));

      const contentParts = [
        `<h2>${escapeHtml(title)}</h2>`,
        `<p>${escapeHtml(dailyPrompt.text)}</p>`
      ];
      highlightBlocks.forEach(block => {
        contentParts.push(
          `<blockquote data-highlight-id="${block.highlightId}" data-block-id="${block.id}">${escapeHtml(block.text)}</blockquote>`
        );
      });

      const payload = {
        title,
        content: contentParts.join(''),
        blocks: [headingBlock, promptBlock, ...highlightBlocks]
      };

      const res = await api.post('/api/notebook', payload, authHeaders());
      if (res.data?._id) {
        navigate(`/notebook?entryId=${res.data._id}`);
      }
    } catch (err) {
      console.error('Error creating daily note:', err);
      setError(err.response?.data?.error || 'Failed to start daily note.');
    } finally {
      setCreatingNote(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Today</h1>
        <p className="muted">A calm daily desk to resurface highlights, continue thinking, and keep ideas moving.</p>
      </div>
      {error && <p className="status-message error-message">{error}</p>}
      <div className="section-stack">
        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Resurfaced for you</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted small">{highlights.length} items</span>
              <Button variant="secondary" onClick={reshuffle} disabled={loading}>Reshuffle</Button>
            </div>
          </div>
          <div className="section-stack">
            {loading && (
              <>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <SkeletonCard key={`desk-highlight-${idx}`} />
                ))}
              </>
            )}
            {!loading && highlights.length > 0 ? highlights.map(h => (
              <div key={h._id} className="search-card">
                <div className="search-card-top">
                  <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                  <span className="muted small">{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}</span>
                </div>
                <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
                <div className="highlight-tag-chips">
                  {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
                </div>
              </div>
            )) : !loading && <p className="muted small">No highlights yet. Save a few to see them resurface here.</p>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Continue thinking</span>
            <Link to="/think" className="muted small">Open Notebook</Link>
          </div>
          <div className="section-stack">
            {loading && (
              <>
                {Array.from({ length: 2 }).map((_, idx) => (
                  <SkeletonCard key={`desk-note-${idx}`} />
                ))}
              </>
            )}
            {!loading && notebook.length > 0 ? (
              <>
                <div className="search-card">
                  <div className="search-card-top">
                    <span className="article-title-link">{notebook[0].title || 'Untitled'}</span>
                    <span className="muted small">{notebook[0].updatedAt ? new Date(notebook[0].updatedAt).toLocaleDateString() : ''}</span>
                  </div>
                  <p className="muted small">{(notebook[0].content || '').slice(0, 160)}{(notebook[0].content || '').length > 160 ? '…' : ''}</p>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/notebook?entryId=${notebook[0]._id}`)}
                    style={{ marginTop: 8 }}
                  >
                    Continue this note
                  </Button>
                </div>
                {notebook.slice(1).map(n => (
                  <div key={n._id} className="search-card">
                    <div className="search-card-top">
                      <span className="article-title-link">{n.title || 'Untitled'}</span>
                      <span className="muted small">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : ''}</span>
                    </div>
                    <p className="muted small">{(n.content || '').slice(0, 120)}{(n.content || '').length > 120 ? '…' : ''}</p>
                  </div>
                ))}
              </>
            ) : !loading && <p className="muted small">No notebook entries yet. Start with a quick reflection.</p>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Recent articles</span>
          </div>
          <div className="section-stack">
            {loading && (
              <>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <SkeletonCard key={`desk-article-${idx}`} />
                ))}
              </>
            )}
            {!loading && articles.length > 0 ? articles.map(a => (
              <div key={a._id} className="search-card">
                <div className="search-card-top">
                  <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
                  <span className="muted small">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
                </div>
                <p className="muted small">{a.url}</p>
              </div>
            )) : !loading && <p className="muted small">No recent articles yet.</p>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Active concepts</span>
          </div>
          <div className="highlight-tag-chips" style={{ flexWrap: 'wrap' }}>
            {loading && (
              <>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <span key={`desk-tag-${idx}`} className="tag-chip"> </span>
                ))}
              </>
            )}
            {!loading && activeConcepts.length > 0 ? activeConcepts.map(t => (
              <TagChip key={t.tag} to={`/tags/${encodeURIComponent(t.tag)}`}>{t.tag} <span className="tag-count">{t.count}</span></TagChip>
            )) : !loading && <span className="muted small">No concept activity yet.</span>}
          </div>
        </Card>

        <Card className="search-section">
          <div className="search-section-header">
            <span className="eyebrow">Daily prompt</span>
          </div>
          <div className="section-stack">
            <p className="muted" style={{ margin: 0 }}>{dailyPrompt?.text || 'Your prompt will show up here.'}</p>
            <Button onClick={startDailyNote} disabled={creatingNote || !dailyPrompt}>
              {creatingNote ? 'Starting…' : 'Start a note'}
            </Button>
          </div>
        </Card>
      </div>
    </Page>
  );
};

export default TodayMode;
