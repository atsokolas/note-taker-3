import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageTitle, SectionHeader, QuietButton, Button, TagChip } from '../components/ui';
import useConcepts from '../hooks/useConcepts';
import useConcept from '../hooks/useConcept';
import useConceptRelated from '../hooks/useConceptRelated';
import ReferencesPanel from '../components/ReferencesPanel';
import { updateConcept, updateConceptPins } from '../api/concepts';
import NotebookList from '../components/think/notebook/NotebookList';
import NotebookEditor from '../components/think/notebook/NotebookEditor';
import NotebookContext from '../components/think/notebook/NotebookContext';
import useQuestions from '../hooks/useQuestions';
import { createQuestion, updateQuestion } from '../api/questions';
import QuestionInput from '../components/think/questions/QuestionInput';
import QuestionList from '../components/think/questions/QuestionList';
import HighlightCard from '../components/blocks/HighlightCard';
import AddToConceptModal from '../components/think/concepts/AddToConceptModal';
import QuestionEditor from '../components/think/questions/QuestionEditor';
import ThreePaneLayout from '../layout/ThreePaneLayout';
import useHighlights from '../hooks/useHighlights';
import useTags from '../hooks/useTags';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import LibraryConceptModal from '../components/library/LibraryConceptModal';
import LibraryNotebookModal from '../components/library/LibraryNotebookModal';
import LibraryQuestionModal from '../components/library/LibraryQuestionModal';

