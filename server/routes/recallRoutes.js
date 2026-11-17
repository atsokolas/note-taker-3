const express = require('express');
const mongoose = require('mongoose');
const { retrieveWithBearing, readSource } = require('../services/agentRetrieval');
const { waitingFor } = require('./handoffRoutes');

const MAX_LIMIT = 25;
const BRIEF_LIMIT = 16;
const STANDING = 8;

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

const buildRecallRouter = ({ authenticateToken, Article, NotebookEntry, TagMeta, WikiPage, Question = null, Handoff = null, semanticSearch = null }) => {
  const router = express.Router();
  const models = { Article, NotebookEntry, TagMeta, WikiPage, Question };
  // Aggregations do not cast ids the way finds do.
  const userOf = req => new mongoose.Types.ObjectId(req.user.id);

  router.get('/api/recall', authenticateToken, async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 500);
    if (!query) return res.status(400).json({ error: 'Query parameter q is required.' });
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    try {
      const hits = await recall({ userId: userOf(req), query, limit, models, semanticSearch });
      res.json({ query, results: hits.map(asResult) });
    } catch (error) {
      console.error('[recall] search failed', error.message);
      res.status(500).json({ error: 'Recall failed.' });
    }
  });

  /* One call at the start of a session: what the reader handed over, first;
     then on a topic, everything of theirs that bears on it, by kind; with
     none, where they stand. */
  router.get('/api/brief', authenticateToken, async (req, res) => {
    const topic = String(req.query.topic || '').trim().slice(0, 500);
    try {
      const userId = userOf(req);
      const groups = topic
        ? groupByKind((await recall({ userId, query: topic, limit: BRIEF_LIMIT, models, semanticSearch })).map(asResult))
        : await standing({ userId, models });
      res.json({ topic, handedToYou: Handoff ? await waitingFor({ Handoff, req }) : [], ...groups });
    } catch (error) {
      console.error('[brief] failed', error.message);
      res.status(500).json({ error: 'The brief could not be gathered.' });
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

  return router;
};

module.exports = { buildRecallRouter };
