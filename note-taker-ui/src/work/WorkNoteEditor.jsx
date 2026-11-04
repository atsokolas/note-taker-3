import React, { useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import { createDocument, Extension, Mark, mergeAttributes, markPasteRule } from '@tiptap/core';
import EditorDraftShell from '../components/think/editor/EditorDraftShell';
import { notebookWritingExtensions } from '../components/think/editor/notebookWriting';
import { handleEditorStructureShortcut } from '../components/think/editor/editorShortcuts';
import { moveCurrentBlock } from '../components/think/editor/blockMovement';
import useSlashCommands from '../components/think/editor/useSlashCommands';
import { buildDocFromBlocks, ensureBlockIds, serializeBlocksFromDoc } from '../utils/notebookBlocks';
import { dayInZone, displayDay, validDay } from './workPlannerModel';
import { entryDateLabel, noteEntries } from './workNoteEntries';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import '../styles/think-writing.css';

const safeLink = value => /^https?:\/\//i.test(value || '') ? value : null;
const WorkLink = Mark.create({
  name: 'workLink',
  addAttributes: () => ({ href: { default: null } }),
  parseHTML: () => [{ tag: 'a[href]', getAttrs: node => safeLink(node.getAttribute('href')) ? { href: node.getAttribute('href') } : false }],
  renderHTML: ({ HTMLAttributes }) => ['a', mergeAttributes(HTMLAttributes, { href: safeLink(HTMLAttributes.href), target: '_blank', rel: 'noopener noreferrer' }), 0],
  addPasteRules() { return [markPasteRule({ find: /https?:\/\/[^\s<>]+/g, type: this.type, getAttributes: match => ({ href: match[0] }) })]; }
});

const WorkEntryDates = Extension.create({
  name: 'workEntryDates',
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations: state => DecorationSet.create(state.doc,
      noteEntries(state.doc).map(entry => Decoration.node(entry.position, entry.position + entry.size, { class: 'work-entry-date', 'data-entry-date': entry.day }))
    ) } })];
  }
});

