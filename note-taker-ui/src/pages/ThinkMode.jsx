import React, { useState } from 'react';
import Notebook from './Notebook';
import TagBrowser from './TagBrowser';
import AllHighlights from './AllHighlights';
import { Page, Card, Button, TagChip } from '../components/ui';
import api from '../api';
import QuestionModal from '../components/QuestionModal';
import { fetchWithCache } from '../utils/cache';

const ThinkMode = () => {
  const tabs = [
    { key: 'notebook', label: 'Notebook' },
    { key: 'concepts', label: 'Concepts' },
    { key: 'backlinks', label: 'Backlinks' },
    { key: 'questions', label: 'Questions' }
  ];
  const [active, setActive] = useState('notebook');
  const [questions, setQuestions] = useState([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [tags, setTags] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadQuestions = async () => {
    setQuestionLoading(true);
    setQuestionError('');
    try {
      const res = await api.get(`/api/questions?status=open${tagFilter !== 'all' ? `&tag=${encodeURIComponent(tagFilter)}` : ''}`, authHeaders());
      setQuestions(res.data || []);
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to load questions.');
    } finally {
      setQuestionLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const data = await fetchWithCache('tags.list', async () => {
        const res = await api.get('/api/tags', authHeaders());
        return res.data || [];
      });
      setTags(data);
    } catch (err) {
      console.error('Error loading tags for questions:', err);
    }
  };

  const markAnswered = async (q) => {
    try {
      await api.put(`/api/questions/${q._id}`, { status: 'answered' }, authHeaders());
      setQuestions(prev => prev.filter(item => item._id !== q._id));
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to update question.');
    }
  };

  const renderQuestions = () => (
    <div className="section-stack">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => setModalOpen(true)}>New Question</Button>
        <label className="feedback-field" style={{ margin: 0 }}>
          <span>Filter by concept</span>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="compact-select">
            <option value="all">All concepts</option>
            {tags.map(t => <option key={t.tag} value={t.tag}>{t.tag}</option>)}
          </select>
        </label>
      </div>
      {questionLoading && <p className="status-message">Loading questions…</p>}
      {questionError && <p className="status-message error-message">{questionError}</p>}
      <div className="section-stack">
        {questions.length === 0 && !questionLoading && (
          <p className="muted small">No open questions yet.</p>
        )}
        {questions.map(q => (
          <Card key={q._id} className="search-card">
            <div className="search-card-top">
              <span className="article-title-link">{q.text}</span>
              <Button variant="secondary" onClick={() => markAnswered(q)}>Mark answered</Button>
            </div>
            {q.linkedTagName && (
              <div className="highlight-tag-chips" style={{ marginTop: 6 }}>
                <TagChip to={`/tags/${encodeURIComponent(q.linkedTagName)}`}>{q.linkedTagName}</TagChip>
              </div>
            )}
          </Card>
        ))}
      </div>
      <QuestionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(q) => setQuestions(prev => [q, ...prev])}
      />
    </div>
  );

  const renderTab = () => {
    switch (active) {
      case 'concepts':
        return <TagBrowser />;
      case 'backlinks':
        return (
          <div>
            <p className="muted" style={{ marginBottom: 12 }}>
              See where ideas connect. Expand highlights to view references into notebook entries and collections.
            </p>
            <AllHighlights />
          </div>
        );
      case 'questions':
        return renderQuestions();
      default:
        return <Notebook />;
    }
  };

  React.useEffect(() => {
    if (active === 'questions') {
      loadQuestions();
      loadTags();
    }
  }, [active, tagFilter]);

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Think</h1>
        <p className="muted">Write, connect concepts, and see backlinks across your notes and highlights.</p>
      </div>
      <Card className="tab-card">
        <div className="tab-bar">
          {tabs.map(t => (
            <Button
              key={t.key}
              variant={active === t.key ? 'primary' : 'secondary'}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="tab-body">
          {renderTab()}
        </div>
      </Card>
    </Page>
  );
};

export default ThinkMode;
