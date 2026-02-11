import React from 'react';
import { QuietButton } from '../../ui';
import ReturnLaterControl from '../../return-queue/ReturnLaterControl';

const QuestionList = ({ questions, onMarkAnswered, showReturnLater = true }) => {
  if (!questions || questions.length === 0) {
    return <p className="muted small">No open questions yet.</p>;
  }

  return (
    <div className="think-question-list">
      {questions.map(question => (
        <div key={question._id} className="think-question-row">
          <div className="think-question-text">{question.text}</div>
          <div className="think-question-row-actions">
            {showReturnLater && (
              <ReturnLaterControl
                itemType="question"
                itemId={question._id}
                defaultReason={question.text || 'Question'}
              />
            )}
            {onMarkAnswered && (
              <QuietButton onClick={() => onMarkAnswered(question)}>Mark answered</QuietButton>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuestionList;
