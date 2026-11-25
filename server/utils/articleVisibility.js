/** @param {Record<string, unknown>} match */
const applyDefaultArticleVisibility = (match, { includeSuppressed = false } = {}) => {
  if (includeSuppressed) return match;
  return {
    ...match,
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
};

/** @param {unknown} userId */
const librarySearchArticleMatch = (userId, extra = {}) => (
  applyDefaultArticleVisibility({ userId, ...extra })
);

module.exports = {
  applyDefaultArticleVisibility,
  librarySearchArticleMatch
};
