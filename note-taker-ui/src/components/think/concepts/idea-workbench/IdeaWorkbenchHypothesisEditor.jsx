import React, { useEffect, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import { useDroppable } from '@dnd-kit/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import EditorDraftShell from '../../editor/EditorDraftShell';
import useSlashCommands from '../../editor/useSlashCommands';
import { handleEditorStructureShortcut } from '../../editor/editorShortcuts';

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
      <EditorDraftShell
        editor={editor}
        surfaceRef={slashSurfaceRef}
        className="think-editor-draft-surface--concept"
        toolbarVariant="slim"
        toolbarClassName="idea-workbench-hypothesis__toolbar"
        hideToolbar={hideToolbar}
        helperCopy="Type / for commands."
        helperClassName="think-editor-slash-hint--slim"
        blockControlsClassName="think-editor-block-controls--slim"
        trayItems={['evidence', 'question']}
        trayClassName="think-draft-block-tray--slim"
        slashCommands={slashCommands}
      />
    </div>
  );
};

export default IdeaWorkbenchHypothesisEditor;
