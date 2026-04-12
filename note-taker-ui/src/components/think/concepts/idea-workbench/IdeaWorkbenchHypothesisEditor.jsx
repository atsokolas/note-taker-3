import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useDroppable } from '@dnd-kit/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { QuietButton } from '../../../../components/ui';

const toolbarItems = [
  { label: 'Bold', isActive: (editor) => editor.isActive('bold'), run: (editor) => editor.chain().focus().toggleBold().run() },
  { label: 'Italic', isActive: (editor) => editor.isActive('italic'), run: (editor) => editor.chain().focus().toggleItalic().run() },
  { label: 'List', isActive: (editor) => editor.isActive('bulletList'), run: (editor) => editor.chain().focus().toggleBulletList().run() }
];

const IdeaWorkbenchHypothesisEditor = ({
  value,
  onChange,
  droppableId = 'hypothesis-editor',
  isReceivingDrop = false,
  onEditorReady,
  onDropCard
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
  const onDropCardRef = useRef(onDropCard);
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
        placeholder: 'Write the current hypothesis here. Let it stay provisional and editable.'
      })
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'idea-workbench-hypothesis__editor'
      },
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
      <div className="idea-workbench-hypothesis__toolbar">
        {toolbarItems.map((item) => (
          <QuietButton
            key={item.label}
            type="button"
            className={item.isActive(editor) ? 'is-active' : ''}
            onClick={() => item.run(editor)}
          >
            {item.label}
          </QuietButton>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
};

export default IdeaWorkbenchHypothesisEditor;
