import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton, SectionHeader } from '../../ui';
import useQuestions from '../../../hooks/useQuestions';
import useConcepts from '../../../hooks/useConcepts';
import { createQuestion, updateQuestion } from '../../../api/questions';
import QuestionEditor from './QuestionEditor';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const QuestionsView = ({ onSelectQuestion }) => {
  const [statusFilter, setStatusFilter] = useState('open');
  const [conceptFilter, setConceptFilter] = useState('');
  const [activeId, setActiveId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { concepts } = useConcepts();
  const { questions, loading, error, setQuestions } = useQuestions({
    status: statusFilter,
    tag: conceptFilter || undefined,
    enabled: true
  });

  const activeQuestion = useMemo(
    () => questions.find(q => q._id === activeId) || null,
    [questions, activeId]
  );

  useEffect(() => {
    if (questions.length === 0) {
      setActiveId('');
      if (onSelectQuestion) onSelectQuestion(null);
      return;
    }
    if (!activeId || !questions.some(q => q._id === activeId)) {
      setActiveId(questions[0]._id);
      if (onSelectQuestion) onSelectQuestion(questions[0]);
    }
  }, [questions, activeId, onSelectQuestion]);

  useEffect(() => {
    if (activeQuestion && onSelectQuestion) onSelectQuestion(activeQuestion);
  }, [activeQuestion, onSelectQuestion]);

  const handleCreate = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const created = await createQuestion({
        text: 'New question',
        conceptName: conceptFilter || '',
        blocks: [{ id: createId(), type: 'paragraph', text: '' }]
      });
      setQuestions(prev => [created, ...prev]);
      setActiveId(created._id);
      if (onSelectQuestion) onSelectQuestion(created);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to create question.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (payload) => {
    if (!payload?._id) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await updateQuestion(payload._id, {
        text: payload.text,
        status: payload.status,
        conceptName: payload.conceptName || payload.linkedTagName || '',
        blocks: payload.blocks || []
      });
      setQuestions(prev => prev.map(q => q._id === updated._id ? updated : q));
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAnswered = async (question) => {
    setSaving(true);
    setSaveError('');
    try {
      await updateQuestion(question._id, { status: 'answered' });
      setQuestions(prev => prev.filter(q => q._id !== question._id));
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to update question.');
    } finally {
      setSaving(false);
    }
  };

  const leftList = (
    <div className="think-question-list-pane">
      <SectionHeader title="Questions" subtitle="Open loops you can close." />
      <div className="think-question-filters">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="open">Open</option>
          <option value="answered">Answered</option>
        </select>
        <select
          value={conceptFilter}
          onChange={(event) => setConceptFilter(event.target.value)}
        >
          <option value="">All concepts</option>
          {concepts.map(concept => (
            <option key={concept.name} value={concept.name}>{concept.name}</option>
          ))}
        </select>
        <Button variant="secondary" onClick={handleCreate} disabled={saving}>
          New question
        </Button>
      </div>
      {error && <p className="status-message error-message">{error}</p>}
      {saveError && <p className="status-message error-message">{saveError}</p>}
      {loading && <p className="muted small">Loading questions…</p>}
      {!loading && questions.length === 0 && (
        <p className="muted small">No questions in this view.</p>
      )}
      <div className="think-question-list">
        {questions.map(question => (
          <button
            key={question._id}
            className={`think-question-row ${activeId === question._id ? 'is-active' : ''}`}
            onClick={() => setActiveId(question._id)}
          >
            <div className="think-question-text">{question.text}</div>
            <div className="muted small">{question.linkedTagName || 'Uncategorized'}</div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="think-question-layout">
      {leftList}
      <div className="think-question-editor-pane">
        <QuestionEditor
          question={activeQuestion}
          saving={saving}
          error={saveError}
          onSave={handleSave}
        />
        {activeQuestion && statusFilter === 'open' && (
          <div className="think-question-actions">
            <QuietButton onClick={() => handleMarkAnswered(activeQuestion)}>Mark answered</QuietButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionsView;
