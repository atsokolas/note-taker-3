const express = require('express');
const mongoose = require('mongoose');
const { createWikiSourceEvent } = require('../services/wikiSourceEventService');
const { cleanWikiSummary } = require('../services/wikiSourceRefs');
const { whatItAdded, lately, rates, aboutOf } = require('../services/whatItAdded');

const TITLE_KEPT = 300;
const TEXT_KEPT = 2000;
const KEY = /^(highlight|question|wiki_page):[a-f\d]{24}$/i;
// What the reading room calls lately, and how far back the rates look by default.
const LATELY_DAYS = 7;
const RATES_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
// The relation an inked connection is kept as, by what Noeis saw.
const RELATION = { echo: 'related', answers: 'supports', belongs: 'contained_by', argues: 'contradicts' };

/* What a source added, as Noeis drew it and the model confirmed: echoes,
   answers, where it belongs and what it argues with, in pencil until the
   reader inks one (an ordinary Connection from the source) or strikes it (a
   Verdict in Noeis's hand, kept with what it was about, so it is never
   offered again and agents read it as the reader's taste). Inking a page it
   belongs on also sends the source to that page, so the wiki writes a cited
   line the reader accepts there. Readers and agents may ask; only the reader,
   here or from their own desktop, inks and strikes. */
const buildAddedRouter = ({
  authenticateToken, ownDesktop, Article, Connection, ConnectionJudgment, Verdict, WikiSourceEvent, added = whatItAdded
}) => {
  const router = express.Router();
  const models = { Article, ConnectionJudgment, Verdict };
  const named = ({ params, body }) => mongoose.isValidObjectId(params.articleId) && KEY.test(String(body?.key || ''));

  // What arrived this week and connected, newest first.
  router.get('/api/added', authenticateToken, async (req, res) => {
    try {
      const since = new Date(Date.now() - LATELY_DAYS * DAY_MS);
      const told = await lately({ userId: req.user.id, since, models, added });
      return res.json({ lately: told.map(({ score, ...connection }) => connection) });
    } catch (error) {
      console.warn('[added] lately failed', String(error?.message || error).slice(0, 160));
      return res.json({ lately: [] });
    }
  });

  // How well connections land: connect rate and ink rate, over the last `days`.
  router.get('/api/added/rates', authenticateToken, async (req, res) => {
    const days = Math.min(365, Math.max(1, Number.parseInt(String(req.query.days), 10) || RATES_DAYS));
    try {
      return res.json(await rates({ userId: req.user.id, since: new Date(Date.now() - days * DAY_MS), models: { ConnectionJudgment, Connection, Verdict } }));
    } catch (error) {
      console.error('[added] rates failed', error.message);
      return res.status(500).json({ error: 'The rates could not be counted.' });
    }
  });

  router.get('/api/added/:articleId', authenticateToken, async (req, res) => {
    const { articleId } = req.params;
    if (!mongoose.isValidObjectId(articleId)) return res.status(400).json({ error: 'Name a source of yours.' });
    const userId = req.user.id;
    try {
      const [found, inked] = await Promise.all([
        added({ userId, articleId, models }),
        Connection.find({ userId, fromType: 'article', fromId: articleId }).select('toType toId').lean()
      ]);
      const inkedAs = new Map(inked.map(row => [`${row.toType}:${row.toId}`, String(row._id)]));
      return res.json({ added: found.map(({ score, ...connection }) => ({ ...connection, inked: inkedAs.get(connection.key) || null })) });
    } catch (error) {
      console.warn('[added] lookup failed', String(error?.message || error).slice(0, 160));
      return res.json({ added: [] });
    }
  });

  router.post('/api/added/:articleId/ink', ownDesktop, async (req, res) => {
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

  router.post('/api/added/:articleId/strike', ownDesktop, async (req, res) => {
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
