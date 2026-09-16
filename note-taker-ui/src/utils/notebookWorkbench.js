const list = value => (Array.isArray(value) ? value : []);
const text = value => String(value || '');

export const emptyNotebookWorkingState = () => ({
  revision: 0,
  materials: [],
  trials: [],
  looseThoughts: [],
  nextTimeLine: { text: '', target: { blockId: '', offset: 0, baseText: '' }, updatedAt: null },
  continuity: { target: { blockId: '', offset: 0, baseText: '' }, scrollY: 0, updatedAt: null }
});

const target = (value = {}) => ({
  blockId: text(value.blockId),
  offset: Math.max(0, Number(value.offset) || 0),
  baseText: text(value.baseText)
});

export const normalizeNotebookWorkingState = (value = {}) => ({
  revision: Math.max(0, Number(value.revision) || 0),
  materials: list(value.materials).filter(item => item?.id).map(item => ({ ...item, target: target(item.target) })),
  trials: list(value.trials).filter(item => item?.id).map(item => ({ ...item, target: target(item.target) })),
  looseThoughts: list(value.looseThoughts).filter(item => item?.id && text(item.text).trim()).map(item => ({ ...item, target: target(item.target) })),
  nextTimeLine: {
    text: text(value.nextTimeLine?.text),
    target: target(value.nextTimeLine?.target),
    updatedAt: value.nextTimeLine?.updatedAt || null
  },
  continuity: {
    target: target(value.continuity?.target),
    scrollY: Math.max(0, Number(value.continuity?.scrollY) || 0),
    updatedAt: value.continuity?.updatedAt || null
  }
});

export const targetFromEditor = (editor) => {
  const selection = editor?.state?.selection;
  const parent = selection?.$from?.parent;
  const blockId = text(parent?.attrs?.blockId);
  if (!blockId) return null;
  return {
    blockId,
    offset: Math.max(0, Number(selection.$from.parentOffset) || 0),
    baseText: text(parent.textContent)
  };
};

export const resolveEditorTarget = (editor, savedTarget, { requireSameText = false } = {}) => {
  const blockId = text(savedTarget?.blockId);
  const doc = editor?.state?.doc;
  if (!blockId || typeof doc?.descendants !== 'function') return { status: 'missing' };
  let match = null;
  doc.descendants((node, pos) => {
    if (match || text(node?.attrs?.blockId) !== blockId) return;
    match = { node, pos, currentText: text(node.textContent) };
  });
  if (!match) return { status: 'missing' };
  const stale = Boolean(savedTarget?.baseText) && match.currentText !== text(savedTarget.baseText);
  return {
    ...match,
    status: requireSameText && stale ? 'stale' : 'ready',
    stale,
    from: match.pos + 1,
    to: match.pos + Math.max(1, match.node.nodeSize - 1),
    caret: match.pos + 1 + Math.min(Math.max(0, Number(savedTarget?.offset) || 0), match.node.content?.size || 0)
  };
};

export const focusEditorTarget = (editor, savedTarget) => {
  const found = resolveEditorTarget(editor, savedTarget);
  if (found.status !== 'ready') return false;
  editor.commands?.setTextSelection?.(found.caret);
  editor.commands?.focus?.();
  return true;
};

export const replaceEditorTargetText = (editor, savedTarget, nextText) => {
  const found = resolveEditorTarget(editor, savedTarget, { requireSameText: true });
  if (found.status !== 'ready' || !found.node?.isTextblock || !editor?.state?.tr || !editor?.view?.dispatch) return found;
  const tr = editor.state.tr.insertText(text(nextText), found.from, found.to);
  editor.view.dispatch(tr.scrollIntoView());
  return { ...found, applied: true };
};

export const insertAfterEditorTarget = (editor, savedTarget, content) => {
  const found = resolveEditorTarget(editor, savedTarget);
  if (found.status !== 'ready' || !editor?.chain) return found;
  const inserted = editor.chain().focus().insertContentAt(found.pos + found.node.nodeSize, content).run();
  return { ...found, applied: inserted !== false };
};

export const deleteEditorBlockById = (editor, blockId) => {
  const found = resolveEditorTarget(editor, { blockId });
  if (found.status !== 'ready' || !editor?.state?.tr || !editor?.view?.dispatch) return false;
  editor.view.dispatch(editor.state.tr.delete(found.pos, found.pos + found.node.nodeSize).scrollIntoView());
  return true;
};

const visit = (node, callback) => {
  if (!node || typeof node !== 'object') return;
  callback(node);
  list(node.content).forEach(child => visit(child, callback));
};

export const citationTargetsForMaterial = (doc, material) => {
  const exactIds = material?.kind === 'highlight'
    ? [material?.highlightId, material?.sourceId]
    : material?.kind === 'article'
      ? [material?.articleId, material?.sourceId]
      : [material?.sourceId];
  const identities = new Set(exactIds.filter(Boolean).map(String));
  const targets = [];
  visit(doc, node => {
    const attrs = node.attrs || {};
    const matches = [attrs.highlightId, attrs.articleId, attrs.conceptId, attrs.questionId, attrs.wikiId]
      .filter(Boolean)
      .some(id => identities.has(String(id)));
    if (matches && attrs.blockId && !targets.includes(String(attrs.blockId))) targets.push(String(attrs.blockId));
  });
  return targets;
};

export const sourceNodeForMaterial = (material) => {
  const blockId = `source-${material.id}`;
  if (material.kind === 'highlight') {
    return {
      type: 'highlightRef',
      attrs: {
        blockId,
        highlightId: material.highlightId || material.sourceId || '',
        highlightText: material.text || '',
        articleTitle: material.title || '',
        articleId: material.articleId || '',
        sourcePath: material.sourcePath || '',
        tags: ''
      }
    };
  }
  return {
    type: 'articleRef',
    attrs: {
      blockId,
      articleId: material.articleId || material.sourceId || '',
      articleTitle: material.title || '',
      articleMeta: ''
    }
  };
};

export const privateRecoveryFile = ({ entry, canonical, workingState, asidePieces }) => ({
  format: 'noeis-notebook-recovery',
  version: 1,
  exportedAt: new Date().toISOString(),
  note: {
    id: String(entry?._id || ''),
    title: text(entry?.title),
    canonical,
    workingState: normalizeNotebookWorkingState(workingState),
    setAside: list(asidePieces)
  }
});
