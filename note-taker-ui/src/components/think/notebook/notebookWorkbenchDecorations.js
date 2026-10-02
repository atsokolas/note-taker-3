import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { resolveSavedMark } from '../../../utils/notebookSavedTrialMarks';

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

const findBlock = (doc, blockId) => {
  const wanted = String(blockId || '');
  if (!wanted) return null;
  let match = null;
  doc.descendants((node, pos) => {
    if (match) return false;
    if (String(node?.attrs?.blockId || '') !== wanted) return undefined;
    match = { node, pos };
    return false;
  });
  return match;
};

const identity = (mark) => ({
  trialKey: String(mark?.trialKey || ''),
  trialId: String(mark?.trialId || ''),
  blockId: String(mark?.blockId || ''),
  baseText: String(mark?.baseText || ''),
  rangeStart: Number.isInteger(mark?.rangeStart) ? mark.rangeStart : 0,
  rangeEnd: Number.isInteger(mark?.rangeEnd) ? mark.rangeEnd : null
});

const decorations = (doc, state = {}) => {
  const rows = [];
  const held = findBlock(doc, state.targetBlockId);
  if (held) {
    const start = Number(state.targetRange?.rangeStart);
    const end = Number(state.targetRange?.rangeEnd);
    const scoped = Number.isInteger(start) && Number.isInteger(end) && end > start && end <= String(held.node.textContent || '').length;
    if (scoped) {
      rows.push(Decoration.inline(held.pos + 1 + start, held.pos + 1 + end, { class: 'notebook-held-range' }));
    } else if (!state.targetRange) {
      rows.push(Decoration.node(held.pos, held.pos + held.node.nodeSize, { class: 'notebook-held-target' }));
    }
  }
  const preview = state.preview?.blockId && state.preview?.text ? findBlock(doc, state.preview.blockId) : null;
  if (preview) {
    rows.push(Decoration.node(preview.pos, preview.pos + preview.node.nodeSize, { class: 'notebook-trial-original' }));
    rows.push(Decoration.widget(preview.pos, () => {
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
    }, { key: `trial-${state.preview.blockId}-${state.preview.text}`, side: -1 }));
  }
  (state.savedMarks || []).forEach((mark) => {
    const saved = identity(mark);
    const located = resolveSavedMark(doc, saved);
    if (!located) return;
    rows.push(Decoration.inline(located.from, located.to, { class: 'notebook-saved-alternatives__range' }));
    rows.push(Decoration.widget(located.to, () => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'notebook-saved-alternatives__mark';
      button.dataset.savedTrialId = saved.trialId;
      button.dataset.savedTrialKey = saved.trialKey;
      button.setAttribute('aria-label', 'Saved wording options');
      return button;
    }, { key: `saved-mark-${saved.trialKey}`, side: 1 }));
  });
  return DecorationSet.create(doc, rows);
};

export const NotebookWorkbenchDecorations = Extension.create({
  name: 'notebookWorkbenchDecorations',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: () => ({ targetBlockId: '', targetRange: null, preview: null, savedMarks: [] }),
        apply: (tr, previous) => tr.getMeta(key) || previous
      },
      props: {
        decorations: (state) => decorations(state.doc, key.getState(state)),
        handleClick: (_view, _pos, event) => activateFromEvent(event),
        handleKeyDown: (_view, event) => {
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
  const rangeStart = Number(state.targetRange?.rangeStart);
  const rangeEnd = Number(state.targetRange?.rangeEnd);
  editor.view.dispatch(editor.state.tr.setMeta(key, {
    targetBlockId: String(state.targetBlockId || ''),
    targetRange: Number.isInteger(rangeStart) && Number.isInteger(rangeEnd)
      ? { rangeStart, rangeEnd }
      : null,
    preview: state.preview?.blockId && state.preview?.text ? {
      blockId: String(state.preview.blockId),
      text: String(state.preview.text),
      rangeStart: state.preview.rangeStart,
      rangeEnd: state.preview.rangeEnd
    } : null,
    savedMarks: Array.isArray(state.savedMarks) ? state.savedMarks.map(identity) : []
  }));
  return true;
};
