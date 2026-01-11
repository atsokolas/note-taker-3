const DAY_MS = 24 * 60 * 60 * 1000;

const parseRangeDays = (range = '14d') => {
  const match = String(range).trim().toLowerCase().match(/^(\d+)\s*d$/);
  const days = match ? parseInt(match[1], 10) : 14;
  if (Number.isNaN(days) || days <= 0) return 14;
  return Math.min(days, 365);
};

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const getSnippet = (entry) => {
  if (entry?.content) {
    return stripHtml(entry.content).slice(0, 180);
  }
  const block = Array.isArray(entry?.blocks) ? entry.blocks.find(b => b?.text) : null;
  return block?.text ? String(block.text).slice(0, 180) : '';
};

const buildReflectionService = ({ Article, NotebookEntry, Question, TagMeta, mongoose }) => {
  const getReflections = async (userId, range = '14d') => {
    const rangeDays = parseRangeDays(range);
    const now = new Date();
    const start = new Date(now.getTime() - rangeDays * DAY_MS);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const highlightAggPromise = Article.aggregate([
      { $match: { userId: userObjectId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: start } } },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 }, lastActivityAt: { $max: '$highlights.createdAt' } } }
    ]);

    const noteAggPromise = NotebookEntry.aggregate([
      { $match: { userId: userObjectId, updatedAt: { $gte: start } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 }, lastActivityAt: { $max: '$updatedAt' } } }
    ]);

    const questionAggPromise = Question.aggregate([
      { $match: { userId: userObjectId, status: 'open', updatedAt: { $gte: start } } },
      { $group: { _id: '$linkedTagName', count: { $sum: 1 }, lastActivityAt: { $max: '$updatedAt' } } }
    ]);

    const notesInProgressPromise = NotebookEntry.find({ userId: userObjectId, updatedAt: { $gte: start } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('title updatedAt content blocks tags')
      .lean();

    const openQuestionsPromise = Question.find({ userId: userObjectId, status: 'open' })
      .sort({ updatedAt: -1 })
      .limit(40)
      .lean();

    const [highlightAgg, noteAgg, questionAgg, notesInProgress, openQuestions] = await Promise.all([
      highlightAggPromise,
      noteAggPromise,
      questionAggPromise,
      notesInProgressPromise,
      openQuestionsPromise
    ]);

    const conceptMap = new Map();
    const ensureConcept = (name) => {
      if (!name) return null;
      if (!conceptMap.has(name)) {
        conceptMap.set(name, {
          name,
          highlightsCount: 0,
          notesCount: 0,
          questionsOpenCount: 0,
          lastActivityAt: null
        });
      }
      return conceptMap.get(name);
    };

    highlightAgg.forEach(row => {
      const concept = ensureConcept(row._id);
      if (!concept) return;
      concept.highlightsCount = row.count || 0;
      concept.lastActivityAt = row.lastActivityAt || concept.lastActivityAt;
    });

    noteAgg.forEach(row => {
      const concept = ensureConcept(row._id);
      if (!concept) return;
      concept.notesCount = row.count || 0;
      concept.lastActivityAt = concept.lastActivityAt && row.lastActivityAt
        ? new Date(Math.max(new Date(concept.lastActivityAt).getTime(), new Date(row.lastActivityAt).getTime()))
        : (row.lastActivityAt || concept.lastActivityAt);
    });

    questionAgg.forEach(row => {
      if (!row._id) return;
      const concept = ensureConcept(row._id);
      if (!concept) return;
      concept.questionsOpenCount = row.count || 0;
      concept.lastActivityAt = concept.lastActivityAt && row.lastActivityAt
        ? new Date(Math.max(new Date(concept.lastActivityAt).getTime(), new Date(row.lastActivityAt).getTime()))
        : (row.lastActivityAt || concept.lastActivityAt);
    });

    const conceptNames = Array.from(conceptMap.keys());
    const metaRows = conceptNames.length
      ? await TagMeta.find({ userId: userObjectId, name: { $in: conceptNames } }).select('name description').lean()
      : [];
    const metaMap = new Map(metaRows.map(row => [row.name.toLowerCase(), row.description || '']));

    const activeConcepts = Array.from(conceptMap.values())
      .map(concept => ({
        ...concept,
        description: metaMap.get(concept.name.toLowerCase()) || ''
      }))
      .map(concept => ({
        ...concept,
        score: concept.highlightsCount * 2 + concept.notesCount * 3 + concept.questionsOpenCount * 2
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ score, ...rest }) => rest);

    const notesInProgressResult = notesInProgress.map(entry => ({
      id: entry._id,
      title: entry.title || 'Untitled note',
      updatedAt: entry.updatedAt,
      snippet: getSnippet(entry),
      conceptMentions: Array.isArray(entry.tags) ? entry.tags : []
    }));

    let openQuestionItems = openQuestions.map(q => ({
      id: q._id,
      text: q.text || '',
      linkedTagName: q.linkedTagName || '',
      updatedAt: q.updatedAt,
      linkedNotebookEntryId: q.linkedNotebookEntryId || null,
      linkedHighlightId: q.linkedHighlightId || null
    }));

    if (openQuestionItems.length === 0) {
      const entries = await NotebookEntry.find({ userId: userObjectId, updatedAt: { $gte: start } })
        .select('title tags blocks')
        .lean();
      openQuestionItems = entries.flatMap(entry => {
        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        return (entry.blocks || [])
          .filter(block => block?.type === 'question' && block?.status === 'open')
          .map(block => ({
            id: block.id,
            text: block.text || '',
            linkedTagName: tags[0] || '',
            updatedAt: entry.updatedAt,
            linkedNotebookEntryId: entry._id,
            linkedHighlightId: null
          }));
      });
    }

    const grouped = new Map();
    openQuestionItems.forEach(item => {
      const key = item.linkedTagName ? item.linkedTagName : 'Other';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    const openQuestionsGrouped = Array.from(grouped.entries())
      .sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
      .map(([concept, questions]) => ({ concept, questions }));

    const countHighlightsInRange = async (startDate, endDate) => {
      const agg = await Article.aggregate([
        { $match: { userId: userObjectId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.createdAt': { $gte: startDate, $lt: endDate } } },
        { $count: 'count' }
      ]);
      return agg[0]?.count || 0;
    };

    const countNotesInRange = async (startDate, endDate) =>
      NotebookEntry.countDocuments({ userId: userObjectId, updatedAt: { $gte: startDate, $lt: endDate } });

    const countConceptsInRange = async (startDate, endDate) => {
      const [highlightTags, noteTags] = await Promise.all([
        Article.aggregate([
          { $match: { userId: userObjectId } },
          { $unwind: '$highlights' },
          { $match: { 'highlights.createdAt': { $gte: startDate, $lt: endDate } } },
          { $unwind: '$highlights.tags' },
          { $group: { _id: '$highlights.tags' } }
        ]),
        NotebookEntry.aggregate([
          { $match: { userId: userObjectId, updatedAt: { $gte: startDate, $lt: endDate } } },
          { $unwind: '$tags' },
          { $group: { _id: '$tags' } }
        ])
      ]);
      return new Set([
        ...highlightTags.map(t => t._id).filter(Boolean),
        ...noteTags.map(t => t._id).filter(Boolean)
      ]).size;
    };

    const weekEnd = new Date();
    const weekStart = new Date(weekEnd.getTime() - 7 * DAY_MS);
    const priorStart = new Date(weekEnd.getTime() - 14 * DAY_MS);

    const [currentHighlights, priorHighlights, currentNotes, priorNotes, currentConcepts, priorConcepts] = await Promise.all([
      countHighlightsInRange(weekStart, weekEnd),
      countHighlightsInRange(priorStart, weekStart),
      countNotesInRange(weekStart, weekEnd),
      countNotesInRange(priorStart, weekStart),
      countConceptsInRange(weekStart, weekEnd),
      countConceptsInRange(priorStart, weekStart)
    ]);

    const deltaSummary = [
      `Highlights: ${currentHighlights} this week vs ${priorHighlights} last week.`,
      `Notes edited: ${currentNotes} this week vs ${priorNotes} last week.`,
      `Concepts activated: ${currentConcepts} this week vs ${priorConcepts} last week.`
    ];

    return {
      rangeDays,
      activeConcepts,
      notesInProgress: notesInProgressResult,
      openQuestions: { groups: openQuestionsGrouped },
      deltaSummary
    };
  };

  return { getReflections };
};

module.exports = { buildReflectionService };
