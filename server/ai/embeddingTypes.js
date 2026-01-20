const MAX_TEXT_LENGTH = 4000;

/**
 * @typedef {"highlight"|"article"|"notebook_block"|"concept"|"question"} EmbeddingObjectType
 */

/**
 * @typedef {Object} EmbeddingMetadata
 * @property {string} [title]
 * @property {string[]} [tags]
 * @property {string} [articleId]
 * @property {string[]} [conceptIds]
 * @property {string[]} [questionIds]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} EmbeddingItem
 * @property {string} id
 * @property {string} userId
 * @property {EmbeddingObjectType} objectType
 * @property {string} objectId
 * @property {string} [subId]
 * @property {string} text
 * @property {EmbeddingMetadata} metadata
 */

const stripHtml = (value = "") =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripMarkdown = (value = "") =>
  String(value || "")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeText = (value = "") => stripMarkdown(stripHtml(value));

const trimText = (value = "", max = MAX_TEXT_LENGTH) => {
  const text = String(value || "");
  if (text.length <= max) return text;
  return text.slice(0, max);
};

const buildEmbeddingId = ({ userId, objectType, objectId, subId }) => {
  const parts = [userId, objectType, objectId];
  if (subId) parts.push(subId);
  return parts.join(":");
};

const validateEmbeddingItem = (item) => {
  if (!item) return { ok: false, error: "Embedding item is required." };
  if (!item.id || !item.userId || !item.objectType || !item.objectId) {
    return { ok: false, error: "Embedding item missing required fields." };
  }
  if (!item.text || !item.text.trim()) {
    return { ok: false, error: "Embedding item text is empty." };
  }
  if (item.text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: "Embedding item text exceeds max length." };
  }
  return { ok: true };
};

module.exports = {
  MAX_TEXT_LENGTH,
  normalizeText,
  trimText,
  buildEmbeddingId,
  validateEmbeddingItem
};
