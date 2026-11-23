const express = require('express');
const mongoose = require('mongoose');
const { createWikiSourceEvent } = require('../services/wikiSourceEventService');
const { cleanWikiSummary } = require('../services/wikiSourceRefs');

const TITLE_KEPT = 300;
const TEXT_KEPT = 2000;
const KEY = /^(highlight|question|wiki_page):[a-f\d]{24}$/i;
// The relation an inked connection is kept as, by what Noeis saw.
const RELATION = { echo: 'related', answers: 'supports', belongs: 'contained_by' };

/* What a source added, as Noeis drew it: echoes, answers and where it
   belongs, in pencil until the reader inks one (an ordinary Connection from
   the source) or strikes it (a Verdict in
   Noeis's hand, kept with what it was about, so it is never offered again
   and agents read it as the reader's taste). Inking a page it belongs on
   also sends the source to that page, so the wiki writes a cited line the
   reader accepts there. Readers and agents may ask; only the reader inks
   and strikes. */
const buildAddedRouter = ({
  authenticateToken, humanOnly, Article, Connection, Verdict, WikiSourceEvent,
  addedBy = asked => require('../ai/semanticSearch').addedBy(asked)
}) => {
  const router = express.Router();
  const aboutOf = (articleId, key) => `${articleId}>${key}`;
  const named = ({ params, body }) => mongoose.isValidObjectId(params.articleId) && KEY.test(String(body?.key || ''));

  router.get('/api/added/:articleId', authenticateToken, async (req, res) => {
    const { articleId } = req.params;
    if (!mongoose.isValidObjectId(articleId)) return res.status(400).json({ error: 'Name a source of yours.' });
    const userId = req.user.id;
    try {
      const found = await addedBy({ userId, articleId });
      const [inked, struck] = await Promise.all([
        Connection.find({ userId, fromType: 'article', fromId: articleId }).select('toType toId').lean(),
        Verdict.find({ userId, kind: 'connection', about: { $in: found.map(connection => aboutOf(articleId, connection.key)) } }).select('about').lean()
      ]);
      const inkedAs = new Map(inked.map(row => [`${row.toType}:${row.toId}`, String(row._id)]));
      const gone = new Set(struck.map(row => row.about));
      const added = found
        .filter(connection => !gone.has(aboutOf(articleId, connection.key)))
        .map(({ score, ...connection }) => ({ ...connection, inked: inkedAs.get(connection.key) || null }));
      return res.json({ added });
    } catch (error) {
      console.warn('[added] lookup failed', String(error?.message || error).slice(0, 160));
      return res.json({ added: [] });
    }
  });

  router.post('/api/added/:articleId/ink', authenticateToken, humanOnly, async (req, res) => {
    const relationType = RELATION[req.body?.kind];
    if (!named(req) || !relationType) return res.status(400).json({ error: 'Name the source and the connection to ink.' });
    const { articleId } = req.params;
    const { key } = req.body;
    const [toType, toId] = key.split(':');
    const userId = req.user.id;
    try {
      const source = await Article.findOne({ _id: articleId, userId }).select('title url content highlights.text').lean();
      if (!source) return res.status(404).json({ error: 'That source is not yours.' });
      const connection = { userId, fromType: 'article', fromId: articleId, toType, toId, relationType };
      const held = await Connection.findOne(connection).select('_id').lean();
      const inked = held || await Connection.create(connection);
      if (!held && toType === 'wiki_page') {
        await createWikiSourceEvent({
          WikiSourceEvent, userId, sourceType: 'article', sourceObjectId: articleId, eventType: 'updated',
          title: source.title, url: source.url, affectedPageIds: [toId],
          text: [...(source.highlights || []).map(mark => mark.text), cleanWikiSummary(source.content, 8000)].filter(Boolean).join('\n\n'),
          metadata: { requireOwnerAcceptance: true, inkedConnection: true }
        });
      }
      return res.json({ key, inked: String(inked._id) });
    } catch (error) {
      console.error('[added] ink failed', error.message);
      return res.status(500).json({ error: 'That could not be inked.' });
    }
  });

  router.post('/api/added/:articleId/strike', authenticateToken, humanOnly, async (req, res) => {
    if (!named(req)) return res.status(400).json({ error: 'Name the source and the connection to strike.' });
    const { articleId } = req.params;
    const { key } = req.body;
    try {
      await Verdict.create({
        userId: req.user.id,
        verdict: 'strike',
        kind: 'connection',
        agent: 'noeis',
        about: aboutOf(articleId, key),
        title: String(req.body?.title || '').slice(0, TITLE_KEPT),
        text: String(req.body?.quote || '').slice(0, TEXT_KEPT)
      });
      return res.json({ key, struck: true });
    } catch (error) {
      console.error('[added] strike failed', error.message);
      return res.status(500).json({ error: 'That could not be struck.' });
    }
  });

  return router;
};

module.exports = { buildAddedRouter };
