import React from 'react';
import { insertArtifactBlock } from './editorArtifacts';

const LABELS = {
  evidence: 'Evidence block',
  concept: 'Concept block',
  question: 'Question block'
};

const DraftBlockTray = ({
  editor,
  items = ['evidence', 'concept', 'question'],
  className = ''
}) => {
  if (!editor || !Array.isArray(items) || items.length === 0) return null;

  return (
    <div className={['think-draft-block-tray', className].filter(Boolean).join(' ')}>
      <span className="think-draft-block-tray__label">Draft blocks</span>
      <div className="think-draft-block-tray__actions">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className="ui-quiet-button"
            onClick={() => insertArtifactBlock(editor, item)}
          >
            {LABELS[item] || item}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DraftBlockTray;
