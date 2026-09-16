import { buildDocFromBlocks } from './notebookBlocks';

const SOURCE_NODE_TYPES = new Set([
  'highlightRef',
  'articleRef',
  'conceptRef',
  'questionRef',
  'wikiRef'
]);

const extractNodeText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  const attributed = node.attrs?.highlightText
    || node.attrs?.articleTitle
    || node.attrs?.conceptName
    || node.attrs?.questionText
    || node.attrs?.wikiTitle
    || '';
  const nested = (node.content || []).map(extractNodeText).join('');
  return nested || attributed;
};

export const openingLine = (value = '', limit = 100) => {
  const line = String(value || '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const stop = line.search(/[.!?](?:\s|$)/);
  const sentence = stop >= 0 ? line.slice(0, stop + 1) : line;
  return sentence.length > limit ? `${sentence.slice(0, Math.max(1, limit - 1)).trim()}…` : sentence;
};

export const isSourceBoundNode = (node) => {
  if (!node) return false;
  if (SOURCE_NODE_TYPES.has(node.type)) return true;
  if (node.type !== 'blockquote') return false;
  const attrs = node.attrs || {};
  return Boolean(attrs.sourcePath || attrs.articleId || attrs.highlightId || attrs.articleTitle);
};

export const pieceLabel = (nodes = []) => {
  const head = nodes[0];
  if (!head) return 'Untitled passage';
  if (isSourceBoundNode(head)) {
    const title = head.attrs?.articleTitle
      || head.attrs?.highlightText
      || extractNodeText(head);
    return title ? `Source · ${openingLine(title)}` : 'Source quotation';
  }
  return openingLine(extractNodeText(head)) || 'Untitled passage';
};

export const groupDocPieces = (doc) => {
  const content = Array.isArray(doc?.content) ? doc.content : [];
  const pieces = [];
  content.forEach((node, index) => {
    const previous = pieces[pieces.length - 1];
    if (isSourceBoundNode(node) && previous && !isSourceBoundNode(previous.nodes[0])) {
      previous.nodes.push(node);
      previous.endIndex = index;
      return;
    }
    pieces.push({
      startIndex: index,
      endIndex: index,
      nodes: [node]
    });
  });
  return pieces.map((piece, pieceIndex) => ({
    ...piece,
    pieceIndex,
    label: pieceLabel(piece.nodes)
  }));
};

export const pieceIndexForNode = (doc, nodeIndex) => {
  const selected = pieceIndexForSelection(doc, {
    $from: { index: () => nodeIndex }
  });
  return Number.isInteger(selected) ? selected : 0;
};

export const nodeIndexFromSelection = (selection) => {
  const $from = selection?.$from;
  if (typeof $from?.index !== 'function') return null;
  const index = $from.index(0);
  return Number.isInteger(index) ? index : null;
};

export const pieceIndexForSelection = (doc, selection) => {
  const pieces = groupDocPieces(doc);
  if (!pieces.length) return null;
  const nodeIndex = nodeIndexFromSelection(selection);
  if (!Number.isInteger(nodeIndex)) return null;
  const found = pieces.find((piece) => nodeIndex >= piece.startIndex && nodeIndex <= piece.endIndex);
  if (found) return found.pieceIndex;
  if (nodeIndex > pieces[pieces.length - 1].endIndex) {
    return pieces[pieces.length - 1].pieceIndex;
  }
  return null;
};

export const pieceIndexNearOffset = (offsets = [], readingOffset = 0) => {
  if (!offsets.length) return null;
  let best = 0;
  let bestDist = Infinity;
  offsets.forEach((offset, index) => {
    const dist = Math.abs((Number(offset) || 0) - readingOffset);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
};

const isAtomBlock = (node) => Boolean(
  node?.isAtom
  || node?.isLeaf
  || node?.type?.isAtom
  || node?.type?.isLeaf
);

export const focusPieceInEditor = (editor, pieceIndex) => {
  const pieces = groupDocPieces(editor?.getJSON?.());
  const piece = pieces[pieceIndex];
  const doc = editor?.state?.doc;
  if (!piece || typeof doc?.forEach !== 'function') return false;
  let offset = null;
  let node = null;
  doc.forEach((child, pos, index) => {
    if (index === piece.startIndex) {
      offset = pos;
      node = child;
    }
  });
  if (!Number.isInteger(offset) || !node) return false;
  if (isAtomBlock(node) && editor.commands?.setNodeSelection) {
    editor.commands.setNodeSelection(offset);
    editor.commands.focus?.();
    return true;
  }
  const caretPos = offset + 1;
  if (editor.commands?.setTextSelection) {
    editor.commands.setTextSelection(caretPos);
    editor.commands.focus?.();
    return true;
  }
  if (editor.chain) {
    editor.chain().focus(caretPos).run();
    return true;
  }
  editor.commands?.focus?.(caretPos);
  return Boolean(editor.commands?.focus);
};

export const nodesFromAsidePiece = (piece) => {
  if (Array.isArray(piece?.nodes) && piece.nodes.length) return piece.nodes;
  if (Array.isArray(piece?.blocks) && piece.blocks.length) {
    return buildDocFromBlocks(piece.blocks).content || [];
  }
  return [];
};

export const persistableAsidePiece = (piece) => {
  const nodes = nodesFromAsidePiece(piece);
  const index = Number.isInteger(piece?.index) ? piece.index : 0;
  return {
    id: piece?.id || nodes[0]?.attrs?.blockId || `aside-${index}`,
    label: piece?.label || '',
    index,
    beforeId: piece?.beforeId || '',
    afterId: piece?.afterId || '',
    nodes
  };
};

export const hydrateAsidePieces = (pieces = []) => (
  (Array.isArray(pieces) ? pieces : []).map(persistableAsidePiece)
);

const flattenPieces = (pieces) => pieces.flatMap((piece) => piece.nodes);

const pieceId = (piece) => String(piece?.nodes?.[0]?.attrs?.blockId || '');

const withContent = (doc, content) => ({
  type: doc?.type || 'doc',
  content: content.length ? content : [{ type: 'paragraph' }]
});

export const movePieceInDocument = (doc, pieceIndex, direction = 'up') => {
  const pieces = groupDocPieces(doc);
  if (!Number.isInteger(pieceIndex) || pieces.length < 2) {
    return { moved: false, doc, pieces };
  }
  const delta = direction === 'down' ? 1 : -1;
  const targetIndex = pieceIndex + delta;
  if (targetIndex < 0 || targetIndex >= pieces.length) {
    return { moved: false, doc, pieces };
  }
  const next = pieces.map((piece) => ({ ...piece, nodes: [...piece.nodes] }));
  [next[pieceIndex], next[targetIndex]] = [next[targetIndex], next[pieceIndex]];
  return {
    moved: true,
    doc: withContent(doc, flattenPieces(next)),
    pieces: groupDocPieces(withContent(doc, flattenPieces(next))),
    fromIndex: pieceIndex,
    toIndex: targetIndex,
    label: pieces[pieceIndex].label
  };
};

export const setAsidePieceInDocument = (doc, pieceIndex) => {
  const pieces = groupDocPieces(doc);
  const piece = pieces[pieceIndex];
  if (!piece) return { doc, aside: null, pieces };
  const remaining = pieces.filter((_, index) => index !== pieceIndex);
  return {
    doc: withContent(doc, flattenPieces(remaining)),
    aside: {
      id: piece.nodes[0]?.attrs?.blockId || `aside-${pieceIndex}`,
      label: piece.label,
      index: pieceIndex,
      beforeId: pieceId(pieces[pieceIndex - 1]),
      afterId: pieceId(pieces[pieceIndex + 1]),
      nodes: piece.nodes
    },
    pieces: groupDocPieces(withContent(doc, flattenPieces(remaining)))
  };
};

export const restorePieceInDocument = (doc, aside) => {
  const nodes = nodesFromAsidePiece(aside);
  if (!nodes.length) return { restored: false, doc };
  const content = Array.isArray(doc?.content) ? [...doc.content] : [];
  const pieces = groupDocPieces({ type: 'doc', content });
  const before = aside?.beforeId && pieces.find((piece) => pieceId(piece) === aside.beforeId);
  const after = aside?.afterId && pieces.find((piece) => pieceId(piece) === aside.afterId);
  const hasStableAnchors = Boolean(aside?.beforeId || aside?.afterId);
  if (hasStableAnchors && !before && !after) {
    return { restored: false, needsDestination: true, doc };
  }
  const legacyIndex = Number.isInteger(aside.index) ? aside.index : pieces.length;
  const insertAt = before
    ? before.endIndex + 1
    : after
      ? after.startIndex
      : legacyIndex < 0 || legacyIndex >= pieces.length
        ? content.length
        : pieces[legacyIndex].startIndex;
  content.splice(insertAt, 0, ...nodes);
  return {
    restored: true,
    doc: withContent(doc, content)
  };
};

export const pieceIndexById = (doc, id) => {
  if (!id) return null;
  const index = groupDocPieces(doc).findIndex((piece) => pieceId(piece) === String(id));
  return index >= 0 ? index : null;
};

export const removePieceById = (doc, id) => {
  const pieceIndex = pieceIndexById(doc, id);
  return Number.isInteger(pieceIndex)
    ? deletePieceInDocument(doc, pieceIndex)
    : { deleted: false, doc, pieces: groupDocPieces(doc) };
};

export const repositionPieceByAnchors = (doc, id, { beforeId = '', afterId = '' } = {}) => {
  const currentIndex = pieceIndexById(doc, id);
  if (!Number.isInteger(currentIndex)) return { moved: false, doc };
  const pieces = groupDocPieces(doc);
  const moving = pieces[currentIndex];
  const remaining = pieces.filter((_, index) => index !== currentIndex);
  const beforeIndex = beforeId ? remaining.findIndex((piece) => pieceId(piece) === beforeId) : -1;
  const afterIndex = afterId ? remaining.findIndex((piece) => pieceId(piece) === afterId) : -1;
  if ((beforeId || afterId) && beforeIndex < 0 && afterIndex < 0) {
    return { moved: false, needsDestination: true, doc };
  }
  const insertAt = beforeIndex >= 0 ? beforeIndex + 1 : afterIndex >= 0 ? afterIndex : 0;
  remaining.splice(insertAt, 0, moving);
  return { moved: true, doc: withContent(doc, flattenPieces(remaining)), pieceIndex: insertAt };
};

export const deletePieceInDocument = (doc, pieceIndex) => {
  const pieces = groupDocPieces(doc);
  if (!pieces[pieceIndex]) return { deleted: false, doc, pieces };
  const remaining = pieces.filter((_, index) => index !== pieceIndex);
  return {
    deleted: true,
    doc: withContent(doc, flattenPieces(remaining)),
    pieces: groupDocPieces(withContent(doc, flattenPieces(remaining))),
    label: pieces[pieceIndex].label
  };
};

export const applyNotebookDoc = (editor, nextDoc, { emitUpdate = true } = {}) => {
  if (!editor?.commands?.setContent || !nextDoc) return false;
  editor.commands.setContent(nextDoc, emitUpdate);
  return true;
};
