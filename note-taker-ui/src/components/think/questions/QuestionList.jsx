import React from 'react';
import { Link } from 'react-router-dom';
import { QuietButton } from '../../ui';
import ReturnLaterControl from '../../return-queue/ReturnLaterControl';
import { getWikiOpenQuestionHref } from '../calmIndexModel';

const QuestionList = ({ questions, onMarkAnswered, showReturnLater = true }) => {
  if (!questions || questions.length === 0) {
    return <p className="muted small">No open questions yet.</p>;
  }

  return (
    <div className="think-question-list">
      {questions.map(question => {
        const sourceHref = getWikiOpenQuestionHref(question);
        return (
          <div key={question._id} className="think-question-row">
            <div className="think-question-row-main">
              <div className="think-question-text">{question.text}</div>
              {sourceHref ? (
                <div className="muted small">{question.sourcePageTitle || question.linkedTagName || 'Wiki page'}</div>
              ) : null}
            </div>
            <div className="think-question-row-actions">
              {sourceHref ? (
                <Link className="ui-quiet-button" to={sourceHref}>Open page</Link>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default QuestionList;
