import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Page, Card, Button, TagChip, SectionHeader, QuietButton, SubtleDivider } from '../components/ui';
import { SkeletonCard } from '../components/Skeleton';
import WorkspaceShell from '../layouts/WorkspaceShell';

const IMPORTANT_TAG = 'important';

const TodayMode = () => {
  const [highlights, setHighlights] = useState([]);
  const [articles, setArticles] = useState([]);
  const [notebook, setNotebook] = useState([]);
  const [activeConcepts, setActiveConcepts] = useState([]);
  const [dailyPrompt, setDailyPrompt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [sendingHighlight, setSendingHighlight] = useState(null);
  const [noteTargets, setNoteTargets] = useState({});
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

  const reshuffle = React.useCallback(async () => {
    try {
      const res = await api.get('/api/resurface', authHeaders());
      setHighlights(res.data?.dailyRandomHighlights || []);
    } catch (err) {
      console.error('Error reshuffling highlights:', err);
      setError(err.response?.data?.error || 'Failed to reshuffle highlights.');
    }
  }, []);

  useEffect(() => {
    loadDesk();
  }, []);

  useEffect(() => {
    const handleReshuffle = () => reshuffle();
    window.addEventListener('today-reshuffle', handleReshuffle);
    return () => window.removeEventListener('today-reshuffle', handleReshuffle);
  }, [reshuffle]);

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

  const recentArticle = articles[0] || null;
  const recentNote = notebook[0] || null;
  const topConcept = activeConcepts[0] || null;
  const resurfaced = useMemo(() => highlights.slice(0, 5), [highlights]);

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

  const createNoteFromHighlight = async (highlight) => {
    const title = highlight.articleTitle ? `Note — ${highlight.articleTitle}` : 'New note';
    const headingBlock = { id: createId(), type: 'heading', level: 2, text: title };
    const highlightBlock = {
      id: createId(),
      type: 'highlight-ref',
      text: `"${highlight.text}" — ${highlight.articleTitle || 'Untitled article'}`,
      highlightId: highlight._id
    };
    const contentParts = [
      `<h2>${escapeHtml(title)}</h2>`,
      `<blockquote data-highlight-id="${highlight._id}" data-block-id="${highlightBlock.id}">${escapeHtml(highlightBlock.text)}</blockquote>`
    ];
    const payload = {
      title,
      content: contentParts.join(''),
      blocks: [headingBlock, highlightBlock]
    };
    const res = await api.post('/api/notebook', payload, authHeaders());
    return res.data?._id || null;
  };

  const sendHighlightToNote = async (highlight) => {
    const target = noteTargets[highlight._id] || 'new';
    setSendingHighlight(highlight._id);
    setError('');
    try {
      if (target === 'new') {
        const newId = await createNoteFromHighlight(highlight);
        if (newId) navigate(`/notebook?entryId=${newId}`);
        return;
      }
      await api.post(`/api/notebook/${target}/link-highlight`, { highlightId: highlight._id }, authHeaders());
      navigate(`/notebook?entryId=${target}`);
    } catch (err) {
      console.error('Error sending highlight to note:', err);
      setError(err.response?.data?.error || 'Failed to send highlight.');
    } finally {
      setSendingHighlight(null);
    }
  };

  const markImportant = async (highlight) => {
    const articleId = highlight.articleId || highlight.article?._id;
    if (!articleId) return;
    const existing = Array.isArray(highlight.tags) ? highlight.tags : [];
    if (existing.includes(IMPORTANT_TAG)) return;
    const updatedTags = [...existing, IMPORTANT_TAG];
    try {
      await api.patch(`/articles/${articleId}/highlights/${highlight._id}`, { tags: updatedTags }, authHeaders());
      setHighlights(prev => prev.map(h => (h._id === highlight._id ? { ...h, tags: updatedTags } : h)));
    } catch (err) {
      console.error('Error marking highlight important:', err);
      setError(err.response?.data?.error || 'Failed to mark important.');
    }
  };

  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Focus" subtitle="Pick one thread and keep moving." />
      <div className="desk-focus-list">
        <div className="desk-focus-item">
          <div className="desk-focus-title">Continue Reading</div>
          {loading ? (
            <span className="muted small">Loading…</span>
          ) : recentArticle ? (
            <Link to={`/articles/${recentArticle._id}`} className="article-title-link">
              {recentArticle.title || 'Untitled article'}
            </Link>
          ) : (
            <span className="muted small">No recent articles yet.</span>
          )}
        </div>
        <div className="desk-focus-item">
          <div className="desk-focus-title">Continue Thinking</div>
          {loading ? (
            <span className="muted small">Loading…</span>
          ) : recentNote ? (
            <Link to={`/notebook?entryId=${recentNote._id}`} className="article-title-link">
              {recentNote.title || 'Untitled note'}
            </Link>
          ) : (
            <span className="muted small">No notebook entries yet.</span>
          )}
        </div>
        <div className="desk-focus-item">
          <div className="desk-focus-title">Active Concept</div>
          {loading ? (
            <span className="muted small">Loading…</span>
          ) : topConcept ? (
            <TagChip to={`/tags/${encodeURIComponent(topConcept.tag)}`}>
              {topConcept.tag} <span className="tag-count">{topConcept.count}</span>
            </TagChip>
          ) : (
            <span className="muted small">No concept activity yet.</span>
          )}
        </div>
      </div>
    </div>
  );

  const mainPanel = (
    <div className="section-stack">
      {error && <p className="status-message error-message">{error}</p>}
      <Card className="search-section" data-onboard-id="today-desk">
        <div className="search-section-header">
          <span className="eyebrow">Resurfaced highlights</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted small">{resurfaced.length} items</span>
            <QuietButton onClick={reshuffle} disabled={loading}>Reshuffle</QuietButton>
          </div>
        </div>
        <div className="section-stack">
          {loading && (
            <>
              {Array.from({ length: 5 }).map((_, idx) => (
                <SkeletonCard key={`desk-highlight-${idx}`} />
              ))}
            </>
          )}
          {!loading && resurfaced.length > 0 ? resurfaced.map(h => (
            <div key={h._id} className="search-card">
              <div className="search-card-top">
                <Link to={`/articles/${h.articleId}`} className="article-title-link">{h.articleTitle || 'Untitled article'}</Link>
                <span className="muted small">{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}</span>
              </div>
              <p className="highlight-text" style={{ margin: '6px 0', fontWeight: 600 }}>{h.text}</p>
              <div className="highlight-tag-chips">
                {h.tags && h.tags.length > 0 ? h.tags.map(tag => <TagChip key={tag} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>) : <span className="muted small">No tags</span>}
              </div>
              <div className="desk-action-row">
                <Link to={`/articles/${h.articleId}`} className="muted small">Open Article</Link>
                <div className="desk-action-group">
                  <select
                    value={noteTargets[h._id] || 'new'}
                    onChange={(e) => setNoteTargets(prev => ({ ...prev, [h._id]: e.target.value }))}
                    className="compact-select"
                  >
                    <option value="new">New note</option>
                    {notebook.map(n => (
                      <option key={n._id} value={n._id}>{n.title || 'Untitled note'}</option>
                    ))}
                  </select>
                  <QuietButton onClick={() => sendHighlightToNote(h)} disabled={sendingHighlight === h._id}>
                    {sendingHighlight === h._id ? 'Sending…' : 'Send to Note'}
                  </QuietButton>
                </div>
                <QuietButton
                  onClick={() => markImportant(h)}
                  disabled={(h.tags || []).includes(IMPORTANT_TAG)}
                >
                  {(h.tags || []).includes(IMPORTANT_TAG) ? 'Important' : 'Mark Important'}
                </QuietButton>
              </div>
            </div>
          )) : !loading && <p className="muted small">No highlights yet. Save a few to see them resurface here.</p>}
        </div>
      </Card>

      <Card className="search-section">
        <SectionHeader title="Continue Reading" subtitle="Your last opened article." />
        {recentArticle ? (
          <div className="search-card desk-row-card">
            <div>
              <div className="article-title-link">{recentArticle.title || 'Untitled article'}</div>
              <p className="muted small">{recentArticle.url || ''}</p>
            </div>
            <Button variant="secondary" onClick={() => navigate(`/articles/${recentArticle._id}`)}>
              Open
            </Button>
          </div>
        ) : (
          <p className="muted small">No recent articles yet.</p>
        )}
      </Card>

      <Card className="search-section">
        <SectionHeader title="Continue Thinking" subtitle="Your last edited note." />
        {recentNote ? (
          <div className="search-card desk-row-card">
            <div>
              <div className="article-title-link">{recentNote.title || 'Untitled note'}</div>
              <p className="muted small">{(recentNote.content || '').slice(0, 120)}{(recentNote.content || '').length > 120 ? '…' : ''}</p>
            </div>
            <Button variant="secondary" onClick={() => navigate(`/notebook?entryId=${recentNote._id}`)}>
              Open
            </Button>
          </div>
        ) : (
          <p className="muted small">No notebook entries yet.</p>
        )}
      </Card>

      <Card className="search-section">
        <SectionHeader title="Daily Prompt" subtitle="One small nudge." />
        <p className="muted" style={{ margin: 0 }}>{dailyPrompt?.text || 'Your prompt will show up here.'}</p>
        <div style={{ marginTop: 10 }}>
          <Button onClick={startDailyNote} disabled={creatingNote || !dailyPrompt}>
            {creatingNote ? 'Starting…' : 'Start a note'}
          </Button>
        </div>
      </Card>
    </div>
  );

  const rightPanel = (
    <div className="section-stack">
      <SectionHeader title="Quick actions" subtitle="Keep momentum." />
      <div className="section-stack">
        <QuietButton onClick={() => navigate('/notebook')}>New Note</QuietButton>
        <QuietButton onClick={() => navigate('/library')}>Open Library</QuietButton>
        <QuietButton onClick={() => navigate('/review?tab=reflections')}>Open Review → Reflections</QuietButton>
        <QuietButton onClick={() => navigate('/export')}>Export</QuietButton>
      </div>
      <SubtleDivider />
      <SectionHeader title="Recent articles" subtitle="Quick picks." />
      <div className="section-stack">
        {loading && (
          <>
            {Array.from({ length: 2 }).map((_, idx) => (
              <SkeletonCard key={`desk-article-${idx}`} />
            ))}
          </>
        )}
        {!loading && articles.length > 0 ? articles.slice(0, 2).map(a => (
          <div key={a._id} className="search-card">
            <div className="search-card-top">
              <Link to={`/articles/${a._id}`} className="article-title-link">{a.title || 'Untitled article'}</Link>
              <span className="muted small">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
            </div>
            <p className="muted small">{a.url}</p>
          </div>
        )) : !loading && <p className="muted small">No recent articles yet.</p>}
      </div>
    </div>
  );

  return (
    <Page>
      <WorkspaceShell
        title="Today"
        subtitle="A calm daily desk to resurface highlights, continue thinking, and keep ideas moving."
        eyebrow="Mode"
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        defaultRightOpen
      />
    </Page>
  );
};

export default TodayMode;
