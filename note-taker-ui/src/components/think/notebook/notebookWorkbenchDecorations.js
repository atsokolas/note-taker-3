import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey('notebookWorkbenchDecorations');
let activateSavedTrialMark = null;

export const setSavedTrialMarkHandler = (handler) => {
  activateSavedTrialMark = typeof handler === 'function' ? handler : null;
};

const activateFromEvent = (event) => {
  const control = event?.target?.closest?.('[data-saved-trial-id]');
  if (!control) return false;
  const trialId = String(control.getAttribute('data-saved-trial-id') || '');
  if (!trialId || !activateSavedTrialMark) return false;
  event.preventDefault();
  activateSavedTrialMark(trialId);
  return true;
};

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
      rows.push(Decoration.node(pos, pos + node.nodeSize, { class: 'notebook-trial-original', 'aria-hidden': 'true' }));
      rows.push(Decoration.widget(pos, () => {
        const passage = document.createElement('div');
        passage.className = 'notebook-trial-preview-prose';
        if (Number.isInteger(state.preview.rangeStart) && Number.isInteger(state.preview.rangeEnd)) {
          passage.append(document.createTextNode(state.preview.text.slice(0, state.preview.rangeStart)));
          const wording = document.createElement('span');
          wording.className = 'notebook-trial-preview-wording';
          wording.textContent = state.preview.text.slice(state.preview.rangeStart, state.preview.rangeEnd);
          passage.append(wording, document.createTextNode(state.preview.text.slice(state.preview.rangeEnd)));
          passage.classList.add('is-scoped');
        } else passage.textContent = state.preview.text;
        passage.contentEditable = 'false';
        passage.setAttribute('aria-label', `Trial preview: ${state.preview.text}`);
        return passage;
      }, { key: `trial-${blockId}-${state.preview.text}`, side: -1 }));
    }
  });
  (state.savedMarks || []).forEach((mark) => {
    if (!Number.isInteger(mark.from) || !Number.isInteger(mark.to) || mark.to <= mark.from) return;
    rows.push(Decoration.inline(mark.from, mark.to, {
      class: 'notebook-saved-alternatives__range',
      'aria-hidden': 'true'
    }));
    rows.push(Decoration.widget(mark.to, () => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'notebook-saved-alternatives__mark';
      button.dataset.savedTrialId = String(mark.trialId || '');
      button.dataset.savedTrialKey = String(mark.trialKey || '');
      button.setAttribute('aria-label', 'Saved wording options');
      return button;
    }, { key: `saved-mark-${mark.trialKey}`, side: 1 }));
  });
  return DecorationSet.create(doc, rows);
};

export const NotebookWorkbenchDecorations = Extension.create({
  name: 'notebookWorkbenchDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: () => ({ targetBlockId: '', preview: null, savedMarks: [] }),
        apply: (tr, previous) => tr.getMeta(key) || previous
      },
      props: {
        decorations: (state) => decorations(state.doc, key.getState(state)),
        handleClick: (view, _pos, event) => activateFromEvent(event),
        handleKeyDown: (view, event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return false;
          if (!event.target?.closest?.('[data-saved-trial-id]')) return false;
          return activateFromEvent(event);
        }
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
      text: String(state.preview.text),
      rangeStart: state.preview.rangeStart,
      rangeEnd: state.preview.rangeEnd
    } : null,
    savedMarks: Array.isArray(state.savedMarks)
      ? state.savedMarks.map((mark) => ({
        trialKey: String(mark.trialKey || ''),
        trialId: String(mark.trialId || ''),
        blockId: String(mark.blockId || ''),
        from: mark.from,
        to: mark.to
      }))
      : []
  }));
  return true;
};
