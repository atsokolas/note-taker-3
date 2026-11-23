const { addedBy } = require('../ai/semanticSearch');
const { cleanWikiSummary } = require('./wikiSourceRefs');
const { relations } = require('./disagreements');

const ADDED_EACH = 3;
const SOURCE_SAYS = 1200;
// What may argue: a passage it echoes or a page line it belongs beside.
const ARGUABLE = new Set(['echo', 'belongs']);

const aboutOf = (articleId, key) => `${articleId}>${key}`;

/* What a source added to what you already hold. The vectors find what is
   close; the model reads each new pair once and says whether the source
   bears on it, argues with it, or only shares its words, and that judgment
   is kept, so a pair is never read twice. Only what bears or argues is
   offered, the strongest ADDED_EACH of each kind. A pair the model could not
   read this time is left out and read next time. */
const whatItAdded = async ({ userId, articleId, models, find = addedBy, judge = relations }) => {
  const { Article, ConnectionJudgment } = models;
  const found = await find({ userId, articleId, models });
  if (!found.length) return [];
  const kept = await ConnectionJudgment.find({ userId, about: { $in: found.map(({ key }) => aboutOf(articleId, key)) }, relation: { $exists: true } })
    .select('about relation says').lean();
  // An argument kept without the source's side is read again, so it can say what it argues.
  const judged = new Map(kept.filter(row => row.relation !== 'argues' || row.says).map(row => [row.about, row]));
  const unjudged = found.filter(({ key }) => !judged.has(aboutOf(articleId, key)));
  if (unjudged.length) {
    const source = await Article.findOne({ _id: articleId, userId }).select('title content highlights.text').lean();
    const says = ((source?.highlights || []).map(mark => mark.text).filter(Boolean).join('\n') || cleanWikiSummary(source?.content, SOURCE_SAYS)).slice(0, SOURCE_SAYS);
    const read = says ? await judge({
      pairs: unjudged.map(({ to }) => ({ a: { who: source.title || 'the new source', says }, b: { who: to.title || 'what you hold', says: to.quote || to.title } }))
    }).catch((error) => {
      console.warn('[added] judging failed', String(error?.message || error).slice(0, 160));
      return [];
    }) : [];
    const rows = read.map(row => ({
      userId, about: aboutOf(articleId, unjudged[row.index].key), relation: row.relation, says: row.relation === 'argues' ? (row.a || says.split('\n')[0]).slice(0, 500) : ''
    }));
    if (rows.length) {
      await ConnectionJudgment.bulkWrite(rows.map(row => ({ updateOne: { filter: { userId, about: row.about }, update: { $set: row }, upsert: true } })));
    }
    rows.forEach(row => judged.set(row.about, row));
  }
  const offered = found.flatMap((connection) => {
    const judgment = judged.get(aboutOf(articleId, connection.key));
    if (!judgment || judgment.relation === 'none') return [];
    return judgment.relation === 'argues' && ARGUABLE.has(connection.kind) ? [{ ...connection, kind: 'argues', says: judgment.says }] : [connection];
  });
  return offered.filter((connection, at) => offered.slice(0, at).filter(other => other.kind === connection.kind).length < ADDED_EACH);
};

module.exports = { whatItAdded, aboutOf };
