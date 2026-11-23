// Boards on a concept or question: what may sit on one, and what each item points at.
const { findHighlightById } = require('./highlightLookup');
const mongoose = require('mongoose');
const { NotebookEntry, Article, Board } = require('../models/index');

const BOARD_SCOPE_TYPES = new Set(['concept', 'question']);
const BOARD_ITEM_TYPES = new Set(['note', 'highlight', 'article']);
const BOARD_ITEM_ROLES = new Set(['idea', 'claim', 'evidence']);
const BOARD_EDGE_RELATIONS = new Set(['supports', 'contradicts', 'explains', 'example']);

const normalizeBoardScopeType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_SCOPE_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeBoardScopeId = (scopeType, value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (scopeType === 'concept') return raw.toLowerCase();
  return raw;
};

const normalizeBoardItemType = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_ITEM_TYPES.has(candidate)) return '';
  return candidate;
};

const normalizeBoardItemRole = (value, fallback = 'idea') => {
  const candidate = String(value || '').trim().toLowerCase();
  if (BOARD_ITEM_ROLES.has(candidate)) return candidate;
  return fallback;
};

const normalizeBoardRelation = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (!BOARD_EDGE_RELATIONS.has(candidate)) return '';
  return candidate;
};

const normalizeBoardNumber = (value, fallback, { min = 0, max = 10000 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const resolveBoardItemPayload = async ({ userId, type, sourceId, text }) => {
  const safeSourceId = String(sourceId || '').trim();
  const safeText = String(text || '').trim();
  if (!safeSourceId) {
    return { sourceId: '', text: safeText, noteId: '', articleId: '', highlightId: '' };
  }

  if (type === 'highlight') {
    const highlight = await findHighlightById(userId, safeSourceId);
    if (!highlight) return null;
    return {
      sourceId: String(highlight._id),
      text: safeText || highlight.text || '',
      noteId: '',
      articleId: '',
      highlightId: String(highlight._id)
    };
  }

  if (type === 'note') {
    if (!mongoose.Types.ObjectId.isValid(safeSourceId)) return null;
    const note = await NotebookEntry.findOne({ _id: safeSourceId, userId }).select('title content blocks');
    if (!note) return null;
    const blockText = Array.isArray(note.blocks)
      ? note.blocks.map(block => String(block?.text || '').trim()).filter(Boolean).join(' ')
      : '';
    return {
      sourceId: String(note._id),
      text: safeText || note.title || blockText || '',
      noteId: String(note._id),
      articleId: '',
      highlightId: ''
    };
  }

  if (type === 'article') {
    if (!mongoose.Types.ObjectId.isValid(safeSourceId)) return null;
    const article = await Article.findOne({ _id: safeSourceId, userId }).select('title');
    if (!article) return null;
    return {
      sourceId: String(article._id),
      text: safeText || article.title || '',
      noteId: '',
      articleId: String(article._id),
      highlightId: ''
    };
  }

  return null;
};

const ensureBoardOwnership = async (userId, boardId) => {
  if (!mongoose.Types.ObjectId.isValid(boardId)) return null;
  return Board.findOne({ _id: boardId, userId });
};

module.exports = {
  normalizeBoardScopeType,
  normalizeBoardScopeId,
  normalizeBoardItemType,
  normalizeBoardItemRole,
  normalizeBoardRelation,
  normalizeBoardNumber,
  resolveBoardItemPayload,
  ensureBoardOwnership
};
