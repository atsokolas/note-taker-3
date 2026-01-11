import React, { useMemo } from 'react';
import { SectionHeader } from '../../ui';
import QuestionList from './QuestionList';

const AllQuestionsView = ({ questions, loading, error, onMarkAnswered }) => {
  const grouped = useMemo(() => {
    const map = new Map();
    (questions || []).forEach(question => {
      const key = question.linkedTagName || 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(question);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [questions]);

  return (
    <div className="section-stack">
      <SectionHeader title="All Questions" subtitle="Open loops across concepts." />
      {loading && <p className="muted small">Loading questions…</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {!loading && !error && grouped.length === 0 && (
        <p className="muted small">No open questions yet.</p>
      )}
      {!loading && !error && grouped.map(([concept, items]) => (
        <div key={concept} className="think-question-group">
          <div className="think-question-group-title">{concept}</div>
          <QuestionList questions={items} onMarkAnswered={onMarkAnswered} />
        </div>
      ))}
    </div>
  );
};

export default AllQuestionsView;
