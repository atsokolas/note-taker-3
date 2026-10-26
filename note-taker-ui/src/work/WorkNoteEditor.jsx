import React, { useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import { Mark, mergeAttributes, markPasteRule } from '@tiptap/core';
import EditorDraftShell from '../components/think/editor/EditorDraftShell';
import { notebookWritingExtensions } from '../components/think/editor/notebookWriting';
import { handleEditorStructureShortcut } from '../components/think/editor/editorShortcuts';
import { moveCurrentBlock } from '../components/think/editor/blockMovement';
import useSlashCommands from '../components/think/editor/useSlashCommands';
import { buildDocFromBlocks, ensureBlockIds, serializeBlocksFromDoc } from '../utils/notebookBlocks';
import '../styles/think-writing.css';

const safeLink = value => /^https?:\/\//i.test(value || '') ? value : null;
const WorkLink = Mark.create({
  name: 'workLink',
  addAttributes: () => ({ href: { default: null } }),
  parseHTML: () => [{ tag: 'a[href]', getAttrs: node => safeLink(node.getAttribute('href')) ? { href: node.getAttribute('href') } : false }],
  renderHTML: ({ HTMLAttributes }) => ['a', mergeAttributes(HTMLAttributes, { href: safeLink(HTMLAttributes.href), target: '_blank', rel: 'noopener noreferrer' }), 0],
  addPasteRules() { return [markPasteRule({ find: /https?:\/\/[^\s<>]+/g, type: this.type, getAttributes: match => ({ href: match[0] }) })]; }
});

export default function WorkNoteEditor({ note, onChange, fresh = false }) {
  const surface = useRef(null), change = useRef(onChange), slashKey = useRef(null);
  change.current = onChange;
  const [url, setUrl] = useState('');
  const editor = useEditor({
    extensions: [...notebookWritingExtensions(), WorkLink],
    content: note.content || (note.blocks?.length ? buildDocFromBlocks(note.blocks) : '<p></p>'),
    autofocus: fresh ? 'end' : false,
    editorProps: {
      attributes: { class: 'think-notebook-editor-body', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Work note writing' },
      handleKeyDown: (view, event) => slashKey.current?.(view, event) || handleEditorStructureShortcut({ editor, event }) || false
    },
    onUpdate: ({ editor: current }) => {
      const { node, changed } = ensureBlockIds(current.getJSON());
      if (changed) {
        const transaction = current.state.tr;
        current.schema.nodeFromJSON(node).descendants((block, position) => {
          if (block.attrs.blockId && block.attrs.blockId !== current.state.doc.nodeAt(position)?.attrs.blockId) transaction.setNodeMarkup(position, undefined, block.attrs);
        });
        current.view.dispatch(transaction.setMeta('preventUpdate', true));
      }
      change.current({ content: current.getHTML(), blocks: serializeBlocksFromDoc(node) });
    }
  });
  const slash = useSlashCommands({ editor, containerRef: surface });
  slashKey.current = slash.onKeyDown;
  return <div className="work-writing">
    <EditorDraftShell editor={editor} surfaceRef={surface} contextualToolbar slashCommands={slash} magnetCaretToolbar={false} hideBlockControls helperCopy="Paragraphs, headings, lists and quotes." />
    <details className="work-writing-tools"><summary>Writing tools</summary><button onClick={() => moveCurrentBlock(editor, 'up')}>Move paragraph up</button><button onClick={() => moveCurrentBlock(editor, 'down')}>Move paragraph down</button><form onSubmit={event => {
      event.preventDefault(); const href = safeLink(url.trim()); if (!href) return;
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'workLink', attrs: { href } }] }).run(); setUrl('');
    }}><input aria-label="Link address" type="url" placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} /><button disabled={!safeLink(url.trim())}>Insert link</button></form></details>
  </div>;
}
