import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey('notebookWorkbenchDecorations');

const decorations = (doc, state = {}) => {
  const rows = [];
  doc.descendants((node, pos) => {
    const blockId = String(node?.attrs?.blockId || '');
    if (!blockId) return;
    if (blockId === state.targetBlockId) {
      rows.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'notebook-held-target',
        'data-held-target': 'Passage will go here'
      }));
    }
    if (blockId === state.preview?.blockId && state.preview?.text) {
      rows.push(Decoration.node(pos, pos + node.nodeSize, {
        class: 'notebook-trial-preview',
        'data-trial-preview': state.preview.text,
        'aria-label': `Trial preview: ${state.preview.text}`
      }));
    }
  });
  return DecorationSet.create(doc, rows);
};

export const NotebookWorkbenchDecorations = Extension.create({
  name: 'notebookWorkbenchDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: () => ({ targetBlockId: '', preview: null }),
        apply: (tr, previous) => tr.getMeta(key) || previous
      },
      props: {
        decorations: state => decorations(state.doc, key.getState(state))
      }
    })];
  }
});

export const setNotebookWorkbenchDecorations = (editor, state = {}) => {
  if (!editor?.state?.tr || !editor?.view?.dispatch) return false;
  editor.view.dispatch(editor.state.tr.setMeta(key, {
    targetBlockId: String(state.targetBlockId || ''),
    preview: state.preview?.blockId && state.preview?.text ? {
      blockId: String(state.preview.blockId),
      text: String(state.preview.text)
    } : null
  }));
  return true;
};
