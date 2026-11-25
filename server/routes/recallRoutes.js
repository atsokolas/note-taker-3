const express = require('express');
const mongoose = require('mongoose');
const { retrieveWithBearing, readSource } = require('../services/agentRetrieval');
const { waitingFor } = require('./handoffRoutes');
const { openDisagreements } = require('./disagreementRoutes');
const { pencilOf } = require('../services/agentTokenService');
const { waitingTonight } = require('../services/nightstand');
const { whatItAdded, lately } = require('../services/whatItAdded');
const { readKept } = require('../services/home');

const MAX_LIMIT = 25;
const BRIEF_LIMIT = 16;
const STANDING = 8;
// How far down recall's answers a named source may sit and still count as found.
const KNOWS_TOP = 8;
const TASTE_LATELY = 12;
// What the brief says the reading added: the last week.
const ADDED_DAYS = 7;
// A fortune is a passage long enough to carry a thought: forty characters or more.
const FORTUNE_WORDS = /^[\s\S]{40,}$/;

// The kind an outside agent opens a hit as: a marked passage is a highlight,
// a wiki page carrying a held view is that view.
const kindOf = (hit) => {
  if (hit.type === 'article') return hit.highlightId ? 'highlight' : 'article';
  if (hit.type === 'notebook') return 'note';
  if (hit.type === 'wiki_page') return hit.held ? 'view' : 'wiki_page';
  return hit.type;
};

const asResult = hit => ({
  kind: kindOf(hit),
  id: hit.id,
  ...(hit.highlightId ? { highlightId: hit.highlightId } : {}),
  title: hit.title,
  passage: hit.snippet,
  ...(hit.held ? { held: hit.held } : {}),
  ...(hit.pencil ? { pencil: hit.pencil } : {}),
  ...(hit.bearsOn ? { bearsOn: hit.bearsOn } : {}),
  updatedAt: hit.updatedAt
});

/* What an outside agent asks the whole library: the same retrieval the
   in-app partner uses (term and meaning, ranked by how well each passage
   answers), across saved articles, highlights with their margin notes,
   Think, open questions, concepts, held views and wiki pages, with the
   reading that bears on what the reader wrote. Work stays out: the model
   hook keeps it out of every personal query. */
const recall = ({ userId, query, limit, models, semanticSearch }) => retrieveWithBearing({
  userId, query, limit, includePages: true, forModel: true, models, semanticSearch
});

/* Each passage with the connections the reader inked, from it or to it, so
   an agent sees what it echoes, answers, argues with and belongs on, not
   the passage alone. */
const withConnections = async ({ Connection, userId, results }) => {
  const ids = [...new Set(results.flatMap(hit => [hit.id, hit.highlightId]).filter(Boolean))];
  if (!Connection || !ids.length) return results;
  const inked = await Connection.find({ userId, $or: [{ fromId: { $in: ids } }, { toId: { $in: ids } }] })
    .select('fromType fromId toType toId relationType').lean();
  const of = hit => inked
    .filter(row => [hit.id, hit.highlightId].includes(row.fromId) || [hit.id, hit.highlightId].includes(row.toId))
    .map(row => ([hit.id, hit.highlightId].includes(row.fromId)
      ? { relation: row.relationType, kind: row.toType, id: row.toId }
      : { relation: row.relationType, kind: row.fromType, id: row.fromId, from: true }));
  return results.map(hit => ({ ...hit, ...(of(hit).length ? { connected: of(hit) } : {}) }));
};

/* What the reader's reading added this week, as the reading room says it:
   only what the model already judged, so a brief never waits on a reading. */
const addedThisWeek = ({ userId, models, added }) => lately({
  userId,
  since: new Date(Date.now() - ADDED_DAYS * 24 * 60 * 60 * 1000),
  models,
  added: asked => added({ ...asked, judge: async () => [] })
}).then(told => told.map(({ articleId, title, score, ...connection }) => ({ kind: 'article', id: articleId, title, added: connection })));

/* What the reader keeps for good, oldest first: whole sources, single
   passages and threads they kept. Start from it; never argue it away. */
const keptFor = async ({ Article, Thread, userId }) => (await readKept({ Article, Thread, userId })).map(held => ({
  kind: { source: 'article', mark: 'highlight', thread: 'thread' }[held.kind],
  id: held.threadId || held.articleId,
  ...(held.highlightId ? { highlightId: held.highlightId } : {}),
  title: held.title,
  ...(held.text || held.note ? { passage: held.text || held.note } : {}),
  keptAt: held.at
}));

// Results by kind, what an agent has not inked set apart from the reader's own.
const groupByKind = results => results.reduce((groups, hit) => {
  const kind = hit.pencil ? 'pencil' : hit.kind;
  return { ...groups, [kind]: [...(groups[kind] || []), hit] };
}, {});

/* Where the reader stands when an agent arrives with no topic yet: the views
   they hold, the questions they are asking, what agents left in pencil, and
   what they saved last. */
