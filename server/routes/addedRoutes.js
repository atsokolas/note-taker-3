const express = require('express');
const mongoose = require('mongoose');

const TITLE_KEPT = 300;
const TEXT_KEPT = 2000;

/* What a source added, as Noeis drew it: echoes, answers and where it
   belongs, in pencil until the reader inks one (an ordinary Connection from
   the source, made in the Connections room) or strikes it (a Verdict in
   Noeis's hand, kept with what it was about, so it is never offered again
   and agents read it as the reader's taste). Readers and agents may ask;
   only the reader strikes. */
const buildAddedRouter = ({
  authenticateToken, humanOnly, Connection, Verdict,
  addedBy = asked => require('../ai/semanticSearch').addedBy(asked)
}) => {
  const router = express.Router();
  const aboutOf = (articleId, key) => `${articleId}>${key}`;

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

  router.post('/api/added/:articleId/strike', authenticateToken, humanOnly, async (req, res) => {
    const { articleId } = req.params;
    const key = String(req.body?.key || '');
    if (!mongoose.isValidObjectId(articleId) || !/^(highlight|question|wiki_page):[a-f\d]{24}$/i.test(key)) {
      return res.status(400).json({ error: 'Name the source and the connection to strike.' });
    }
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
