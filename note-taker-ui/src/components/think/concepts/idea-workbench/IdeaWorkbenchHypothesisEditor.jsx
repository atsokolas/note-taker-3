import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useDroppable } from '@dnd-kit/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { QuietButton } from '../../../../components/ui';

const toolbarItems = [
  { label: 'B', isActive: (editor) => editor.isActive('bold'), run: (editor) => editor.chain().focus().toggleBold().run() },
  { label: 'I', isActive: (editor) => editor.isActive('italic'), run: (editor) => editor.chain().focus().toggleItalic().run() },
  { label: '• List', isActive: (editor) => editor.isActive('bulletList'), run: (editor) => editor.chain().focus().toggleBulletList().run() }
];

const IdeaWorkbenchHypothesisEditor = ({
  value,
  onChange,
  droppableId = 'hypothesis-editor'
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
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

  if (!editor) return null;

  return (
    <div ref={setNodeRef} className={`idea-workbench-hypothesis__editor-shell ${isOver ? 'is-over' : ''}`}>
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