const standing = async ({ userId, models: { Article, NotebookEntry, WikiPage, Question } }) => {
  const recent = (query, fields) => query.sort({ updatedAt: -1 }).limit(STANDING).select(fields).lean();
  const [views, questions, pencilNotes, pencilReading, reading] = await Promise.all([
    recent(WikiPage.find({ userId, 'judgment.currentJudgment': { $nin: ['', null] }, 'judgment.status': { $nin: ['parked', 'closed', 'archived'] }, status: { $ne: 'archived' } }), '_id title judgment.currentJudgment updatedAt'),
    Question ? recent(Question.find({ userId, status: 'open', archived: { $ne: true } }), '_id text settledBy updatedAt') : [],
    recent(NotebookEntry.find({ userId, pencil: { $ne: null } }), '_id title pencil updatedAt'),
    recent(Article.find({ userId, pencil: { $ne: null } }), '_id title pencil updatedAt'),
    recent(Article.find({ userId, pencil: null, archived: { $ne: true }, hiddenFromHome: { $ne: true } }), '_id title updatedAt')
  ]);
  const row = kind => ({ _id, title, text, settledBy, pencil, judgment, updatedAt }) => ({
    kind, id: String(_id), title: title || text, ...(settledBy ? { settledBy } : {}), ...(judgment ? { held: judgment.currentJudgment } : {}), ...(pencil ? { pencil: pencil.agent } : {}), updatedAt
  });
  return {
    view: views.map(row('view')),
    question: questions.map(row('question')),
    pencil: [...pencilNotes.map(row('note')), ...pencilReading.map(row('article'))],
    article: reading.map(row('article'))
  };
};

/* The reader's taste, as agents read it: derived from every verdict they
   gave on agents' pencil, never written down where it could go stale. How
   much they keep, and the latest of what they kept and struck, with why. */
const tasteOf = async ({ Verdict, userId }) => {
  if (!Verdict) return null;
  const [counts, lately] = await Promise.all([
    Verdict.aggregate([{ $match: { userId } }, { $group: { _id: '$verdict', n: { $sum: 1 } } }]),
    Verdict.find({ userId }).sort({ createdAt: -1 }).limit(TASTE_LATELY).select('verdict kind agent title why createdAt').lean()
  ]);
  const count = verdict => counts.find(row => row._id === verdict)?.n || 0;
  return {
    inked: count('ink'),
    struck: count('strike'),
    lately: lately.map(row => ({ verdict: row.verdict, kind: row.kind, agent: row.agent, title: row.title, ...(row.why ? { why: row.why } : {}), at: row.createdAt }))
  };
};

