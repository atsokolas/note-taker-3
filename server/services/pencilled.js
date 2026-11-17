/* Everything of the reader's still in pencil, newest first: notes, articles,
   and highlights an agent made on an article. `by` narrows it to one
   connection's hand over a stretch of time, which is what a handoff wrote. */
const LIMIT = 200;

const pencilled = async ({ Article, NotebookEntry, userId, tokenId, during }) => {
  const by = {
    'pencil.agent': { $nin: ['', null] },
    ...(tokenId ? { 'pencil.tokenId': tokenId } : {}),
    ...(during ? { 'pencil.at': during } : {})
  };
  const ours = mark => Boolean(mark.pencil?.agent)
    && (!tokenId || String(mark.pencil.tokenId) === String(tokenId))
    && (!during || (mark.pencil.at >= during.$gte && mark.pencil.at <= during.$lte));
  const row = (kind, record, extra = {}) => ({ kind, id: String(record._id), title: record.title, agent: record.pencil.agent, at: record.pencil.at, ...extra });
  const [notes, articles, marked] = await Promise.all([
    NotebookEntry.find({ userId, ...by }).select('_id title pencil').sort({ 'pencil.at': -1 }).limit(LIMIT).lean(),
    Article.find({ userId, ...by }).select('_id title pencil').sort({ 'pencil.at': -1 }).limit(LIMIT).lean(),
    Article.find({ userId, highlights: { $elemMatch: by } }).select('_id title highlights').limit(LIMIT).lean()
  ]);
  return [
    ...notes.map(note => row('note', note)),
    ...articles.map(article => row('article', article)),
    ...marked.flatMap(article => article.highlights.filter(ours).map(mark => ({
      ...row('highlight', { ...mark, _id: article._id, title: article.title }), highlightId: String(mark._id), text: mark.text
    })))
  ].sort((left, right) => new Date(right.at) - new Date(left.at));
};

module.exports = { pencilled };
