import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { countWords } from '../../../pages/thinkNotesModel';

export const PENCIL_WRITTEN = 'pencilLinesWritten';

/* A line written out from the outline arrives in pencil. The first time you
   change it, it is yours, and turns to ink. Loading or rearranging the whole
   page is not a touch, nor is the write-out itself, nor dropping lines in. */
const wholePage = tr => tr.mapping.maps.some(map => {
  let all = false;
  map.forEach((from, to) => { if (from === 0 && to >= tr.before.content.size) all = true; });
  return all;
});

/* Where these transactions changed the page, in the final page's positions. */
const touchedRanges = (transactions) => {
  let ranges = [];
  transactions.forEach(tr => {
    const counts = !tr.getMeta(PENCIL_WRITTEN) && tr.getMeta('uiEvent') !== 'drop' && !wholePage(tr);
    tr.mapping.maps.forEach(map => {
      ranges = ranges.map(([from, to]) => [map.map(from, -1), map.map(to, 1)]);
      if (counts) map.forEach((_from, _to, start, end) => ranges.push([start, end]));
    });
  });
  return ranges;
};

const inkTouched = (transactions, _oldState, state) => {
  const touched = touchedRanges(transactions);
  if (!touched.length) return null;
  let tr = null;
  touched.forEach(([from, to]) => {
    state.doc.nodesBetween(Math.max(0, from), Math.min(state.doc.content.size, Math.max(from, to)), (node, pos) => {
      if (!node.attrs?.pencil) return true;
      tr = (tr || state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, pencil: false });
      return false;
    });
  });
  return tr;
};

export const PencilLines = Extension.create({
  name: 'pencilLines',
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        pencil: {
          default: false,
          parseHTML: element => element.hasAttribute('data-pencil'),
          renderHTML: attributes => (attributes.pencil ? { 'data-pencil': '' } : {})
        }
      }
    }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: inkTouched })];
  }
});

/** Pencil lines are on the page, but they are not yet words you wrote. */
export const pencilWordCount = (doc) => {
  let words = 0;
  doc?.descendants?.(node => {
    if (node.attrs?.pencil) words += countWords(node.textContent);
    return !node.isTextblock;
  });
  return words;
};

/* Lines written out from the outline go in after the passage you were
   writing in (at the end if you were only reading), or take the place of an
   empty line. The caret waits at the end of the first of them. */
export const writeIntoDraft = (editor, nodes) => {
  if (!editor || !nodes?.length) return false;
  const { state } = editor;
  const { $from } = state.selection;
  const block = editor.isEditable && $from.depth ? $from.node(1) : null;
  const empty = Boolean(block?.isTextblock && !block.textContent);
  const from = !block ? state.doc.content.size : empty ? $from.before(1) : $from.after(1);
  const content = nodes.map(node => editor.schema.nodeFromJSON(node));
  const tr = state.tr.replaceWith(from, empty ? $from.after(1) : from, content).setMeta(PENCIL_WRITTEN, true);
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + content[0].nodeSize - 1)).scrollIntoView());
  return true;
};
