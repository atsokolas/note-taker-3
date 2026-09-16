const applyDefaultArticleVisibility = (match, { includeSuppressed = false } = {}) => {
  if (includeSuppressed) return match;
  return {
    ...match,
    debugOnly: { $ne: true },
    archived: { $ne: true }
  };
};

const librarySearchArticleMatch = (userId, extra = {}) => (
  applyDefaultArticleVisibility({ userId, ...extra })
);

module.exports = {
  applyDefaultArticleVisibility,
  librarySearchArticleMatch
};
