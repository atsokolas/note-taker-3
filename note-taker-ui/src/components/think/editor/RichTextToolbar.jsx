import React from 'react';
import { Button } from '../../ui';
import { getSlashCommandItems } from './slashCommands';

const RichTextToolbar = ({
  editor,
  variant = 'full',
  className = '',
  onAskSelection = null,
  onTryWording = null
}) => {
  if (!editor) return null;

  const items = getSlashCommandItems(variant);

  return (
    <div className={`think-rich-text-toolbar think-rich-text-toolbar--${variant} ${className}`.trim()}>
      {items.map((item) => (
        <Button variant="quiet"
          key={item.label}
          type="button"
          aria-label={item.label}
          className={item.isActive(editor) ? 'is-active' : ''}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => item.apply(editor.chain().focus()).run()}
        >
          {item.label}
        </Button>
      ))}
      {onTryWording ? (
        <Button variant="quiet"
          type="button"
          aria-label="Try wording"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onTryWording}
        >
          Try wording
        </Button>
      ) : null}
      {onAskSelection ? (
        <Button variant="quiet"
          type="button"
          aria-label="Ask Partner about selection"
          className="think-rich-text-toolbar__partner"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onAskSelection}
        >
          Ask partner
        </Button>
      ) : null}
    </div>
  );
};

export default RichTextToolbar;