const ThinkMode = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryConcept = searchParams.get('concept') || '';
  const allowedViews = useMemo(() => ['notebook', 'concepts', 'questions'], []);
  const resolveActiveView = (params) => {
    const rawView = params.get('tab') || '';
    if (allowedViews.includes(rawView)) return rawView;
    return params.get('entryId') ? 'notebook' : 'concepts';
  };
  const [activeView, setActiveView] = useState(() => resolveActiveView(searchParams));
  const [search, setSearch] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [conceptError, setConceptError] = useState('');
  const [highlightOffset, setHighlightOffset] = useState(0);
  const [recentHighlights, setRecentHighlights] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeNotebookEntry, setActiveNotebookEntry] = useState(null);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const { highlightMap, highlights: allHighlights } = useHighlights();
  const { tags } = useTags();
  const [addModal, setAddModal] = useState({ open: false, mode: 'highlight' });
  const notebookInsertRef = useRef(null);
  const questionInsertRef = useRef(null);
  const [highlightQuery, setHighlightQuery] = useState('');
  const [highlightTag, setHighlightTag] = useState('');
  const [highlightArticle, setHighlightArticle] = useState('');
  const [questionStatus, setQuestionStatus] = useState('open');
  const [questionConceptFilter, setQuestionConceptFilter] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [highlightConceptModal, setHighlightConceptModal] = useState({ open: false, highlight: null });
  const [highlightNotebookModal, setHighlightNotebookModal] = useState({ open: false, highlight: null });
  const [highlightQuestionModal, setHighlightQuestionModal] = useState({ open: false, highlight: null });

  const [notebookEntries, setNotebookEntries] = useState([]);
  const [notebookActiveId, setNotebookActiveId] = useState('');
  const [notebookLoadingList, setNotebookLoadingList] = useState(false);
  const [notebookLoadingEntry, setNotebookLoadingEntry] = useState(false);
  const [notebookSaving, setNotebookSaving] = useState(false);
  const [notebookListError, setNotebookListError] = useState('');
  const [notebookEntryError, setNotebookEntryError] = useState('');

  const createBlockId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
  };

  const { concepts, loading: conceptsLoading, error: conceptsError } = useConcepts();
  const selectedName = queryConcept || concepts[0]?.name || '';
  const { concept, loading: conceptLoading, error: conceptLoadError, refresh, setConcept } = useConcept(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });
  const { related, loading: relatedLoading, error: relatedError } = useConceptRelated(selectedName, {
    enabled: activeView === 'concepts' && Boolean(selectedName),
    limit: 20,
    offset: highlightOffset
  });
  const {
    questions: conceptQuestions,
    loading: questionsLoading,
    error: questionsError,
    setQuestions: setConceptQuestions
  } = useQuestions({
    conceptName: selectedName,
    status: 'open',
    enabled: activeView === 'concepts' && Boolean(selectedName)
  });

  const filteredConcepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return concepts;
    return concepts.filter(c => c.name.toLowerCase().includes(q));
  }, [concepts, search]);

  const pinnedHighlightIds = concept?.pinnedHighlightIds || [];
  const pinnedArticleIds = concept?.pinnedArticleIds || [];
  const pinnedHighlights = concept?.pinnedHighlights || [];
  const pinnedArticles = concept?.pinnedArticles || [];
  const pinnedNotes = concept?.pinnedNotes || [];

  const questionQuery = useQuestions({
    status: questionStatus,
    tag: questionConceptFilter || undefined,
    enabled: activeView === 'questions'
  });
  const { questions: allQuestions, loading: allQuestionsLoading, error: allQuestionsError, setQuestions: setAllQuestions } = questionQuery;

  const activeQuestionData = useMemo(
    () => allQuestions.find(q => q._id === activeQuestionId) || null,
    [allQuestions, activeQuestionId]
  );

  useEffect(() => {
    if (activeView !== 'questions') return;
    if (allQuestions.length === 0) {
      setActiveQuestionId('');
      setActiveQuestion(null);
      return;
    }
    const requestedId = searchParams.get('questionId');
    const target = requestedId && allQuestions.find(q => q._id === requestedId);
    if (target) {
      setActiveQuestionId(target._id);
      setActiveQuestion(target);
      return;
    }
    if (!activeQuestionId || !allQuestions.some(q => q._id === activeQuestionId)) {
      setActiveQuestionId(allQuestions[0]._id);
      setActiveQuestion(allQuestions[0]);
    }
  }, [activeView, allQuestions, activeQuestionId, searchParams]);

  useEffect(() => {
    if (activeView !== 'questions') return;
    setActiveQuestion(activeQuestionData);
  }, [activeView, activeQuestionData]);

  const loadNotebookEntries = useCallback(async () => {
    setNotebookLoadingList(true);
    setNotebookListError('');
    try {
      const res = await api.get('/api/notebook', getAuthHeaders());
      const data = res.data || [];
      setNotebookEntries(data);
      if (data.length === 0) {
        setNotebookActiveId('');
        setActiveNotebookEntry(null);
      } else if (searchParams.get('entryId') && data.some(entry => entry._id === searchParams.get('entryId'))) {
        setNotebookActiveId(searchParams.get('entryId'));
      } else if (!searchParams.get('entryId')) {
        setNotebookActiveId(data[0]._id);
      }
    } catch (err) {
      setNotebookListError(err.response?.data?.error || 'Failed to load notebook.');
    } finally {
      setNotebookLoadingList(false);
    }
  }, [searchParams]);

  const loadNotebookEntry = useCallback(async (entryId) => {
    if (!entryId) return;
    setNotebookLoadingEntry(true);
    setNotebookEntryError('');
    try {
      const res = await api.get(`/api/notebook/${entryId}`, getAuthHeaders());
      const entry = res.data || null;
      setActiveNotebookEntry(entry);
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to load note.');
      setActiveNotebookEntry(null);
    } finally {
      setNotebookLoadingEntry(false);
    }
  }, []);

  useEffect(() => {
    loadNotebookEntries();
  }, [loadNotebookEntries]);

  useEffect(() => {
    const rawView = searchParams.get('tab');
    if (allowedViews.includes(rawView)) {
      setActiveView(rawView);
    }
  }, [searchParams, allowedViews]);

  useEffect(() => {
    if (!notebookActiveId || activeView !== 'notebook') return;
    loadNotebookEntry(notebookActiveId);
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'notebook');
    params.set('entryId', notebookActiveId);
    setSearchParams(params, { replace: true });
  }, [notebookActiveId, activeView, loadNotebookEntry, searchParams, setSearchParams]);

  React.useEffect(() => {
    setDescriptionDraft(concept?.description || '');
  }, [concept?.description]);

  React.useEffect(() => {
    setHighlightOffset(0);
    setRecentHighlights([]);
  }, [selectedName]);

  React.useEffect(() => {
    if (!related?.highlights) return;
    setRecentHighlights(prev => {
      const map = new Map(prev.map(h => [String(h._id), h]));
      related.highlights.forEach(h => {
        map.set(String(h._id), h);
      });
      return Array.from(map.values());
    });
  }, [related]);

  const handleSelectConcept = (name) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'concepts');
    params.set('concept', name);
    setActiveView('concepts');
    setSearchParams(params);
  };

  const handleSelectView = (view) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', view);
    if (view !== 'notebook') {
      params.delete('entryId');
    }
    if (view !== 'concepts') {
      params.delete('concept');
    }
    setActiveView(view);
    setSearchParams(params);
  };

  const handleSelectNotebookEntry = (id) => {
    setNotebookActiveId(id);
    setActiveView('notebook');
    handleSelectView('notebook');
  };

  const handleCreateNotebookEntry = async () => {
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      const res = await api.post('/api/notebook', { title: 'Untitled', content: '', blocks: [] }, getAuthHeaders());
      const created = res.data;
      setNotebookEntries(prev => [created, ...prev]);
      setNotebookActiveId(created._id);
      setActiveNotebookEntry(created);
      handleSelectView('notebook');
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to create note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const handleSaveNotebookEntry = async (payload) => {
    if (!payload?.id) return;
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      const res = await api.put(`/api/notebook/${payload.id}`, payload, getAuthHeaders());
      const updated = res.data;
      setNotebookEntries(prev => prev.map(entry => entry._id === updated._id ? updated : entry));
      setActiveNotebookEntry(updated);
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to save note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const handleDeleteNotebookEntry = async (entry) => {
    if (!entry?._id) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setNotebookSaving(true);
    setNotebookEntryError('');
    try {
      await api.delete(`/api/notebook/${entry._id}`, getAuthHeaders());
      setNotebookEntries(prev => {
        const remaining = prev.filter(item => item._id !== entry._id);
        if (remaining.length > 0) {
          setNotebookActiveId(remaining[0]._id);
        } else {
          setNotebookActiveId('');
          setActiveNotebookEntry(null);
        }
        return remaining;
      });
    } catch (err) {
      setNotebookEntryError(err.response?.data?.error || 'Failed to delete note.');
    } finally {
      setNotebookSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!concept) return;
    setSavingDescription(true);
    setConceptError('');
    try {
      const updated = await updateConcept(concept.name, {
        description: descriptionDraft,
        pinnedHighlightIds,
        pinnedArticleIds,
        pinnedNoteIds: concept.pinnedNoteIds || []
      });
      setConcept({ ...concept, description: updated.description || '' });
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to save description.');
    } finally {
      setSavingDescription(false);
    }
  };

  const togglePinHighlight = async (highlightId) => {
    if (!concept) return;
    const exists = pinnedHighlightIds.some(id => String(id) === String(highlightId));
    try {
      await updateConceptPins(concept.name, {
        addHighlightIds: exists ? [] : [highlightId],
        removeHighlightIds: exists ? [highlightId] : []
      });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const togglePinArticle = async (articleId) => {
    if (!concept) return;
    const exists = pinnedArticleIds.some(id => String(id) === String(articleId));
    try {
      await updateConceptPins(concept.name, {
        addArticleIds: exists ? [] : [articleId],
        removeArticleIds: exists ? [articleId] : []
      });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const togglePinNote = async (noteId) => {
    if (!concept) return;
    const current = concept.pinnedNoteIds || [];
    const exists = current.some(id => String(id) === String(noteId));
    const nextIds = exists
      ? current.filter(id => String(id) !== String(noteId))
      : [...current, noteId];
    try {
      const updated = await updateConcept(concept.name, {
        description: concept.description || '',
        pinnedHighlightIds,
        pinnedArticleIds,
        pinnedNoteIds: nextIds
      });
      setConcept({ ...concept, pinnedNoteIds: updated.pinnedNoteIds || nextIds });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update pins.');
    }
  };

  const loadMoreHighlights = async () => {
    setLoadingMore(true);
    setHighlightOffset(prev => prev + 20);
    setLoadingMore(false);
  };

  const handleAddQuestion = async (text) => {
    if (!selectedName) return;
    try {
      const created = await createQuestion({
        text,
        conceptName: selectedName,
        blocks: [{ id: createBlockId(), type: 'paragraph', text }]
      });
      setConceptQuestions(prev => [created, ...prev]);
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add question.');
    }
  };

  const handleAddHighlightToConcept = async (highlight, conceptName) => {
    await api.post(`/api/concepts/${encodeURIComponent(conceptName)}/add-highlight`, {
      highlightId: highlight._id
    }, getAuthHeaders());
    setHighlightConceptModal({ open: false, highlight: null });
  };

  const handleSendHighlightToNotebook = async (highlight, entryId) => {
    await api.post(`/api/notebook/${entryId}/append-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setHighlightNotebookModal({ open: false, highlight: null });
  };

  const handleCreateQuestionFromHighlight = async (highlight, conceptName, text) => {
    const created = await createQuestion({
      text,
      conceptName,
      blocks: [
        { id: createBlockId(), type: 'paragraph', text },
        { id: createBlockId(), type: 'highlight-ref', highlightId: highlight._id, text: highlight.text || '' }
      ],
      linkedHighlightIds: [highlight._id]
    });
    if (created?._id) {
      await api.post(`/api/questions/${created._id}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    }
    setHighlightQuestionModal({ open: false, highlight: null });
  };

  const handleAttachHighlightToQuestion = async (highlight, questionId) => {
    await api.post(`/api/questions/${questionId}/add-highlight`, { highlightId: highlight._id }, getAuthHeaders());
    setHighlightQuestionModal({ open: false, highlight: null });
  };

  const handleAddHighlights = async (ids) => {
    if (!concept || ids.length === 0) return;
    try {
      await updateConceptPins(concept.name, { addHighlightIds: ids });
      setAddModal({ open: false, mode: 'highlight' });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add highlights.');
    }
  };

  const handleAddArticles = async (ids) => {
    if (!concept || ids.length === 0) return;
    try {
      await updateConceptPins(concept.name, { addArticleIds: ids });
      setAddModal({ open: false, mode: 'article' });
      refresh();
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to add articles.');
    }
  };

  const handleMarkAnswered = async (question) => {
    try {
      await updateQuestion(question._id, { status: 'answered' });
      setConceptQuestions(prev => prev.filter(item => item._id !== question._id));
      setAllQuestions(prev => prev.filter(item => item._id !== question._id));
    } catch (err) {
      setConceptError(err.response?.data?.error || 'Failed to update question.');
    }
  };

  const handleCreateQuestion = async () => {
    setQuestionSaving(true);
    setQuestionError('');
    try {
      const created = await createQuestion({
        text: 'New question',
        conceptName: questionConceptFilter || '',
        blocks: [{ id: createBlockId(), type: 'paragraph', text: '' }]
      });
      setAllQuestions(prev => [created, ...prev]);
      setActiveQuestionId(created._id);
      setActiveQuestion(created);
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to create question.');
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleSaveQuestion = async (payload) => {
    if (!payload?._id) return;
    setQuestionSaving(true);
    setQuestionError('');
    try {
      const updated = await updateQuestion(payload._id, {
        text: payload.text,
        status: payload.status,
        conceptName: payload.conceptName || payload.linkedTagName || '',
        blocks: payload.blocks || []
      });
      setAllQuestions(prev => prev.map(q => q._id === updated._id ? updated : q));
    } catch (err) {
      setQuestionError(err.response?.data?.error || 'Failed to save question.');
    } finally {
      setQuestionSaving(false);
    }
  };


  const leftPanel = (
    <div className="section-stack">
      <SectionHeader title="Notebook" subtitle="Working notes." />
      <NotebookList
        entries={notebookEntries}
        activeId={notebookActiveId}
        loading={notebookLoadingList}
        error={notebookListError}
        onSelect={handleSelectNotebookEntry}
        onCreate={handleCreateNotebookEntry}
      />

      <SectionHeader title="Concepts" subtitle="Structured pages." />
      <label className="feedback-field" style={{ margin: 0 }}>
        <span>Search</span>
        <input
          type="text"
          value={search}
          placeholder="Find a concept"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {conceptsLoading && <p className="muted small">Loading concepts…</p>}
      {conceptsError && <p className="status-message error-message">{conceptsError}</p>}
      <div className="concept-list">
        {filteredConcepts.map(conceptItem => (
          <QuietButton
            key={conceptItem.name}
            className={`list-button ${conceptItem.name === selectedName ? 'is-active' : ''}`}
            onClick={() => handleSelectConcept(conceptItem.name)}
          >
            <span>{conceptItem.name}</span>
            {typeof conceptItem.count === 'number' && (
              <span className="concept-count">{conceptItem.count}</span>
            )}
          </QuietButton>
        ))}
        {!conceptsLoading && filteredConcepts.length === 0 && (
          <p className="muted small">No concepts found.</p>
        )}
      </div>

      <SectionHeader title="Questions" subtitle="Open loops." />
      <div className="think-question-filters">
        <select
          value={questionStatus}
          onChange={(event) => {
            setQuestionStatus(event.target.value);
            handleSelectView('questions');
          }}
        >
          <option value="open">Open</option>
          <option value="answered">Answered</option>
        </select>
        <select
          value={questionConceptFilter}
          onChange={(event) => {
            setQuestionConceptFilter(event.target.value);
            handleSelectView('questions');
          }}
        >
          <option value="">All concepts</option>
          {concepts.map(concept => (
            <option key={concept.name} value={concept.name}>{concept.name}</option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleCreateQuestion} disabled={questionSaving}>
          New
        </Button>
      </div>
      {allQuestionsError && <p className="status-message error-message">{allQuestionsError}</p>}
      {questionError && <p className="status-message error-message">{questionError}</p>}
      {allQuestionsLoading && <p className="muted small">Loading questions…</p>}
      {!allQuestionsLoading && allQuestions.length === 0 && (
        <p className="muted small">No questions in this view.</p>
      )}
      <div className="think-question-list">
        {allQuestions.map(question => (
          <button
            key={question._id}
            className={`think-question-row list-button ${activeQuestionId === question._id ? 'is-active' : ''}`}
            onClick={() => {
              setActiveQuestionId(question._id);
              handleSelectView('questions');
            }}
          >
            <div className="think-question-text">{question.text}</div>
            <div className="muted small">{question.linkedTagName || 'Uncategorized'}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const mainPanel = activeView === 'notebook' ? (
    <div className="think-notebook-editor-pane">
      {notebookLoadingEntry && <p className="muted small">Loading note…</p>}
      {!notebookLoadingEntry && (
        <NotebookEditor
          entry={activeNotebookEntry}
          saving={notebookSaving}
          error={notebookEntryError}
          onSave={handleSaveNotebookEntry}
          onDelete={handleDeleteNotebookEntry}
          onCreate={handleCreateNotebookEntry}
          onRegisterInsert={(fn) => { notebookInsertRef.current = fn; }}
        />
      )}
    </div>
  ) : activeView === 'questions' ? (
    <div className="think-question-editor-pane">
      <QuestionEditor
        question={activeQuestionData}
        saving={questionSaving}
        error={questionError}
        onSave={handleSaveQuestion}
        onRegisterInsert={(fn) => { questionInsertRef.current = fn; }}
      />
      {activeQuestionData && questionStatus === 'open' && (
        <div className="think-question-actions">
          <QuietButton onClick={() => handleMarkAnswered(activeQuestionData)}>Mark answered</QuietButton>
        </div>
      )}
    </div>
  ) : (
    <div className="section-stack">
      {conceptLoadError && <p className="status-message error-message">{conceptLoadError}</p>}
      {conceptError && <p className="status-message error-message">{conceptError}</p>}
      {relatedError && <p className="status-message error-message">{relatedError}</p>}
      {conceptLoading && <p className="muted small">Loading concept…</p>}
      {!conceptLoading && concept && (
        <>
          <div className="concept-header">
            <h1>{concept.name}</h1>
          </div>
          <SectionHeader title="Definition" subtitle="Write the summary in your own words." />
          <textarea
            className="concept-description"
            rows={4}
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            placeholder="What is this concept? Why does it matter?"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSaveDescription} disabled={savingDescription}>
              {savingDescription ? 'Saving…' : 'Save summary'}
            </Button>
          </div>

          <SectionHeader title="Pinned Highlights" subtitle="Anchor ideas." />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAddModal({ open: true, mode: 'highlight' })}>
              Add Highlights
            </Button>
          </div>
          {pinnedHighlights.length === 0 && <p className="muted small">No pinned highlights yet.</p>}
          <div className="concept-highlight-grid">
            {pinnedHighlights.map(h => (
              <div key={h._id} className="concept-highlight-card">
                <HighlightCard
                  highlight={h}
                  compact
                  onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                  onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                  onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                />
                <QuietButton onClick={() => togglePinHighlight(h._id)}>Unpin</QuietButton>
              </div>
            ))}
          </div>

          <SectionHeader title="Recent Highlights" subtitle="Newest signals." />
          <div className="concept-highlight-grid">
            {recentHighlights.map(h => (
              <div key={h._id} className="concept-highlight-card">
                <HighlightCard
                  highlight={h}
                  compact
                  onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                  onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                  onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                />
                <QuietButton onClick={() => togglePinHighlight(h._id)}>
                  {pinnedHighlightIds.some(id => String(id) === String(h._id)) ? 'Unpin' : 'Pin'}
                </QuietButton>
              </div>
            ))}
            {!relatedLoading && recentHighlights.length === 0 && (
              <p className="muted small">No highlights yet for this concept.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={loadMoreHighlights} disabled={loadingMore || relatedLoading}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>

          <SectionHeader title="Notes referencing this concept" subtitle="Embedded fragments." />
          {related.notes.length === 0 && !relatedLoading && (
            <p className="muted small">No linked notes yet.</p>
          )}
          <div className="concept-note-grid">
            {related.notes.map((note, idx) => (
              <div key={`${note.notebookEntryId}-${idx}`} className="concept-note-card">
                <div className="concept-note-title">{note.notebookTitle || 'Untitled note'}</div>
                <p className="muted small">{note.blockPreviewText || 'No preview available.'}</p>
                <div className="concept-note-actions">
                  <QuietButton onClick={() => togglePinNote(note.notebookEntryId)}>
                    {(concept.pinnedNoteIds || []).some(id => String(id) === String(note.notebookEntryId))
                      ? 'Unpin'
                      : 'Pin'}
                  </QuietButton>
                <Link to={`/think?tab=notebook&entryId=${note.notebookEntryId}`} className="muted small">Open note</Link>
                </div>
              </div>
            ))}
            {pinnedNotes.map(note => (
              <div key={note._id} className="concept-note-card pinned">
                <div className="concept-note-title">{note.title || 'Untitled note'}</div>
                <p className="muted small">{(note.content || '').slice(0, 120)}{(note.content || '').length > 120 ? '…' : ''}</p>
                <div className="concept-note-actions">
                  <QuietButton onClick={() => togglePinNote(note._id)}>Unpin</QuietButton>
                <Link to={`/think?tab=notebook&entryId=${note._id}`} className="muted small">Open note</Link>
                </div>
              </div>
            ))}
          </div>

          <SectionHeader title="Source articles" subtitle="Where the highlights live." />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAddModal({ open: true, mode: 'article' })}>
              Add Articles
            </Button>
          </div>
          {pinnedArticles.length > 0 && (
            <div className="concept-source-list">
              {pinnedArticles.map(article => (
                <div key={article._id} className="concept-source-row">
                  <div>
                    <div className="concept-source-title">{article.title || 'Untitled article'}</div>
                    {article.url && <p className="muted small">{article.url}</p>}
                  </div>
                  <QuietButton onClick={() => togglePinArticle(article._id)}>Unpin</QuietButton>
                </div>
              ))}
            </div>
          )}
          {related.articles.length === 0 && !relatedLoading && (
            <p className="muted small">No source articles yet.</p>
          )}
          <div className="concept-source-list">
            {related.articles.map(article => (
              <div key={article._id} className="concept-source-row">
                <div>
                  <div className="concept-source-title">{article.title || 'Untitled article'}</div>
                  <p className="muted small">{article.highlightCount} highlights</p>
                </div>
                <Link to={`/articles/${article._id}`} className="muted small">Open</Link>
              </div>
            ))}
          </div>
          <SectionHeader title="Questions" subtitle="Open loops tied to this concept." />
          {questionsError && <p className="status-message error-message">{questionsError}</p>}
          {questionsLoading && <p className="muted small">Loading questions…</p>}
          {!questionsLoading && (
            <>
              <QuestionInput onSubmit={handleAddQuestion} />
              <QuestionList questions={conceptQuestions} onMarkAnswered={handleMarkAnswered} />
            </>
          )}
        </>
      )}
    </div>
  );

  const filteredHighlights = useMemo(() => {
    const query = highlightQuery.trim().toLowerCase();
    return allHighlights.filter(h => {
      const textMatch = !query || (h.text || '').toLowerCase().includes(query);
      const tagMatch = !highlightTag || (h.tags || []).includes(highlightTag);
      const articleMatch = !highlightArticle || (h.articleTitle || '').toLowerCase().includes(highlightArticle.toLowerCase());
      return textMatch && tagMatch && articleMatch;
    });
  }, [allHighlights, highlightQuery, highlightTag, highlightArticle]);

  const articleOptions = useMemo(() => {
    const map = new Map();
    allHighlights.forEach(h => {
      if (h.articleTitle) map.set(h.articleTitle, h.articleTitle);
    });
    return Array.from(map.values());
  }, [allHighlights]);

  const handleInsertHighlight = async (highlight) => {
    if (activeView === 'notebook' && notebookInsertRef.current) {
      notebookInsertRef.current(highlight);
      return;
    }
    if (activeView === 'questions' && questionInsertRef.current) {
      questionInsertRef.current(highlight);
      return;
    }
    if (activeView === 'concepts' && concept?.name) {
      await updateConceptPins(concept.name, { addHighlightIds: [highlight._id] });
      refresh();
    }
  };

  const rightPanel = (
    <div className="section-stack">
      <SectionHeader title="Insert" subtitle="Search highlights." />
      <div className="library-highlight-filters">
        <input
          type="text"
          placeholder="Search highlights"
          value={highlightQuery}
          onChange={(event) => setHighlightQuery(event.target.value)}
        />
        <select value={highlightTag} onChange={(event) => setHighlightTag(event.target.value)}>
          <option value="">All concepts</option>
          {tags.map(tag => (
            <option key={tag.tag} value={tag.tag}>{tag.tag}</option>
          ))}
        </select>
        <select value={highlightArticle} onChange={(event) => setHighlightArticle(event.target.value)}>
          <option value="">All articles</option>
          {articleOptions.map(article => (
            <option key={article} value={article}>{article}</option>
          ))}
        </select>
      </div>
      <div className="library-highlights-list">
        {filteredHighlights.slice(0, 8).map(highlight => (
          <div key={highlight._id} className="library-highlight-row">
            <HighlightCard
              highlight={highlight}
              compact
              onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
              onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
              onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
            />
            <div className="library-highlight-row-actions">
              <QuietButton onClick={() => handleInsertHighlight(highlight)}>
                {activeView === 'concepts' ? 'Pin to concept' : 'Insert'}
              </QuietButton>
            </div>
          </div>
        ))}
        {filteredHighlights.length === 0 && (
          <p className="muted small">No highlights match.</p>
        )}
      </div>

      {activeView === 'notebook' && (
        <NotebookContext entry={activeNotebookEntry} />
      )}

      {activeView === 'questions' && (
        <div className="section-stack">
          <SectionHeader title="Context" subtitle="Open loops." />
          {activeQuestion?.linkedTagName ? (
            <TagChip to={`/think?tab=concepts&concept=${encodeURIComponent(activeQuestion.linkedTagName)}`}>
              {activeQuestion.linkedTagName}
            </TagChip>
          ) : (
            <p className="muted small">No concept linked.</p>
          )}
          <SectionHeader title="Embedded highlights" subtitle="References in this question." />
          {activeQuestion?.blocks?.filter(block => block.type === 'highlight-ref').length ? (
            <div className="concept-note-grid">
              {activeQuestion.blocks
                .filter(block => block.type === 'highlight-ref')
                .map(block => {
                  const highlight = highlightMap.get(String(block.highlightId)) || {
                    id: block.highlightId,
                    text: block.text || 'Highlight',
                    tags: [],
                    articleTitle: ''
                  };
                  return (
                    <HighlightCard
                      key={block.id}
                      highlight={highlight}
                      compact
                      onAddNotebook={(item) => setHighlightNotebookModal({ open: true, highlight: item })}
                      onAddConcept={(item) => setHighlightConceptModal({ open: true, highlight: item })}
                      onAddQuestion={(item) => setHighlightQuestionModal({ open: true, highlight: item })}
                    />
                  );
                })}
            </div>
          ) : (
            <p className="muted small">No highlights embedded yet.</p>
          )}
          {activeQuestion?._id && (
            <div>
              <SectionHeader title="Used in" subtitle="Backlinks to this question." />
              <ReferencesPanel targetType="question" targetId={activeQuestion._id} label="Show backlinks" />
            </div>
          )}
        </div>
      )}

      {activeView === 'concepts' && (
        <div className="section-stack">
          <SectionHeader title="Related concepts" subtitle="Neighbors and cousins." />
          {concept?.relatedTags?.length > 0 ? (
            <div className="concept-related-tags">
              {concept.relatedTags.slice(0, 8).map(tag => (
                <TagChip key={tag.tag} to={`/think?tab=concepts&concept=${encodeURIComponent(tag.tag)}`}>
                  {tag.tag}
                </TagChip>
              ))}
            </div>
          ) : (
            <p className="muted small">No related concepts yet.</p>
          )}
          <SectionHeader title="Tag correlations" subtitle="Co-occuring themes." />
          {concept?.relatedTags?.length > 0 ? (
            <div className="concept-related-tags">
              {concept.relatedTags.slice(0, 8).map(tag => (
                <TagChip key={`corr-${tag.tag}`} to={`/think?tab=concepts&concept=${encodeURIComponent(tag.tag)}`}>
                  {tag.tag}
                </TagChip>
              ))}
            </div>
          ) : (
            <p className="muted small">No correlations yet.</p>
          )}
          {concept?.name && (
            <div>
              <SectionHeader title="Used in" subtitle="Backlinks to this concept." />
              <ReferencesPanel targetType="concept" tagName={concept.name} label="Show backlinks" />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <ThreePaneLayout
        left={leftPanel}
        main={mainPanel}
        right={rightPanel}
        rightTitle="Context"
        leftOpen
        defaultLeftOpen
        defaultRightOpen
        mainHeader={<PageTitle eyebrow="Mode" title="Think" subtitle="Concepts as structured pages you can return to." />}
        mainActions={(
          <div className="library-main-actions">
            <QuietButton
              className={`list-button ${activeView === 'notebook' ? 'is-active' : ''}`}
              onClick={() => handleSelectView('notebook')}
            >
              Notebook
            </QuietButton>
            <QuietButton
              className={`list-button ${activeView === 'concepts' ? 'is-active' : ''}`}
              onClick={() => handleSelectView('concepts')}
            >
              Concepts
            </QuietButton>
            <QuietButton
              className={`list-button ${activeView === 'questions' ? 'is-active' : ''}`}
              onClick={() => handleSelectView('questions')}
            >
              Questions
            </QuietButton>
            <QuietButton className="list-button" onClick={handleCreateNotebookEntry}>
              New note
            </QuietButton>
          </div>
        )}
      />
      <AddToConceptModal
        open={addModal.open}
        mode={addModal.mode}
        pinnedHighlightIds={pinnedHighlightIds}
        pinnedArticleIds={pinnedArticleIds}
        onClose={() => setAddModal({ open: false, mode: 'highlight' })}
        onAddHighlights={handleAddHighlights}
        onAddArticles={handleAddArticles}
      />
      <LibraryConceptModal
        open={highlightConceptModal.open}
        highlight={highlightConceptModal.highlight}
        onClose={() => setHighlightConceptModal({ open: false, highlight: null })}
        onSelect={handleAddHighlightToConcept}
      />
      <LibraryNotebookModal
        open={highlightNotebookModal.open}
        highlight={highlightNotebookModal.highlight}
        onClose={() => setHighlightNotebookModal({ open: false, highlight: null })}
        onSend={handleSendHighlightToNotebook}
      />
      <LibraryQuestionModal
        open={highlightQuestionModal.open}
        highlight={highlightQuestionModal.highlight}
        onClose={() => setHighlightQuestionModal({ open: false, highlight: null })}
        onCreate={handleCreateQuestionFromHighlight}
        onAttach={handleAttachHighlightToQuestion}
      />
    </>
  );
};

export default ThinkMode;
