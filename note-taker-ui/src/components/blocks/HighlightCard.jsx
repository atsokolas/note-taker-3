import React from 'react';
import { QuietButton } from '../ui';
import HighlightBlock from './HighlightBlock';

const HighlightCard = ({ highlight, compact = false, onAddNotebook, onAddConcept, onAddQuestion }) => (
  <div className="highlight-card">
    <HighlightBlock highlight={highlight} compact={compact} />
    {(onAddNotebook || onAddConcept || onAddQuestion) && (
      <div className="highlight-card-actions">
        {onAddNotebook && (
          <QuietButton onClick={() => onAddNotebook(highlight)}>Add to Notebook</QuietButton>
        )}
        {onAddConcept && (
          <QuietButton onClick={() => onAddConcept(highlight)}>Add to Concept</QuietButton>
        )}
        {onAddQuestion && (
          <QuietButton onClick={() => onAddQuestion(highlight)}>Add to Question</QuietButton>
        )}
      </div>
    )}
  </div>
);

export default HighlightCard;
