import React from 'react';
import { QuietButton } from '../../ui';

const QuestionList = ({ questions, onMarkAnswered }) => {
  if (!questions || questions.length === 0) {
    return <p className="muted small">No open questions yet.</p>;
  }

  return (
    <div className="think-question-list">
      {questions.map(question => (
        <div key={question._id} className="think-question-row">
          <div className="think-question-text">{question.text}</div>
          {onMarkAnswered && (
            <QuietButton onClick={() => onMarkAnswered(question)}>Mark answered</QuietButton>
          )}
        </div>
      ))}
    </div>
  );
};

export default QuestionList;
