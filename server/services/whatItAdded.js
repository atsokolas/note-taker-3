const { addedBy } = require('../ai/semanticSearch');
const { cleanWikiSummary } = require('./wikiSourceRefs');
const { judged, holds } = require('./judged');
const { relations } = require('./disagreements');
const { SUPPRESSED } = require('./readingRoomService');

const ADDED_EACH = 3;
const SOURCE_SAYS = 1200;
// Lately: the newest sources asked, and how many that connected are told.
const LATELY_ASKED = 10;
const LATELY_TOLD = 3;
// What may argue: a passage it echoes or a page line it belongs beside.
const ARGUABLE = new Set(['echo', 'belongs']);

const aboutOf = (articleId, key) => `${articleId}>${key}`;

/* What a source added to what you already hold. The vectors find what is
   close; the model reads each pair once (services/judged.js) and only what
   bears or argues is offered, the strongest ADDED_EACH of each kind, never
   one the reader struck. */
const whatItAdded = async ({ userId, articleId, models, find = addedBy, judge = relations }) => {
  const { Article, Verdict } = models;
  const close = await find({ userId, articleId, models });
  const struck = close.length ? await Verdict.find({ userId, kind: 'connection', about: { $in: close.map(({ key }) => aboutOf(articleId, key)) } }).select('about').lean() : [];
  const gone = new Set(struck.map(row => row.about));
  const found = close.filter(({ key }) => !gone.has(aboutOf(articleId, key)));
  if (!found.length) return [];
  const source = await Article.findOne({ _id: articleId, userId }).select('title content highlights.text').lean();
  const says = ((source?.highlights || []).map(mark => mark.text).filter(Boolean).join('\n') || cleanWikiSummary(source?.content, SOURCE_SAYS)).slice(0, SOURCE_SAYS);
  if (!says) return [];
  const read = await judged({
    userId,
    models,
    judge,
    pairs: found.map(({ key, to }) => ({ about: aboutOf(articleId, key), a: { who: source.title || 'the new source', says }, b: { who: to.title || 'what you hold', says: to.quote || to.title } }))
  });
  const offered = found.flatMap((connection) => {
    const judgment = read.get(aboutOf(articleId, connection.key));
    if (!holds(judgment)) return [];
    return judgment.relation === 'argues' && ARGUABLE.has(connection.kind) ? [{ ...connection, kind: 'argues', says: judgment.says }] : [connection];
  });
  return offered.filter((connection, at) => offered.slice(0, at).filter(other => other.kind === connection.kind).length < ADDED_EACH);
};

/* What arrived lately and connected: of the newest sources saved since and
   not hidden from the Library,
   the ones that added something, each with the strongest thing it added, so
   the reading room and the morning paper can say it before you open them. */
const lately = async ({ userId, since, models, added = whatItAdded }) => {
  const sources = await models.Article.find({ userId, ...SUPPRESSED, createdAt: { $gte: since } })
    .sort({ createdAt: -1 }).limit(LATELY_ASKED).select('title').lean();
  const told = [];
  for (const source of sources) {
    if (told.length >= LATELY_TOLD) break;
    const [first] = await added({ userId, articleId: String(source._id), models });
    if (first) told.push({ articleId: String(source._id), title: source.title || '', ...first });
  }
  return told;
};

/* How well the connections land, since a day: of the sources the model read
   for what they added, the share that connected (the connect rate), and of
   the connections offered, how many the reader inked and struck (the ink
   rate is what a reader actually sees of precision). Derived from what is
   stored, never kept beside it. */
const SOURCE_PAIR = /^([a-f\d]{24})>/;
const rates = async ({ userId, since, models: { ConnectionJudgment, Connection, Verdict } }) => {
  const [judgments, inked, struck] = await Promise.all([
    ConnectionJudgment.find({ userId, about: { $regex: SOURCE_PAIR }, createdAt: { $gte: since } }).select('about relation').lean(),
    Connection.countDocuments({ userId, fromType: 'article', createdAt: { $gte: since } }),
    Verdict.countDocuments({ userId, kind: 'connection', verdict: 'strike', createdAt: { $gte: since } })
  ]);
  const sourceOf = row => SOURCE_PAIR.exec(row.about)[1];
  const kept = judgments.filter(row => row.relation !== 'none');
  const read = new Set(judgments.map(sourceOf)).size;
  const connected = new Set(kept.map(sourceOf)).size;
  const share = (part, whole) => (whole ? Math.round((part / whole) * 100) / 100 : null);
  return {
    since,
    sources: { read, connected, connectRate: share(connected, read) },
    connections: { offered: kept.length, inked, struck, inkRate: share(inked, kept.length) }
  };
};

module.exports = { whatItAdded, lately, rates, aboutOf };
