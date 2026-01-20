const {
  buildEmbeddingId,
  normalizeText,
  trimText,
  validateEmbeddingItem
} = require("../embeddingTypes");

const notebookEntryToEmbeddingItems = (entry, userId) => {
  const blocks = Array.isArray(entry?.blocks) ? entry.blocks : [];
  return blocks.map((block, index) => {
    const subId = String(block?.id || index);
    const text = trimText(normalizeText(block?.text || ""));
    const item = {
      id: buildEmbeddingId({
        userId,
        objectType: "notebook_block",
        objectId: String(entry?._id || ""),
        subId
      }),
      userId: String(userId || ""),
      objectType: "notebook_block",
      objectId: String(entry?._id || ""),
      subId,
      text,
      metadata: {
        title: normalizeText(entry?.title || ""),
        tags: entry?.tags || [],
        createdAt: entry?.createdAt
          ? new Date(entry.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: entry?.updatedAt
          ? new Date(entry.updatedAt).toISOString()
          : new Date().toISOString()
      }
    };
    const validation = validateEmbeddingItem(item);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    return item;
  });
};

module.exports = notebookEntryToEmbeddingItems;
