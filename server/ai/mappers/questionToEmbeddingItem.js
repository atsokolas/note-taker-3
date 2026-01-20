const {
  buildEmbeddingId,
  normalizeText,
  trimText,
  validateEmbeddingItem
} = require("../embeddingTypes");

const questionToEmbeddingItem = (question, userId) => {
  const textValue = normalizeText(question?.text || "");
  const description = normalizeText(question?.description || "");
  const text = trimText([textValue, description].filter(Boolean).join("\n"));
  const item = {
    id: buildEmbeddingId({
      userId,
      objectType: "question",
      objectId: String(question?._id || "")
    }),
    userId: String(userId || ""),
    objectType: "question",
    objectId: String(question?._id || ""),
    text,
    metadata: {
      title: textValue || "Question",
      tags: [],
      conceptIds: [question?.conceptName || question?.linkedTagName].filter(Boolean),
      createdAt: question?.createdAt
        ? new Date(question.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: question?.updatedAt
        ? new Date(question.updatedAt).toISOString()
        : new Date().toISOString()
    }
  };
  const validation = validateEmbeddingItem(item);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return item;
};

module.exports = questionToEmbeddingItem;
