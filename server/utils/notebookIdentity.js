const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const BLOCK_OBJECT_ID_KEYS = ['highlightId', 'articleId', 'conceptId', 'questionId'];

const asPlain = (value) => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
};

const asObjectIdOrNull = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.toHexString === 'function') return asObjectIdOrNull(value.toHexString());
    return asObjectIdOrNull(value._id || value.id);
  }
  const raw = String(value);
  return OBJECT_ID_RE.test(raw) ? raw : null;
};

const sanitizeNotebookBlock = (block, index = 0) => {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
  const next = asPlain(block);
  BLOCK_OBJECT_ID_KEYS.forEach((key) => {
    if (next[key] !== undefined) next[key] = asObjectIdOrNull(next[key]);
  });
  if (!next.id) next.id = `block-${index}`;
  return next;
};

const sanitizeNotebookBlocks = (blocks) => (
  Array.isArray(blocks) ? blocks.map((block, index) => sanitizeNotebookBlock(block, index)) : []
);

const sanitizeAsidePieces = (pieces) => (
  Array.isArray(pieces)
    ? pieces.map((piece, index) => {
      if (!piece || typeof piece !== 'object' || Array.isArray(piece)) return piece;
      const next = asPlain(piece);
      next.id = String(
        next.id
        || next.nodes?.[0]?.attrs?.blockId
        || `aside-${index}`
      );
      if (next.blocks !== undefined) next.blocks = sanitizeNotebookBlocks(next.blocks);
      return next;
    })
    : []
);

const STALE_IDENTITY_ERROR = /^(blocks|asidePieces|linkedArticleId|folder|claimId|linkedHighlightIds|importMeta|importSessionId)(\.|$)/;

const readPath = (entry, path) => {
  if (typeof entry.$__getValue === 'function') return entry.$__getValue(path);
  return path.split('.').reduce((cursor, part) => (cursor == null ? cursor : cursor[part]), entry);
};

const writePath = (entry, path, value) => {
  if (typeof entry.set === 'function') {
    entry.set(path, value);
    // Getters already hid leftover CastErrors as null. Mark the path so save
    // writes the healed value instead of leaving the invalid string in Mongo.
    if (typeof entry.markModified === 'function') entry.markModified(path);
    return;
  }
  const parts = path.split('.');
  let cursor = entry;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (cursor[parts[i]] == null || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
};

const clearSanitizedCastErrors = (entry) => {
  if (typeof entry.$markValid !== 'function') return;
  const errors = entry.$__.validationError?.errors;
  if (!errors) return;
  Object.keys(errors).forEach((key) => {
    if (STALE_IDENTITY_ERROR.test(key)) entry.$markValid(key);
  });
};

const sanitizeNotebookEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return entry;
  writePath(entry, 'blocks', sanitizeNotebookBlocks(readPath(entry, 'blocks')));
  writePath(entry, 'asidePieces', sanitizeAsidePieces(readPath(entry, 'asidePieces')));
  writePath(entry, 'linkedArticleId', asObjectIdOrNull(readPath(entry, 'linkedArticleId')));
  writePath(entry, 'folder', asObjectIdOrNull(readPath(entry, 'folder')));
  writePath(entry, 'claimId', asObjectIdOrNull(readPath(entry, 'claimId')));
  const highlightIds = readPath(entry, 'linkedHighlightIds');
  writePath(
    entry,
    'linkedHighlightIds',
    (Array.isArray(highlightIds) ? Array.from(highlightIds) : []).map(asObjectIdOrNull).filter(Boolean)
  );
  writePath(entry, 'importMeta.importSessionId', asObjectIdOrNull(readPath(entry, 'importMeta.importSessionId')));
  clearSanitizedCastErrors(entry);
  return entry;
};

module.exports = {
  asObjectIdOrNull,
  sanitizeAsidePieces,
  sanitizeNotebookBlock,
  sanitizeNotebookBlocks,
  sanitizeNotebookEntry
};