export default function WorkNoteEditor({ note, onChange, onMakeOpen, fresh = false, today = dayInZone() }) {
  const surface = useRef(null), change = useRef(onChange), slashKey = useRef(null), returnPoint = useRef(null), composing = useRef(false);
  change.current = onChange;
  const [url, setUrl] = useState('');
  const [entryDate, setEntryDate] = useState(null);
  const day = entryDate ?? today;
  const content = note.content || (note.blocks?.length ? buildDocFromBlocks(note.blocks) : '<p></p>');
  const editor = useEditor({
    extensions: [...notebookWritingExtensions(), WorkLink, WorkEntryDates],
    content,
    autofocus: fresh ? 'end' : false,
    editorProps: {
      attributes: { class: 'think-notebook-editor-body', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Work note writing' },
      handleDOMEvents: { compositionstart: () => { composing.current = true; return false; }, compositionend: () => { composing.current = false; return false; } },
      handleKeyDown: (view, event) => slashKey.current?.(view, event) || handleEditorStructureShortcut({ editor, event }) || false
    },
    onTransaction: ({ transaction }) => {
      if (returnPoint.current) returnPoint.current.bookmark = returnPoint.current.bookmark.map(transaction.mapping);
    },
    onUpdate: ({ editor: current }) => {
      const { node, changed } = ensureBlockIds(current.getJSON());
      if (changed) {
        const transaction = current.state.tr;
        current.schema.nodeFromJSON(node).descendants((block, position) => {
          if (block.attrs.blockId && block.attrs.blockId !== current.state.doc.nodeAt(position)?.attrs.blockId) transaction.setNodeMarkup(position, undefined, block.attrs);
        });
        current.view.dispatch(transaction.setMeta('preventUpdate', true).setMeta('addToHistory', false));
      }
      change.current({ content: current.getHTML(), blocks: serializeBlocksFromDoc(node) });
    }
  });
  useLayoutEffect(() => {
    if (!editor) return;
    const accepted = createDocument(content, editor.schema, { preserveWhitespace: 'full' });
    // Publish an accepted replacement before typing can use its new revision.
    // Local edits and their receipts already match, so their selection stays put.
    if (!editor.state.doc.eq(accepted)) editor.chain().setMeta('addToHistory', false).setContent(accepted, false).run();
  }, [editor, content]);
  const makeOpen = () => {
    if (!onMakeOpen || !editor || composing.current || editor.view.composing) return;
    const { from, to, empty, $from } = editor.state.selection;
    const text = empty ? ($from.parent.isTextblock ? $from.parent.textBetween(0, $from.parent.content.size, '\n', '\n') : '') : editor.state.doc.textBetween(from, to, '\n', '\n');
    if (!text.trim()) return;
    const scroll = [];
    for (let node = editor.view.dom.parentElement; node; node = node.parentElement) scroll.push([node, node.scrollLeft, node.scrollTop]);
    returnPoint.current = { bookmark: editor.state.selection.getBookmark(), x: window.scrollX, y: window.scrollY, scroll };
    onMakeOpen({ text, returnToWriting: () => {
      const point = returnPoint.current; returnPoint.current = null;
      if (!point || editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setSelection(point.bookmark.resolve(editor.state.doc)));
      editor.view.focus(); point.scroll.forEach(([node, left, top]) => { node.scrollLeft = left; node.scrollTop = top; });
      if (window.scrollX !== point.x || window.scrollY !== point.y) window.scrollTo(point.x, point.y);
    } });
  };
  const entries = editor ? noteEntries(editor.state.doc) : [];
  const openEntry = (entry, writing = false) => {
    let position = entry.position + 1, hasBody = false;
    if (writing) editor.state.doc.nodesBetween(entry.position + entry.size, entry.end, (node, at) => {
      if (node.isTextblock) { position = at + node.nodeSize - 1; hasBody = true; }
    });
    if (writing && !hasBody) {
      const at = entry.position + entry.size;
      editor.commands.insertContentAt(at, { type: 'paragraph' });
      position = at + 1;
    }
    editor.chain().focus().setTextSelection(position).scrollIntoView().run();
  };
  const addEntry = (existingWriting = false) => {
    if (!editor || !validDay(day)) return;
    const existing = noteEntries(editor.state.doc).find(entry => entry.day === day);
    if (existing) { openEntry(existing, true); return; }
    const heading = { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: entryDateLabel(day) }] };
    const position = existingWriting ? 0 : editor.isEmpty ? { from: 0, to: editor.state.doc.content.size } : editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(position, existingWriting ? heading : [heading, { type: 'paragraph' }]).run();
    const added = noteEntries(editor.state.doc).find(entry => entry.day === day);
    if (added) openEntry(added, !existingWriting);
  };
  const slash = useSlashCommands({ editor, containerRef: surface });
  slashKey.current = slash.onKeyDown;
  return <div className="work-writing">
    <section className="work-entry-tools" aria-label="Dated entries">
      {entries.length ? <nav aria-label="Meeting dates">{entries.filter((entry, index) => entries.findIndex(other => other.day === entry.day) === index).slice().sort((a, b) => b.day.localeCompare(a.day)).map(entry => <button type="button" key={entry.day} aria-label={`Go to ${entryDateLabel(entry.day)}`} onClick={() => openEntry(entry)}><time dateTime={entry.day}>{displayDay(entry.day, { day: 'numeric', month: 'short', year: 'numeric' })}</time></button>)}</nav> : null}
      <form onSubmit={event => { event.preventDefault(); addEntry(); }}><label>Entry date<input aria-label="Meeting entry date" type="date" required value={day} onChange={event => setEntryDate(event.target.value)} /></label><button type="submit" disabled={!editor || !validDay(day)}>{entries.some(entry => entry.day === day) ? 'Continue this entry' : 'Add dated entry'}</button>{editor && !editor.isEmpty && !entries.length ? <button type="button" onClick={() => addEntry(true)} disabled={!validDay(day)}>Date existing writing</button> : null}</form>
    </section>
    <EditorDraftShell editor={editor} surfaceRef={surface} contextualToolbar slashCommands={slash} magnetCaretToolbar={false} hideBlockControls onMakeOpen={onMakeOpen ? makeOpen : null} helperCopy="Select words or use Writing tools to Make Open." />
    <details className="work-writing-tools"><summary>Writing tools</summary>{onMakeOpen ? <button type="button" onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={makeOpen}>Make Open</button> : null}<button onClick={() => moveCurrentBlock(editor, 'up')}>Move paragraph up</button><button onClick={() => moveCurrentBlock(editor, 'down')}>Move paragraph down</button><form onSubmit={event => {
      event.preventDefault(); const href = safeLink(url.trim()); if (!href) return;
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'workLink', attrs: { href } }] }).run(); setUrl('');
    }}><input aria-label="Link address" type="url" placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} /><button disabled={!safeLink(url.trim())}>Insert link</button></form></details>
  </div>;
}
