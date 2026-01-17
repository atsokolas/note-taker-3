import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { PageTitle, Card, Button, TagChip, SectionHeader, QuietButton, SubtleDivider } from '../components/ui';
import { SkeletonCard } from '../components/Skeleton';
import ThreePaneLayout from '../layout/ThreePaneLayout';
import useQuestions from '../hooks/useQuestions';
import { updateHighlightTags } from '../api/highlights';
import { createQuestion } from '../api/questions';
import LibraryConceptModal from '../components/library/LibraryConceptModal';
import LibraryNotebookModal from '../components/library/LibraryNotebookModal';
import LibraryQuestionModal from '../components/library/LibraryQuestionModal';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const IMPORTANT_TAG = 'important';

const TodayMode = () => {
  const [highlights, setHighlights] = useState([]);
  const [articles, setArticles] = useState([]);
  const [notebook, setNotebook] = useState([]);
  const [activeConcepts, setActiveConcepts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [conceptModal, setConceptModal] = useState({ open: false, highlight: null });
  const [notebookModal, setNotebookModal] = useState({ open: false, highlight: null });
  const [questionModal, setQuestionModal] = useState({ open: false, highlight: null });
  const [error, setError] = useState('');
  const [focusFilter, setFocusFilter] = useState('today');
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

  const recentArticle = articles[0] || null;
  const resurfaced = useMemo(() => highlights.slice(0, 5), [highlights]);
  const { questions, loading: questionsLoading, error: questionsError } = useQuestions({ status: 'open', enabled: true });
  const recentConcepts = useMemo(() => activeConcepts.slice(0, 4), [activeConcepts]);

  const filteredHighlights = useMemo(() => {
    if (focusFilter === 'important') {
      return resurfaced.filter(h => (h.tags || []).includes(IMPORTANT_TAG));
    }
    if (focusFilter === 'week') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return resurfaced.filter(h => h.createdAt && new Date(h.createdAt).getTime() >= cutoff);
    }
    return resurfaced;
  }, [focusFilter, resurfaced]);


  const handleAddConcept = async (highlight, conceptName) => {
    const nextTags = Array.from(new Set([...(highlight.tags || []), conceptName]));
    await updateHighlightTags({
      articleId: highlight.articleId,
      highlightId: highlight._id,
      tags: nextTags
    });
    setConceptModal({ open: false, highlight: null });
  };

  const handleAddQuestion = async (highlight, conceptName, text) => {
    await createQuestion({
      text,
      conceptName,
      blocks: [
        { id: createId(), type: 'paragraph', text },
        { id: createId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ]
    });
    setQuestionModal({ open: false, highlight: null });
  };

  const handleSendToNotebook = async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/link-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setNotebookModal({ open: false, highlight: null });
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
      <SectionHeader title="Focus" subtitle="Choose a lens." />
      <div className="today-filter-list">
        <QuietButton className={`list-button ${focusFilter === 'today' ? 'is-active' : ''}`} onClick={() => setFocusFilter('today')}>
          Today
        </QuietButton>
        <QuietButton className={`list-button ${focusFilter === 'week' ? 'is-active' : ''}`} onClick={() => setFocusFilter('week')}>
          This week
        </QuietButton>
        <QuietButton className={`list-button ${focusFilter === 'important' ? 'is-active' : ''}`} onClick={() => setFocusFilter('important')}>
          Important
        </QuietButton>
      </div>
      <SubtleDivider />
      <SectionHeader title="Saved views" subtitle="Optional shortcuts." />
      <p className="muted small">Saved views will live here.</p>
    </div>
  );

  const mainPanel = (
    <div className="section-stack">
      {error && <p className="status-message error-message">{error}</p>}
      <Card className="search-section" data-onboard-id="today-desk">
        <div className="search-section-header">
          <span className="eyebrow">Resurfaced highlights</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted small">{filteredHighlights.length} items</span>
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
          {!loading && filteredHighlights.length > 0 ? filteredHighlights.map(h => (
            <button
              key={h._id}
              className={`today-item ${selectedItem?.id === h._id ? 'is-active' : ''}`}
              onClick={() => setSelectedItem({ type: 'highlight', id: h._id, data: h })}
            >
              <div className="today-item-title">{h.articleTitle || 'Untitled article'}</div>
              <div className="today-item-text">{h.text}</div>
              <div className="today-item-meta">
                {(h.tags || []).length > 0 ? h.tags.map(tag => (
                  <TagChip key={`${h._id}-${tag}`} to={`/tags/${encodeURIComponent(tag)}`}>{tag}</TagChip>
                )) : <span className="muted small">No tags</span>}
              </div>
            </button>
          )) : !loading && <p className="muted small">No highlights yet. Save a few to see them resurface here.</p>}
        </div>
      </Card>

      <Card className="search-section">
        <SectionHeader title="Active Questions" subtitle="Open loops to close." />
        {questionsError && <p className="status-message error-message">{questionsError}</p>}
        {questionsLoading && <p className="muted small">Loading questions…</p>}
        {!questionsLoading && questions.length === 0 && (
          <p className="muted small">No open questions right now.</p>
        )}
        <div className="today-list">
          {questions.slice(0, 5).map(question => (
            <button
              key={question._id}
              className={`today-item ${selectedItem?.id === question._id ? 'is-active' : ''}`}
              onClick={() => setSelectedItem({ type: 'question', id: question._id, data: question })}
            >
              <div className="today-item-title">{question.text}</div>
              <div className="muted small">{question.linkedTagName || 'Uncategorized'}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="search-section">
        <SectionHeader title="Recently edited notes" subtitle="Keep them warm." />
        {notebook.length === 0 && <p className="muted small">No notes yet.</p>}
        <div className="today-list">
          {notebook.slice(0, 4).map(note => (
            <button
              key={note._id}
              className={`today-item ${selectedItem?.id === note._id ? 'is-active' : ''}`}
              onClick={() => setSelectedItem({ type: 'note', id: note._id, data: note })}
            >
              <div className="today-item-title">{note.title || 'Untitled note'}</div>
              <div className="muted small">{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="search-section">
        <SectionHeader title="Recently visited concepts" subtitle="Active threads." />
        {recentConcepts.length === 0 && <p className="muted small">No concept activity yet.</p>}
        <div className="today-list">
          {recentConcepts.map(concept => (
            <button
              key={concept.tag}
              className={`today-item ${selectedItem?.id === concept.tag ? 'is-active' : ''}`}
              onClick={() => setSelectedItem({ type: 'concept', id: concept.tag, data: concept })}
            >
              <div className="today-item-title">{concept.tag}</div>
              <div className="muted small">{concept.count} highlights</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="search-section">
        <SectionHeader title="Continue reading" subtitle="Last opened article." />
        {recentArticle ? (
          <button
            className={`today-item ${selectedItem?.id === recentArticle._id ? 'is-active' : ''}`}
            onClick={() => setSelectedItem({ type: 'article', id: recentArticle._id, data: recentArticle })}
          >
            <div className="today-item-title">{recentArticle.title || 'Untitled article'}</div>
            <div className="muted small">{recentArticle.url || ''}</div>
          </button>
        ) : (
          <p className="muted small">No recent articles yet.</p>
        )}
      </Card>
    </div>
  );

  const rightPanel = (
    <div className="section-stack">
      <SectionHeader title="Context" subtitle="Select an item for actions." />
      {!selectedItem && <p className="muted small">Pick something in Today to see details.</p>}
      {selectedItem?.type === 'highlight' && (
        <>
          <div className="today-context-title">{selectedItem.data.articleTitle || 'Untitled article'}</div>
          <div className="today-context-text">{selectedItem.data.text}</div>
          <div className="section-stack">
            <Button variant="secondary" onClick={() => navigate(`/articles/${selectedItem.data.articleId}`)}>
              Open source
            </Button>
            <Button variant="secondary" onClick={() => setNotebookModal({ open: true, highlight: selectedItem.data })}>
              Send to Notebook
            </Button>
            <Button variant="secondary" onClick={() => setConceptModal({ open: true, highlight: selectedItem.data })}>
              Add to Concept
            </Button>
            <Button variant="secondary" onClick={() => setQuestionModal({ open: true, highlight: selectedItem.data })}>
              Add to Question
            </Button>
            <QuietButton
              onClick={() => markImportant(selectedItem.data)}
              disabled={(selectedItem.data.tags || []).includes(IMPORTANT_TAG)}
            >
              {(selectedItem.data.tags || []).includes(IMPORTANT_TAG) ? 'Important' : 'Mark Important'}
            </QuietButton>
          </div>
        </>
      )}
      {selectedItem?.type === 'question' && (
        <div className="section-stack">
          <div className="today-context-title">{selectedItem.data.text}</div>
          {selectedItem.data.linkedTagName && (
            <TagChip to={`/think?view=concepts&concept=${encodeURIComponent(selectedItem.data.linkedTagName)}`}>
              {selectedItem.data.linkedTagName}
            </TagChip>
          )}
        </div>
      )}
      {selectedItem?.type === 'note' && (
        <div className="section-stack">
          <div className="today-context-title">{selectedItem.data.title || 'Untitled note'}</div>
          <Button variant="secondary" onClick={() => navigate(`/notebook?entryId=${selectedItem.data._id}`)}>
            Open note
          </Button>
        </div>
      )}
      {selectedItem?.type === 'concept' && (
        <div className="section-stack">
          <div className="today-context-title">{selectedItem.data.tag}</div>
          <Button variant="secondary" onClick={() => navigate(`/think?view=concepts&concept=${encodeURIComponent(selectedItem.data.tag)}`)}>
            Open concept
          </Button>
        </div>
      )}
      {selectedItem?.type === 'article' && (
        <div className="section-stack">
          <div className="today-context-title">{selectedItem.data.title || 'Untitled article'}</div>
          <Button variant="secondary" onClick={() => navigate(`/articles/${selectedItem.data._id}`)}>
            Open article
          </Button>
        </div>
      )}
      <SubtleDivider />
      <SectionHeader title="Quick actions" subtitle="Keep momentum." />
      <div className="section-stack">
        <QuietButton onClick={() => navigate('/notebook')}>New Note</QuietButton>
        <QuietButton onClick={() => navigate('/library')}>Open Library</QuietButton>
        <QuietButton onClick={() => navigate('/review?tab=reflections')}>Open Review → Reflections</QuietButton>
        <QuietButton onClick={() => navigate('/export')}>Export</QuietButton>
      </div>
    </div>
  );

  return (
    <>
      <ThreePaneLayout
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        defaultRightOpen
        mainHeader={<PageTitle eyebrow="Mode" title="Today" subtitle="A calm daily desk to resurface highlights, continue thinking, and keep ideas moving." />}
      />
      <LibraryConceptModal
        open={conceptModal.open}
        highlight={conceptModal.highlight}
        onClose={() => setConceptModal({ open: false, highlight: null })}
        onSelect={handleAddConcept}
      />
      <LibraryNotebookModal
        open={notebookModal.open}
        highlight={notebookModal.highlight}
        onClose={() => setNotebookModal({ open: false, highlight: null })}
        onSend={handleSendToNotebook}
      />
      <LibraryQuestionModal
        open={questionModal.open}
        highlight={questionModal.highlight}
        onClose={() => setQuestionModal({ open: false, highlight: null })}
        onCreate={handleAddQuestion}
      />
    </>
  );
};

export default TodayMode;
