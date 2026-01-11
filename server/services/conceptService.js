const buildConceptService = ({ Article, TagMeta, NotebookEntry, ReferenceEdge, mongoose }) => {
  const normalizeName = (name) => String(name || '').trim();

  const getConcepts = async (userId) => {
    const tagCounts = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);
    const meta = await TagMeta.find({ userId: new mongoose.Types.ObjectId(userId) }).lean();
    const metaMap = new Map(meta.map(m => [String(m.name).toLowerCase(), m]));
    return tagCounts.map(row => {
      const name = row._id;
      const found = metaMap.get(String(name).toLowerCase());
      return {
        name,
        count: row.count,
        description: found?.description || '',
        pinnedHighlightIds: found?.pinnedHighlightIds || [],
        pinnedNoteIds: found?.pinnedNoteIds || []
      };
    });
  };

  const getConceptMeta = async (userId, name) => {
    const cleanName = normalizeName(name);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const meta = await TagMeta.findOne({ name: new RegExp(`^${cleanName}$`, 'i'), userId: userObjectId });
    const pinnedHighlightIds = meta?.pinnedHighlightIds || [];
    const pinnedNoteIds = meta?.pinnedNoteIds || [];
    const pinnedArticleIds = meta?.pinnedArticleIds || [];

    let pinnedHighlights = [];
    if (pinnedHighlightIds.length > 0) {
      pinnedHighlights = await Article.aggregate([
        { $match: { userId: userObjectId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': { $in: pinnedHighlightIds } } },
        { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
        } }
      ]);
    }

    const pinnedNotes = pinnedNoteIds.length
      ? await NotebookEntry.find({ userId: userObjectId, _id: { $in: pinnedNoteIds } })
        .select('title content updatedAt')
      : [];
    const pinnedArticles = pinnedArticleIds.length
      ? await Article.find({ userId: userObjectId, _id: { $in: pinnedArticleIds } })
        .select('title url createdAt')
      : [];

    const relatedAgg = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': cleanName } },
      { $unwind: '$highlights.tags' },
      { $match: { 'highlights.tags': { $ne: cleanName } } },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);
    const relatedTags = relatedAgg.map(r => ({ tag: r._id, count: r.count }));

    const countAgg = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': cleanName } },
      { $count: 'total' }
    ]);
    const allHighlightCount = countAgg[0]?.total || 0;

    return {
      name: cleanName,
      description: meta?.description || '',
      pinnedHighlightIds,
      pinnedArticleIds,
      pinnedNoteIds,
      pinnedHighlights,
      pinnedArticles,
      pinnedNotes,
      relatedTags,
      allHighlightCount
    };
  };

  const updateConceptMeta = async (userId, name, payload) => {
    const cleanName = normalizeName(name);
    const { description = '', pinnedHighlightIds = [], pinnedArticleIds = [], pinnedNoteIds = [] } = payload;
    const updated = await TagMeta.findOneAndUpdate(
      { name: new RegExp(`^${cleanName}$`, 'i'), userId: new mongoose.Types.ObjectId(userId) },
      { name: cleanName, description, pinnedHighlightIds, pinnedArticleIds, pinnedNoteIds },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return updated;
  };

  const getConceptRelated = async (userId, name, { limit = 20, offset = 0 } = {}) => {
    const cleanName = normalizeName(name);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const meta = await TagMeta.findOne({ name: new RegExp(`^${cleanName}$`, 'i'), userId: userObjectId }).lean();
    const pinnedIds = meta?.pinnedHighlightIds || [];

    let pinnedHighlights = [];
    if (pinnedIds.length > 0) {
      pinnedHighlights = await Article.aggregate([
        { $match: { userId: userObjectId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': { $in: pinnedIds } } },
        { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
        } }
      ]);
    }

    const recentHighlights = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': cleanName } },
      { $sort: { 'highlights.createdAt': -1 } },
      { $skip: Number(offset) || 0 },
      { $limit: Number(limit) || 20 },
      { $project: {
        _id: '$highlights._id',
        text: '$highlights.text',
        tags: '$highlights.tags',
        articleTitle: '$title',
        articleId: '$_id',
        createdAt: '$highlights.createdAt'
      } }
    ]);

    const highlightMap = new Map();
    [...pinnedHighlights, ...recentHighlights].forEach(h => {
      highlightMap.set(String(h._id), h);
    });

    const highlights = Array.from(highlightMap.values());

    const edges = await ReferenceEdge.find({
      userId: userObjectId,
      targetType: 'concept',
      targetTagName: { $regex: new RegExp(`^${cleanName}$`, 'i') }
    });
    const entryIds = edges.map(edge => edge.sourceId);
    const entries = await NotebookEntry.find({ userId: userObjectId, _id: { $in: entryIds } })
      .select('title updatedAt');
    const entryMap = new Map(entries.map(entry => [entry._id.toString(), entry]));
    const notes = edges.map(edge => {
      const entry = entryMap.get(edge.sourceId.toString());
      return {
        notebookEntryId: edge.sourceId,
        notebookTitle: entry?.title || 'Untitled note',
        blockId: edge.sourceBlockId,
        blockPreviewText: edge.blockPreviewText || '',
        updatedAt: entry?.updatedAt
      };
    });

    const articles = await Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': cleanName } },
      { $group: {
        _id: '$_id',
        title: { $first: '$title' },
        url: { $first: '$url' },
        highlightCount: { $sum: 1 }
      } },
      { $sort: { highlightCount: -1, title: 1 } }
    ]);

    return { highlights, notes, articles };
  };

  return {
    getConcepts,
    getConceptMeta,
    updateConceptMeta,
    getConceptRelated
  };
};

module.exports = { buildConceptService };
