const {
  buildEmbeddingId,
  normalizeText,
  trimText,
  validateEmbeddingItem
} = require("../embeddingTypes");

const highlightToEmbeddingItem = (highlight, userId) => {
  const text = trimText(normalizeText(highlight?.text || ""));
  const item = {
    id: buildEmbeddingId({
      userId,
      objectType: "highlight",
      objectId: String(highlight?._id || "")
    }),
    userId: String(userId || ""),
    objectType: "highlight",
    objectId: String(highlight?._id || ""),
    text,
    metadata: {
      title: "",
      tags: highlight?.tags || [],
      articleId: highlight?.articleId ? String(highlight.articleId) : "",
      createdAt: highlight?.createdAt
        ? new Date(highlight.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: highlight?.updatedAt
        ? new Date(highlight.updatedAt).toISOString()
        : new Date().toISOString()
    }
  };
  const validation = validateEmbeddingItem(item);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return item;
};

module.exports = highlightToEmbeddingItem;
