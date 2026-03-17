const { buildWarning, summarizeWarnings, uniqueStrings } = require('./importDiagnostics');

const toTrimmedString = (value = '') => String(value || '').trim();

const normalizeReadwiseDocumentTags = (row = {}) => (
  Array.isArray(row?.book_tags)
    ? row.book_tags.map((tag) => toTrimmedString(tag?.name || tag)).filter(Boolean)
    : []
);

const getReadwiseDocumentKey = (row = {}) => (
  toTrimmedString(row?.user_book_id || row?.id || row?.source_url || row?.url || row?.title)
);

const buildReadwisePreviewSummary = ({ results = [], hasMore = false } = {}) => {
  const rows = Array.isArray(results) ? results : [];
  const articleCount = new Set(rows.map(getReadwiseDocumentKey).filter(Boolean)).size;
  const previewWarnings = summarizeWarnings(
    hasMore ? [buildWarning('preview_sampled', 'Preview is sampled from the first page of your Readwise export.')] : []
  );

  return {
    items: rows.length,
    articles: articleCount,
    highlights: rows.length,
    notes: 0,
    pages: 0,
    databases: 0,
    notebooks: 0,
    sampleTitles: uniqueStrings(rows.map((row) => row?.title || 'Untitled'), 6),
    sampleAuthors: uniqueStrings(rows.map((row) => row?.author || ''), 6),
    sampleTags: uniqueStrings(rows.flatMap((row) => normalizeReadwiseDocumentTags(row)), 8),
    warningCodes: previewWarnings.warningCodes,
    warnings: previewWarnings.warnings
  };
};

module.exports = {
  buildReadwisePreviewSummary,
  getReadwiseDocumentKey,
  normalizeReadwiseDocumentTags
};