const buildRecallRouter = ({ authenticateToken, Article, NotebookEntry, TagMeta, WikiPage, Question = null, Handoff = null, Citation = null, RecallCheck = null, Verdict = null, Disagreement = null, Connection = null, ConnectionJudgment = null, Thread = null, added = whatItAdded, humanOnly = (_req, _res, next) => next(), semanticSearch = null }) => {
  const router = express.Router();
  const models = { Article, NotebookEntry, TagMeta, WikiPage, Question };
  const recalled = async ({ userId, query, limit }) => withConnections({
    Connection, userId, results: (await recall({ userId, query, limit, models, semanticSearch })).map(asResult)
  });
  // Aggregations do not cast ids the way finds do.
  const userOf = req => new mongoose.Types.ObjectId(req.user.id);

  router.get('/api/recall', authenticateToken, async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 500);
    if (!query) return res.status(400).json({ error: 'Query parameter q is required.' });
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    try {
      res.json({ query, results: await recalled({ userId: userOf(req), query, limit }) });
    } catch (error) {
      console.error('[recall] search failed', error.message);
      res.status(500).json({ error: 'Recall failed.' });
    }
  });

  /* One call at the start of a session: what the reader handed over, first;
     what they keep for good; then on a topic, everything of theirs that bears on it, by kind; with
     none, where they stand. */
  router.get('/api/brief', authenticateToken, async (req, res) => {
    const topic = String(req.query.topic || '').trim().slice(0, 500);
    try {
      const userId = userOf(req);
      const groups = topic
        ? groupByKind(await recalled({ userId, query: topic, limit: BRIEF_LIMIT }))
        : await standing({ userId, models });
      const [handedToYou, kept, thisWeek, taste, disagreements] = await Promise.all([
        Handoff ? waitingFor({ Handoff, req }) : [],
        keptFor({ Article, Thread, userId }),
        ConnectionJudgment && Verdict ? addedThisWeek({ userId, models: { Article, ConnectionJudgment, Verdict }, added }) : [],
        tasteOf({ Verdict, userId }),
        openDisagreements({ Disagreement, userId })
      ]);
      res.json({ topic, handedToYou, ...(kept.length ? { kept } : {}), ...(thisWeek.length ? { added: thisWeek } : {}), ...(taste ? { taste } : {}), ...(disagreements.length ? { disagreements } : {}), ...groups });
    } catch (error) {
      console.error('[brief] failed', error.message);
      res.status(500).json({ error: 'The brief could not be gathered.' });
    }
  });

  /* For a terminal: what fits tonight from the nightstand, and one passage
     of the reader's own, drawn at random, the way `fortune` draws one. */
  router.get('/api/tonight', authenticateToken, async (req, res) => {
    try {
      return res.json({ tonight: await waitingTonight({ Article, userId: req.user.id }) });
    } catch (error) {
      console.error('[tonight] failed', error.message);
      return res.status(500).json({ error: 'Tonight could not be found.' });
    }
  });

  router.get('/api/fortune', authenticateToken, async (req, res) => {
    try {
      const [drawn] = await Article.aggregate([
        { $match: { userId: userOf(req) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights.text': { $regex: FORTUNE_WORDS } } },
        { $sample: { size: 1 } },
        { $project: { title: 1, author: 1, text: '$highlights.text', page: '$highlights.page' } }
      ]);
      return res.json({ fortune: drawn ? { text: drawn.text, title: drawn.title || '', author: drawn.author || '', page: drawn.page || null } : null });
    } catch (error) {
      console.error('[fortune] failed', error.message);
      return res.status(500).json({ error: 'No fortune could be drawn.' });
    }
  });

  router.get('/api/taste', authenticateToken, async (req, res) => {
    try {
      return res.json(await tasteOf({ Verdict, userId: userOf(req) }) || { inked: 0, struck: 0, lately: [] });
    } catch (error) {
      console.error('[taste] failed', error.message);
      return res.status(500).json({ error: 'Taste could not be gathered.' });
    }
  });

  router.get('/api/recall/read/:id', authenticateToken, async (req, res) => {
    try {
      const source = await readSource({ userId: userOf(req), id: req.params.id, models });
      if (!source) return res.status(404).json({ error: 'Nothing of yours has that id.' });
      res.json({ kind: kindOf(source), id: source.id, title: source.title, text: source.fullText, ...(source.pencil ? { pencil: source.pencil } : {}), updatedAt: source.updatedAt });
    } catch (error) {
      console.error('[recall] read failed', error.message);
      res.status(500).json({ error: 'Read failed.' });
    }
  });

  /* An agent says where it put something of the reader's to work; the reader
     sees, on the thing itself, where their thinking went. */
  router.post('/api/cite', authenticateToken, async (req, res) => {
    const by = pencilOf(req);
    if (!by || !Citation) return res.status(403).json({ error: 'An agent connection with write access says where it used something.' });
    const where = String(req.body?.where || '').trim().slice(0, 500);
    if (!where) return res.status(400).json({ error: 'Say where you used it: a link, or a few words.' });
    try {
      const source = await readSource({ userId: userOf(req), id: String(req.body?.id || ''), models });
      if (!source) return res.status(404).json({ error: 'Nothing of yours has that id.' });
      await Citation.create({ userId: req.user.id, sourceId: source.id, where, by });
      return res.status(201).json({ id: source.id, title: source.title, where });
    } catch (error) {
      console.error('[cite] failed', error.message);
      return res.status(500).json({ error: 'That could not be recorded.' });
    }
  });

  router.get('/api/cite/:id', authenticateToken, async (req, res) => {
    if (!Citation) return res.json({ usedIn: [] });
    const rows = await Citation.find({ userId: req.user.id, sourceId: String(req.params.id) }).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({ usedIn: rows.map(row => ({ where: row.where, agent: row.by.agent, at: row.createdAt })) });
  });

  /* "Does Noeis know me?": the questions the reader expects their library to
     answer, each asked of recall now, and whether the sources they named come
     back among the first few. */
  const knows = async (userId, check) => {
    const hits = await recall({ userId, query: check.question, limit: KNOWS_TOP, models, semanticSearch });
    const rank = hits.findIndex(hit => check.expects.includes(hit.id));
    return { id: String(check._id), question: check.question, expects: check.expects, found: rank >= 0, ...(rank >= 0 ? { rank: rank + 1 } : {}) };
  };

  router.get('/api/knows', authenticateToken, humanOnly, async (req, res) => {
    try {
      const checks = await Promise.all((await RecallCheck.find({ userId: req.user.id }).sort({ createdAt: 1 }).lean()).map(check => knows(userOf(req), check)));
      return res.json({ found: checks.filter(check => check.found).length, of: checks.length, checks });
    } catch (error) {
      console.error('[knows] failed', error.message);
      return res.status(500).json({ error: 'Your questions could not be asked.' });
    }
  });

  router.post('/api/knows', authenticateToken, humanOnly, async (req, res) => {
    const question = String(req.body?.question || '').trim().slice(0, 500);
    const expects = (Array.isArray(req.body?.expects) ? req.body.expects : []).map(String).filter(id => mongoose.isValidObjectId(id));
    if (!question || !expects.length) return res.status(400).json({ error: 'Ask a question and name what answers it.' });
    const check = await RecallCheck.create({ userId: req.user.id, question, expects });
    return res.status(201).json(await knows(userOf(req), check));
  });

  router.delete('/api/knows/:id', authenticateToken, humanOnly, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    await RecallCheck.deleteOne({ _id: req.params.id, userId: req.user.id });
    return res.status(204).end();
  });

  return router;
};

module.exports = { buildRecallRouter };
