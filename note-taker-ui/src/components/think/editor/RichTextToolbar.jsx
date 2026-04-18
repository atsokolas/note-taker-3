import React from 'react';
import { QuietButton } from '../../ui';
import { getSlashCommandItems } from './slashCommands';

const RichTextToolbar = ({
  editor,
  variant = 'full',
  className = ''
}) => {
  if (!editor) return null;

  const items = getSlashCommandItems(variant);

  return (
    <div className={`think-rich-text-toolbar think-rich-text-toolbar--${variant} ${className}`.trim()}>
      {items.map((item) => (
        <QuietButton
          key={item.label}
          type="button"
          aria-label={item.label}
          className={item.isActive(editor) ? 'is-active' : ''}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => item.apply(editor.chain().focus()).run()}
        >
          {item.label}
        </QuietButton>
      ))}
    </div>
  );
};

export default RichTextToolbar;
