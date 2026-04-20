const {
  buildEmbeddingId,
  normalizeText,
  trimText,
  validateEmbeddingItem
} = require("../embeddingTypes");

const normalizeSourcePathSegments = (value = "") => {
  if (Array.isArray(value)) {
    return value
      .map(segment => normalizeText(segment || ""))
      .filter(Boolean);
  }
  const safeValue = normalizeText(value || "");
  if (!safeValue) return [];
  return safeValue
    .split(/\s*\/\s*/g)
    .map(segment => segment.trim())
    .filter(Boolean);
};

const toIsoStringOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const notebookEntryToEmbeddingItems = (entry, userId) => {
  const blocks = Array.isArray(entry?.blocks) ? entry.blocks : [];
  const importMeta = entry?.importMeta && typeof entry.importMeta === "object"
    ? entry.importMeta
    : {};
  const sourcePathSegments = normalizeSourcePathSegments(importMeta?.sourcePath);
  const folderPath = sourcePathSegments.join(" / ");
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
        provider: normalizeText(importMeta?.provider || ""),
        sourceType: normalizeText(importMeta?.sourceType || ""),
        sourceLabel: normalizeText(importMeta?.sourceLabel || ""),
        sourcePath: folderPath,
        sourcePathSegments,
        folderPath,
        folderPathSegments: sourcePathSegments,
        folderOwnership: normalizeText(importMeta?.folderOwnership || ""),
        sourceUrl: String(importMeta?.sourceUrl || "").trim(),
        externalId: normalizeText(importMeta?.externalId || ""),
        searchableAt: toIsoStringOrNull(importMeta?.searchableAt),
        importedAt: toIsoStringOrNull(importMeta?.importedAt),
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
