const mongoose = require('mongoose');

const BLOCK_OBJECT_ID_KEYS = ['highlightId', 'articleId', 'conceptId', 'questionId'];

const asObjectIdOrNull = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return asObjectIdOrNull(value._id || value.id);
  }
  const raw = String(value);
  return mongoose.Types.ObjectId.isValid(raw) ? raw : null;
};

const sanitizeNotebookBlock = (block) => {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
  const next = { ...block };
  BLOCK_OBJECT_ID_KEYS.forEach((key) => {
    if (next[key] !== undefined) next[key] = asObjectIdOrNull(next[key]);
  });
  return next;
};

const sanitizeNotebookBlocks = (blocks) => (
  Array.isArray(blocks) ? blocks.map(sanitizeNotebookBlock) : []
);

const sanitizeAsidePieces = (pieces) => (
  Array.isArray(pieces)
    ? pieces.map((piece) => {
      if (!piece || typeof piece !== 'object' || Array.isArray(piece)) return piece;
      const next = { ...piece };
      if (next.blocks !== undefined) next.blocks = sanitizeNotebookBlocks(next.blocks);
      return next;
    })
    : []
);

module.exports = {
  asObjectIdOrNull,
  sanitizeAsidePieces,
  sanitizeNotebookBlock,
  sanitizeNotebookBlocks
};
