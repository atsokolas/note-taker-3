const {
  buildEmbeddingId,
  normalizeText,
  trimText,
  validateEmbeddingItem
} = require("../embeddingTypes");

const conceptToEmbeddingItem = (concept, userId) => {
  const title = normalizeText(concept?.name || "");
  const description = normalizeText(concept?.description || "");
  const text = trimText([title, description].filter(Boolean).join("\n"));
  const item = {
    id: buildEmbeddingId({
      userId,
      objectType: "concept",
      objectId: String(concept?._id || concept?.name || "")
    }),
    userId: String(userId || ""),
    objectType: "concept",
    objectId: String(concept?._id || concept?.name || ""),
    text,
    metadata: {
      title: title || "Concept",
      tags: [],
      createdAt: concept?.createdAt
        ? new Date(concept.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: concept?.updatedAt
        ? new Date(concept.updatedAt).toISOString()
        : new Date().toISOString()
    }
  };
  const validation = validateEmbeddingItem(item);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return item;
};

module.exports = conceptToEmbeddingItem;
