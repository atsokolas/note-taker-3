import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

const freshId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`);

const reassignDuplicateBlockIds = (state, createId) => {
  const seen = new Set();
  const fixes = [];
  state.doc.descendants((node, pos) => {
    const id = node.attrs?.blockId;
    if (!id) return undefined;
    if (seen.has(id)) fixes.push({ pos, node });
    else seen.add(id);
    return undefined;
  });
  if (!fixes.length) return null;
  let tr = state.tr;
  for (let index = fixes.length - 1; index >= 0; index -= 1) {
    const { pos, node } = fixes[index];
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: createId() });
  }
  return tr;
};

// A split copies attrs, so the new paragraph inherits the old block id and
// every decoration for that id lands on both. The first copy keeps the id.
// Notes already saved with duplicates are repaired when the editor opens.
export const UniqueBlockIds = Extension.create({
  name: 'uniqueBlockIds',
  addOptions() {
    return { createId: freshId };
  },
  addProseMirrorPlugins() {
    const createId = this.options.createId;
    return [new Plugin({
      appendTransaction(transactions, _oldState, state) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        return reassignDuplicateBlockIds(state, createId);
      },
      view(editorView) {
        queueMicrotask(() => {
          if (editorView.isDestroyed) return;
          const tr = reassignDuplicateBlockIds(editorView.state, createId);
          if (tr) editorView.dispatch(tr);
        });
        return {};
      }
    })];
  }
});
