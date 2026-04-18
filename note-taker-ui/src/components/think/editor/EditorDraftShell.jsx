import React from 'react';
import { EditorContent } from '@tiptap/react';
import RichTextToolbar from './RichTextToolbar';
import SlashCommandMenu from './SlashCommandMenu';
import DraftBlockTray from './DraftBlockTray';
import { moveCurrentBlock } from './blockMovement';

const EditorDraftShell = ({
  editor,
  surfaceRef = null,
  className = '',
  toolbarVariant = 'full',
  toolbarClassName = '',
  hideToolbar = false,
  helperCopy = 'Type / for commands.',
  helperClassName = '',
  blockControlsClassName = '',
  trayItems = [],
  trayClassName = '',
  slashCommands = null
}) => {
  if (!editor) return null;

  return (
    <div
      className={['think-editor-draft-surface', className].filter(Boolean).join(' ')}
      ref={surfaceRef}
    >
      {!hideToolbar && (
        <RichTextToolbar
          editor={editor}
          variant={toolbarVariant}
          className={toolbarClassName}
        />
      )}
      <div className={['think-editor-slash-hint', helperClassName].filter(Boolean).join(' ')}>
        <span className="think-editor-slash-hint__token">/</span>
        <span>{helperCopy}</span>
        <div className={['think-editor-block-controls', blockControlsClassName].filter(Boolean).join(' ')}>
          <button type="button" className="ui-quiet-button" onClick={() => moveCurrentBlock(editor, 'up')}>Move up</button>
          <button type="button" className="ui-quiet-button" onClick={() => moveCurrentBlock(editor, 'down')}>Move down</button>
        </div>
      </div>
      {Array.isArray(trayItems) && trayItems.length > 0 ? (
        <DraftBlockTray
          editor={editor}
          items={trayItems}
          className={trayClassName}
        />
      ) : null}
      <EditorContent editor={editor} />
      <SlashCommandMenu
        open={Boolean(slashCommands?.menu?.open)}
        items={slashCommands?.menu?.items || []}
        activeIndex={slashCommands?.menu?.activeIndex || 0}
        query={slashCommands?.menu?.query || ''}
        position={slashCommands?.menu?.position || { top: 0, left: 0 }}
        onSelect={slashCommands?.selectCommand}
      />
    </div>
  );
};

export default EditorDraftShell;
