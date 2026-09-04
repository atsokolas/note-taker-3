// Preserve evidence identity across maintenance, not merely its list position.
// Changed evidence gets a new identity when the page schema materializes it.
const citationKey = citation => JSON.stringify([
  String(citation.sourceRefId || ''),
  citation.sourceType || '',
  String(citation.sourceObjectId || ''),
  citation.sourceTitle || '',
  citation.quote || '',
  citation.url || '',
  citation.confidence
]);

const buildMaintenanceCitations = ({ sourceRefs = [], previousCitations = [], now = new Date() } = {}) => {
  const previous = new Map();
  for (const citation of previousCitations) {
    if (citation?._id && citation.sourceRefId) previous.set(citationKey(citation), citation);
  }
  return sourceRefs.map(source => {
    const citation = {
      sourceRefId: source._id || null,
      sourceType: source.type || '',
      sourceObjectId: source.objectId || null,
      sourceTitle: source.title || '',
      quote: source.snippet || '',
      url: source.url || '',
      confidence: source.addedBy === 'ai' ? 0.72 : 0.9,
      createdAt: now
    };
    const existing = source._id && previous.get(citationKey(citation));
    return existing
      ? { ...citation, _id: existing._id, createdAt: existing.createdAt || now }
      : citation;
  });
};

module.exports = { buildMaintenanceCitations };
