const express = require('express');
const mongoose = require('mongoose');
const { retrievePassages, readSource } = require('../services/agentRetrieval');

const MAX_LIMIT = 25;

// The kind an outside agent opens a hit as: a marked passage is a highlight,
// a wiki page carrying a held view is that view.
const kindOf = (hit) => {
  if (hit.type === 'article') return hit.highlightId ? 'highlight' : 'article';
  if (hit.type === 'notebook') return 'note';
  if (hit.type === 'wiki_page') return hit.held ? 'view' : 'wiki_page';
  return hit.type;
};

/* What an outside agent asks the whole library: the same retrieval the
   in-app partner uses (term and meaning, ranked by how well each passage
   answers), across saved articles, highlights with their margin notes,
   Think, concepts, held views and wiki pages. Work stays out: the model
   hook keeps it out of every personal query. */
const buildRecallRouter = ({ authenticateToken, Article, NotebookEntry, TagMeta, WikiPage, semanticSearch = null }) => {
  const router = express.Router();
  const models = { Article, NotebookEntry, TagMeta, WikiPage };

  router.get('/api/recall', authenticateToken, async (req, res) => {
    const query = String(req.query.q || '').trim().slice(0, 500);
    if (!query) return res.status(400).json({ error: 'Query parameter q is required.' });
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    try {
      const hits = await retrievePassages({
        // Aggregations do not cast ids the way finds do.
        userId: new mongoose.Types.ObjectId(req.user.id),
        query,
        limit,
        includePages: true,
        // An agent judges what comes back, as the partner's own model does.
        forModel: true,
        models,
        semanticSearch
      });
      res.json({
        query,
        results: hits.map(hit => ({
          kind: kindOf(hit),
          id: hit.id,
          ...(hit.highlightId ? { highlightId: hit.highlightId } : {}),
          title: hit.title,
          passage: hit.snippet,
          ...(hit.held ? { held: hit.held } : {}),
          ...(hit.pencil ? { pencil: hit.pencil } : {}),
          updatedAt: hit.updatedAt
        }))
      });
    } catch (error) {
      console.error('[recall] search failed', error.message);
      res.status(500).json({ error: 'Recall failed.' });
    }
  });

  router.get('/api/recall/read/:id', authenticateToken, async (req, res) => {
    try {
      const source = await readSource({ userId: new mongoose.Types.ObjectId(req.user.id), id: req.params.id, models });
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
