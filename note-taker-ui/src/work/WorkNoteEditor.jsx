import React, { useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import { createDocument, Extension, Mark, mergeAttributes, markPasteRule } from '@tiptap/core';
import EditorDraftShell from '../components/think/editor/EditorDraftShell';
import { notebookWritingExtensions } from '../components/think/editor/notebookWriting';
import { handleEditorStructureShortcut } from '../components/think/editor/editorShortcuts';
import { moveCurrentBlock } from '../components/think/editor/blockMovement';
import useSlashCommands from '../components/think/editor/useSlashCommands';
import { buildDocFromBlocks, ensureBlockIds, serializeBlocksFromDoc } from '../utils/notebookBlocks';
import { dayInZone, validDay } from './workPlannerModel';
import { WorkOutline, foldedHeadings, noteOutline, outlineKey } from './workNoteOutline';
import { entryDateLabel, noteEntries } from './workNoteEntries';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import '../styles/think-writing.css';
import WorkMenu from './WorkMenu';

const scrollToWriting = (editor, position, block = 'start') => window.requestAnimationFrame(() => {
  if (!editor.isDestroyed) editor.view.nodeDOM(position)?.scrollIntoView?.({ block });
});
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

export default function WorkNoteEditor({ note, onChange, onMakeOpen, fresh = false, sourceBlock = null, today = dayInZone(), heading = null, tools = null }) {
  const surface = useRef(null), contents = useRef(null), change = useRef(onChange), slashKey = useRef(null), returnPoint = useRef(null), composing = useRef(false);
  change.current = onChange;
  const [url, setUrl] = useState('');
  const [entryDate, setEntryDate] = useState(null);
  const [sourceMissing, setSourceMissing] = useState(false);
  const day = entryDate ?? today;
  const content = note.content || (note.blocks?.length ? buildDocFromBlocks(note.blocks) : '<p></p>');
  const editor = useEditor({
    extensions: [...notebookWritingExtensions(), WorkLink, WorkEntryDates, WorkOutline],
    content,
    autofocus: fresh ? 'end' : false,
    editorProps: {
      attributes: { class: 'think-notebook-editor-body', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Work note writing' },
      handleDOMEvents: { compositionstart: () => { composing.current = true; return false; }, compositionend: () => { composing.current = false; return false; } },
      handleKeyDown: (view, event) => slashKey.current?.(view, event) || handleEditorStructureShortcut({ editor, event }) || false
    },
    onTransaction: ({ transaction, editor: current }) => {
      if (returnPoint.current) returnPoint.current.bookmark = returnPoint.current.bookmark.map(transaction.mapping);
      if (note._id && transaction.getMeta(outlineKey)?.type !== 'restore' && (transaction.docChanged || transaction.getMeta(outlineKey))) {
        try { localStorage.setItem(`noeis:work:folds:${note._id}`, JSON.stringify(noteOutline(transaction.doc).filter(heading => foldedHeadings(current).has(heading.position)).map(heading => heading.id).filter(Boolean))); } catch (_) { /* Folding is optional display state; writing still saves normally. */ }
      }
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
    let sourcePosition = from;
    if (!empty) {
      let found = false;
      editor.state.doc.nodesBetween(from, to, (node, position) => {
        if (!found && node.isText && node.text.slice(Math.max(0, from - position), Math.min(node.nodeSize, to - position)).trim()) { sourcePosition = Math.max(from, position); found = true; }
      });
    }
    const $source = editor.state.doc.resolve(sourcePosition);
    let source = $source.parent;
    for (let depth = $source.depth; depth > 0; depth -= 1) if ($source.node(depth).type.name === 'listItem') { source = $source.node(depth); break; }
    for (let depth = 1; depth <= $source.depth; depth += 1) if ($source.node(depth).type.name === 'blockquote') { source = $source.node(depth); break; }
    const meeting = noteEntries(editor.state.doc).filter(entry => entry.position <= sourcePosition).at(-1);
    onMakeOpen({ text, origin: { quote: text, blockId: source.attrs.blockId || null, ...(meeting ? { day: meeting.day } : {}) }, returnToWriting: () => {
      const point = returnPoint.current; returnPoint.current = null;
      if (!point || editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setSelection(point.bookmark.resolve(editor.state.doc)));
      editor.view.focus(); point.scroll.forEach(([node, left, top]) => { node.scrollLeft = left; node.scrollTop = top; });
      if (window.scrollX !== point.x || window.scrollY !== point.y) window.scrollTo(point.x, point.y);
    } });
  };
  useLayoutEffect(() => {
    if (!editor || !note._id) return;
    try { const ids = JSON.parse(localStorage.getItem(`noeis:work:folds:${note._id}`) || '[]'); if (Array.isArray(ids)) editor.view.dispatch(editor.state.tr.setMeta(outlineKey, { type: 'restore', ids })); } catch (_) { /* Optional display preference. */ }
  }, [editor, note._id]);
  useLayoutEffect(() => {
    if (!editor || !sourceBlock) { setSourceMissing(false); return; }
    let passage;
    editor.state.doc.descendants((node, position) => {
      if (node.attrs.blockId !== sourceBlock) return;
      if (node.isTextblock) passage = { from: position + 1, to: position + node.nodeSize - 1, position };
      else node.descendants((child, offset) => { if (child.isTextblock) { const at = position + 1 + offset; passage = { from: passage?.from ?? at + 1, to: at + child.nodeSize - 1, position }; } });
    });
    setSourceMissing(!passage);
    if (passage) editor.chain().focus(null, { scrollIntoView: false }).setMeta(outlineKey, { type: 'reveal', position: passage.position }).setTextSelection({ from: passage.from, to: passage.to }).run();
    if (passage) scrollToWriting(editor, passage.position);
  }, [editor, sourceBlock]);
  const entries = editor ? noteEntries(editor.state.doc) : [];
  const outline = editor ? noteOutline(editor.state.doc) : [];
  const folded = editor ? foldedHeadings(editor) : new Set();
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
    editor.chain().focus(null, { scrollIntoView: false }).setMeta(outlineKey, { type: 'reveal', position: entry.position + entry.size }).setTextSelection(position).run();
    scrollToWriting(editor, writing ? editor.state.doc.resolve(position).before() : entry.position, writing ? 'end' : 'start');
    if (contents.current) contents.current.open = false;
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
  return <div className={`work-writing ${entries.length ? 'has-dates' : ''}`}>
    <header className="work-note-header">
      {heading}
      <div className="work-entry-tools" aria-label="Dated entries and writing tools">
        <WorkMenu label="Dates" className="work-dates">
        {entries.length ? <nav aria-label="Meeting dates"><label className="work-sr-only" htmlFor={`work-dates-${note._id || 'draft'}`}>Go to meeting date</label><select id={`work-dates-${note._id || 'draft'}`} value="" onChange={event => { const entry = entries.find(value => value.day === event.target.value); if (entry) openEntry(entry); }}><option value="">Meeting dates ({entries.length})</option>{entries.filter((entry, index) => entries.findIndex(other => other.day === entry.day) === index).slice().sort((a, b) => b.day.localeCompare(a.day)).map(entry => <option key={entry.day} value={entry.day}>{entryDateLabel(entry.day)}</option>)}</select></nav> : null}
        <form onSubmit={event => { event.preventDefault(); addEntry(); event.currentTarget.closest("details").open = false; }}><label><span className="work-sr-only">Entry date</span><input aria-label="Meeting entry date" type="date" required value={day} onChange={event => setEntryDate(event.target.value)} /></label><button type="submit" disabled={!editor || !validDay(day)}>Use date</button>{editor && !editor.isEmpty && !entries.length ? <button type="button" onClick={() => addEntry(true)} disabled={!validDay(day)}>Date existing writing</button> : null}</form>
        </WorkMenu>
        <button className="work-new-entry" aria-label={entries.some(entry => entry.day === day) ? 'Continue this entry' : 'Add dated entry'} disabled={!editor || !validDay(day)} onClick={() => addEntry()}>+ Entry</button>
        <WorkMenu label="Writing tools" icon="more" className="work-writing-tools">
        <label className="work-heading-select"><span className="work-sr-only">Text style</span><select aria-label="Text style" value={editor?.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph'} onChange={event => { if (event.target.value === 'paragraph') editor.chain().focus().setParagraph().run(); else editor.chain().focus().setHeading({ level: Number(event.target.value) }).run(); }}><option value="paragraph">Body</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option></select></label>
        {outline.length ? <details ref={contents} className="work-contents" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); const details = event.currentTarget; details.open = false; details.querySelector('summary').focus(); } }}><summary>Contents <small>{outline.length}</small></summary><nav aria-label="Table of contents"><div className="work-outline-levels"><label>Collapse level<select aria-label="Collapse heading level" defaultValue="" onChange={event => { if (event.target.value) editor.view.dispatch(editor.state.tr.setMeta(outlineKey, { type: 'level', level: Number(event.target.value) })); event.target.value = ''; }}><option value="">Choose…</option>{[1, 2, 3].map(level => <option value={level} key={level}>Heading {level}</option>)}</select></label><button type="button" onClick={() => editor.view.dispatch(editor.state.tr.setMeta(outlineKey, { type: 'expand' }))}>Expand all</button></div><ol>{outline.map(heading => <li key={heading.position} style={{ '--heading-level': heading.level }}><button type="button" aria-expanded={!folded.has(heading.position)} aria-label={`${folded.has(heading.position) ? 'Expand' : 'Collapse'} section ${heading.title}`} onClick={() => editor.view.dispatch(editor.state.tr.setMeta(outlineKey, { type: 'toggle', position: heading.position }))}>{folded.has(heading.position) ? '▸' : '▾'}</button><button type="button" onClick={() => openEntry(heading)}>{heading.title}</button></li>)}</ol></nav></details> : null}
{onMakeOpen ? <button type="button" onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={event => { event.currentTarget.closest('details').open = false; makeOpen(); }}>Make Open</button> : null}<button onClick={() => moveCurrentBlock(editor, 'up')}>Move paragraph up</button><button onClick={() => moveCurrentBlock(editor, 'down')}>Move paragraph down</button><form onSubmit={event => {
      event.preventDefault(); const href = safeLink(url.trim()); if (!href) return;
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'workLink', attrs: { href } }] }).run(); setUrl('');
    }}><input aria-label="Link address" type="url" placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} /><button disabled={!safeLink(url.trim())}>Insert link</button></form>{tools}
        </WorkMenu>
      </div>
    </header>
      {folded.size ? <p className="work-fold-status" role="status">{folded.size} {folded.size === 1 ? 'section' : 'sections'} collapsed. <button type="button" onClick={() => editor.view.dispatch(editor.state.tr.setMeta(outlineKey, { type: 'expand' }))}>Show all writing</button></p> : null}
    {sourceMissing ? <p className="work-source-missing" role="status">The original passage has changed. Its source note is open.</p> : null}
    <EditorDraftShell editor={editor} surfaceRef={surface} contextualToolbar slashCommands={slash} magnetCaretToolbar={false} hideBlockControls onMakeOpen={onMakeOpen ? makeOpen : null} helperCopy="Select words or use Writing tools to Make Open." />

  </div>;
}
