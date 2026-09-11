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
  const pieces = groupDocPieces(doc);
  const found = pieces.find((piece) => nodeIndex >= piece.startIndex && nodeIndex <= piece.endIndex);
  return found ? found.pieceIndex : 0;
};

const flattenPieces = (pieces) => pieces.flatMap((piece) => piece.nodes);

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
      nodes: piece.nodes
    },
    pieces: groupDocPieces(withContent(doc, flattenPieces(remaining)))
  };
};

export const restorePieceInDocument = (doc, aside) => {
  if (!aside?.nodes?.length) return { restored: false, doc };
  const content = Array.isArray(doc?.content) ? [...doc.content] : [];
  const insertAt = Math.max(0, Math.min(Number.isInteger(aside.index) ? aside.index : content.length, content.length));
  content.splice(insertAt, 0, ...aside.nodes);
  return {
    restored: true,
    doc: withContent(doc, content)
  };
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
