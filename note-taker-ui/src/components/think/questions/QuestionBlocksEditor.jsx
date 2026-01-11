import React, { useMemo } from 'react';
import { Button, QuietButton } from '../../ui';
import HighlightBlock from '../../blocks/HighlightBlock';
import useHighlights from '../../../hooks/useHighlights';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const QuestionBlocksEditor = ({
  blocks,
  onChange,
  onInsertHighlight
}) => {
  const { highlightMap } = useHighlights({ enabled: true });

  const handleTextChange = (index, text) => {
    const next = blocks.map((block, idx) => (
      idx === index ? { ...block, text } : block
    ));
    onChange(next);
  };

  const handleAddParagraph = () => {
    onChange([
      ...blocks,
      { id: createId(), type: 'paragraph', text: '' }
    ]);
  };

  const handleRemoveBlock = (index) => {
    const next = blocks.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [{ id: createId(), type: 'paragraph', text: '' }]);
  };

  const resolvedBlocks = useMemo(
    () => blocks.map(block => {
      if (block.type !== 'highlight-ref') return { block, highlight: null };
      const highlight = highlightMap.get(String(block.highlightId)) || {
        id: block.highlightId,
        text: block.text || 'Highlight',
        tags: [],
        articleTitle: ''
      };
      return { block, highlight };
    }),
    [blocks, highlightMap]
  );

  return (
    <div className="think-question-blocks">
      {resolvedBlocks.map(({ block, highlight }, index) => (
        <div key={block.id} className="think-question-block">
          {block.type === 'paragraph' ? (
            <textarea
              className="think-question-paragraph"
              rows={3}
              placeholder="Write your thinking…"
              value={block.text}
              onChange={(event) => handleTextChange(index, event.target.value)}
            />
          ) : (
            <HighlightBlock highlight={highlight} compact />
          )}
          <div className="think-question-block-actions">
            <QuietButton onClick={() => handleRemoveBlock(index)}>Remove</QuietButton>
          </div>
        </div>
      ))}
      <div className="think-question-block-toolbar">
        <Button variant="secondary" onClick={handleAddParagraph}>Add paragraph</Button>
        <Button variant="secondary" onClick={onInsertHighlight}>Add highlight</Button>
      </div>
    </div>
  );
};

export default QuestionBlocksEditor;
