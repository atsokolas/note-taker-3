const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

const buildResearchEditionLibraryNote = (item = {}, { publicationTitle = 'Research edition' } = {}) => [
  `Saved as a primary source for ${clean(publicationTitle, 240) || 'Research edition'}.`,
  '',
  `Finding: ${clean(item.whyItMatters, 1600)}`,
  '',
  `How it works: ${clean(item.technicalApproach, 1600)}`,
  '',
  `Evidence: ${clean(item.evidenceAssessment, 1600)}`,
  '',
  `Why it matters: ${clean(item.consequence, 1600)}`,
  '',
  `Limitations: ${clean(item.boundary, 1200)}`,
  '',
  `Primary source: ${clean(item.url || item.canonicalUrl, 2000)}`
].join('\n');

const ensureResearchEditionLibraryItems = async ({
  Article,
  userId,
  items = [],
  publicationTitle = 'Research edition',
  now = new Date()
} = {}) => {
  if (!Article || !userId) throw new Error('Article and userId are required.');
  if (!Array.isArray(items) || !items.length) throw new Error('At least one research edition item is required.');
  const resolved = [];
  for (const item of items) {
    const url = clean(item?.url || item?.canonicalUrl, 2000);
    const title = clean(item?.title, 240);
    if (!url || !title) throw new Error('Each research edition Library item requires a title and URL.');
    let article = await Article.findOne({ userId, url });
    if (!article) {
      article = await Article.create({
        userId,
        url,
        title,
        content: buildResearchEditionLibraryNote(item, { publicationTitle }),
        publicationDate: String(item.publishedAt || '').slice(0, 10),
        siteName: clean(item.sourceLabel, 160) || new URL(url).hostname,
        importMeta: {
          provider: 'this_week_in_ai',
          sourceType: 'paper',
          sourceLabel: clean(publicationTitle, 240),
          sourceUrl: url,
          externalId: url.split('/').filter(Boolean).pop() || '',
          importedAt: now
        }
      });
    }
    const libraryArticleId = clean(article?._id || article?.id, 120);
    if (!libraryArticleId) throw new Error(`Library article identity is missing for "${title}".`);
    resolved.push({ ...item, libraryArticleId });
  }
  return resolved;
};

module.exports = {
  buildResearchEditionLibraryNote,
  ensureResearchEditionLibraryItems
};
