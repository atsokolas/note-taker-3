const {
  buildEmbeddingId,
  normalizeText,
  trimText,
  validateEmbeddingItem
} = require("../embeddingTypes");

const DEFAULT_EXCERPT_LENGTH = 800;

const articleToEmbeddingItems = (article, userId, options = {}) => {
  const excerptLength = options.excerptLength || DEFAULT_EXCERPT_LENGTH;
  const title = normalizeText(article?.title || "");
  const content = normalizeText(article?.content || "");
  const excerpt = content.slice(0, excerptLength);
  const text = trimText([title, excerpt].filter(Boolean).join("\n"));
  const item = {
    id: buildEmbeddingId({
      userId,
      objectType: "article",
      objectId: String(article?._id || "")
    }),
    userId: String(userId || ""),
    objectType: "article",
    objectId: String(article?._id || ""),
    text,
    metadata: {
      title: title || "Untitled article",
      tags: [],
      articleId: String(article?._id || ""),
      createdAt: article?.createdAt
        ? new Date(article.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: article?.updatedAt
        ? new Date(article.updatedAt).toISOString()
        : new Date().toISOString()
    }
  };
  const validation = validateEmbeddingItem(item);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return [item];
};

module.exports = articleToEmbeddingItems;
