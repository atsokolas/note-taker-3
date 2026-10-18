import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMarginNotes } from '../../../api/retrieval';
import {
  MARGIN_MIN_WORDS,
  MarginNote,
  placeBeside,
  useMarginHint,
  wordCount
} from '../../margins/LibraryMargins';
import { passageContent } from '../editor/writingParts';

const PAUSE_MS = 1400;

/* The top-level paragraph the caret is in, if it is one. */
const caretParagraph = (editor) => {
  const selection = editor?.state?.selection;
  if (!selection?.empty) return null;
  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return null;
  return {
    text: $from.parent.textContent,
    start: $from.before(1),
    after: $from.after(1),
    atEnd: $from.parentOffset === $from.parent.content.size
  };
};

const quotedIds = (editor) => {
  const ids = [];
  editor?.state?.doc?.descendants?.((node) => {
    if (node.type.name === 'highlightRef' && node.attrs.highlightId) ids.push(String(node.attrs.highlightId));
  });
  return ids;
};

/* A paragraph extended since it was asked about is still that paragraph. */
const stillWriting = (here, ghost) => Boolean(here && ghost && here.text.startsWith(ghost.text));

/* While writing: after a pause in a paragraph long enough to ask about, the
   closest passage you marked elsewhere waits beside it as a ghost. Tab at the
   end of the paragraph, or a click, quotes it in with its citation; Esc lets
   it go for the rest of this sitting. Nothing close means nothing shown. */
const useGhostQuote = (editor, { enabled = false, createId } = {}) => {
  const [ghost, setGhost] = useState(null);
  const ghostRef = useRef(null);
  const dismissed = useRef(new Set());
  const asked = useRef('');
  const show = useCallback((next) => {
    ghostRef.current = next;
    setGhost(next);
  }, []);

  const place = useCallback((current) => {
    if (!current || !editor?.view) return current;
    const here = caretParagraph(editor);
    const node = here && editor.view.nodeDOM?.(here.start);
    const column = editor.view.dom;
    const frame = column?.closest?.('.think-notebook-editor__body');
    if (!node?.getBoundingClientRect || !frame) return current;
    return { ...current, place: placeBeside(node, frame, column) };
  }, [editor]);

  useEffect(() => {
    if (!editor || !enabled) {
      show(null);
      return undefined;
    }
    let timer = null;
    let live = true;
    const follow = () => {
      const current = ghostRef.current;
      if (current) show(stillWriting(caretParagraph(editor), current) ? place(current) : null);
    };
    const ask = async () => {
      const paragraph = caretParagraph(editor);
      if (!paragraph || wordCount(paragraph.text) < MARGIN_MIN_WORDS || paragraph.text === asked.current) return;
      asked.current = paragraph.text;
      const notes = await fetchMarginNotes({
        paragraphs: [paragraph.text],
        excludeHighlightIds: quotedIds(editor)
      }).catch(() => []);
      const note = notes.find(item => item.highlight?._id && !dismissed.current.has(String(item.highlight._id)));
      if (!live || !note || !stillWriting(caretParagraph(editor), paragraph)) return;
      show(place({ text: paragraph.text, note, place: { mode: 'margin', top: 0, left: 0 } }));
    };
    const onUpdate = () => {
      follow();
      window.clearTimeout(timer);
      timer = window.setTimeout(ask, PAUSE_MS);
    };
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', follow);
    // The page around the note moves as writing starts and settles; the margin moves with it.
    window.addEventListener('resize', follow);
    document.addEventListener('transitionend', follow);
    return () => {
      live = false;
      window.clearTimeout(timer);
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', follow);
      window.removeEventListener('resize', follow);
      document.removeEventListener('transitionend', follow);
    };
  }, [editor, enabled, place, show]);

  const dismiss = useCallback(() => {
    const current = ghostRef.current;
    if (current) dismissed.current.add(String(current.note.highlight._id));
    show(null);
  }, [show]);

  const quote = useCallback(() => {
    const current = ghostRef.current;
    if (!current || !editor) return;
    let after = null;
    const here = caretParagraph(editor);
    if (stillWriting(here, current)) after = here.after;
    else {
      editor.state.doc.forEach((node, offset) => {
        if (after == null && node.type.name === 'paragraph' && node.textContent.startsWith(current.text)) {
          after = offset + node.nodeSize;
        }
      });
    }
    dismiss();
    if (after == null) return;
    editor.chain().focus().insertContentAt(after, passageContent(current.note.highlight, { blockId: createId?.() })).run();
  }, [createId, dismiss, editor]);

  /* For the editor's key handler: true when the key was the ghost's. */
  const handleKey = useCallback((event) => {
    if (!ghostRef.current) return false;
    if (event.key === 'Escape') {
      dismiss();
      return true;
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const here = caretParagraph(editor);
      if (!here?.atEnd || !stillWriting(here, ghostRef.current)) return false;
      event.preventDefault();
      quote();
      return true;
    }
    return false;
  }, [dismiss, editor, quote]);

  return { ghost, quote, dismiss, handleKey };
};

export const GhostQuote = ({ ghost, onQuote }) => {
  const hint = useMarginHint();
  if (!ghost?.place) return null;
  return (
    <div className="library-margins is-writing">
      <MarginNote note={ghost.note} place={ghost.place} onQuote={onQuote} hint={hint} />
    </div>
  );
};

export default useGhostQuote;
