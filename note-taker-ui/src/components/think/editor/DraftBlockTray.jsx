import React from 'react';
import { insertArtifactBlock } from './editorArtifacts';
import { Button } from '../../ui';

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
          <Button
            key={item}
            variant="quiet"
            onClick={() => insertArtifactBlock(editor, item)}
          >
            {LABELS[item] || item}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default DraftBlockTray;
