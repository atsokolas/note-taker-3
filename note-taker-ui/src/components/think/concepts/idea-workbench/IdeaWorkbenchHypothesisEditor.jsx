import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useDroppable } from '@dnd-kit/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import RichTextToolbar from '../../editor/RichTextToolbar';
import SlashCommandMenu from '../../editor/SlashCommandMenu';
import DraftBlockTray from '../../editor/DraftBlockTray';
import useSlashCommands from '../../editor/useSlashCommands';
import { handleEditorStructureShortcut } from '../../editor/editorShortcuts';
import { moveCurrentBlock } from '../../editor/blockMovement';

const IdeaWorkbenchHypothesisEditor = ({
  value,
  onChange,
  droppableId = 'hypothesis-editor',
  isReceivingDrop = false,
  onEditorReady,
  onDropCard,
  slashItems = [],
  hideToolbar = false,
  placeholder = 'Write the current hypothesis here. Let it stay provisional and editable.'
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
  const onDropCardRef = useRef(onDropCard);
  const slashKeyDownRef = useRef(() => false);
  const slashSurfaceRef = useRef(null);
  const parseDraggedCard = (event) => {
    const rawCard = event.dataTransfer?.getData('application/x-noeis-card-json');
    if (rawCard) {
      try {
        return JSON.parse(rawCard);
      } catch (error) {
        // Fall through to id-based handling if the payload cannot be parsed.
      }
    }
    return event.dataTransfer?.getData('application/x-noeis-card-id')
      || event.dataTransfer?.getData('text/plain');
  };

  useEffect(() => {
    onDropCardRef.current = onDropCard;
  }, [onDropCard]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }
      }),
      Placeholder.configure({
        placeholder: `${placeholder} Type / for commands.`
      })
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'idea-workbench-hypothesis__editor'
      },
      handleKeyDown: (view, event) => (
        slashKeyDownRef.current?.(view, event)
        || handleEditorStructureShortcut({ editor, event, allowTitle: false })
        || false
      ),
      handleDOMEvents: {
        dragover: (_view, event) => {
          const hasCard = event.dataTransfer?.types?.includes('application/x-noeis-card-id');
          if (!hasCard) return false;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          return true;
        },
        drop: (_view, event) => {
          const cardPayload = parseDraggedCard(event);
          if (!cardPayload || !onDropCardRef.current) return false;
          event.preventDefault();
          onDropCardRef.current(cardPayload, event);
          return true;
        }
      }
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML());
    }
  });

  const slashCommands = useSlashCommands({
    editor,
    variant: 'slim',
    containerRef: slashSurfaceRef,
    extraItems: slashItems
  });

  useEffect(() => {
    slashKeyDownRef.current = slashCommands.onKeyDown;
  }, [slashCommands.onKeyDown]);

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  useEffect(() => {
    if (!onEditorReady) return undefined;
    onEditorReady(editor || null);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  if (!editor) return null;

  const handleDragOver = (event) => {
    const cardId = event.dataTransfer?.types?.includes('application/x-noeis-card-id');
    if (!cardId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event) => {
    const cardPayload = parseDraggedCard(event);
    if (!cardPayload || !onDropCard) return;
    event.preventDefault();
    onDropCard(cardPayload, event, editor);
  };

  return (
    <div
      ref={setNodeRef}
      className={`idea-workbench-hypothesis__editor-shell ${isOver ? 'is-over' : ''} ${isReceivingDrop ? 'is-receiving' : ''}`.trim()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="think-editor-draft-surface think-editor-draft-surface--concept" ref={slashSurfaceRef}>
        {!hideToolbar && (
          <RichTextToolbar editor={editor} variant="slim" className="idea-workbench-hypothesis__toolbar" />
        )}
        <div className="think-editor-slash-hint think-editor-slash-hint--slim">
          <span className="think-editor-slash-hint__token">/</span>
          <span>Type / for commands.</span>
          <div className="think-editor-block-controls think-editor-block-controls--slim">
            <button type="button" className="ui-quiet-button" onClick={() => moveCurrentBlock(editor, 'up')}>Move up</button>
            <button type="button" className="ui-quiet-button" onClick={() => moveCurrentBlock(editor, 'down')}>Move down</button>
          </div>
        </div>
        <DraftBlockTray
          editor={editor}
          items={['evidence', 'question']}
          className="think-draft-block-tray--slim"
        />
        {!hideToolbar && (
          <>
          </>
        )}
        <EditorContent editor={editor} />
        <SlashCommandMenu
          open={slashCommands.menu.open}
          items={slashCommands.menu.items}
          activeIndex={slashCommands.menu.activeIndex}
          query={slashCommands.menu.query}
          position={slashCommands.menu.position}
          onSelect={slashCommands.selectCommand}
        />
      </div>
    </div>
  );
};

export default IdeaWorkbenchHypothesisEditor;
