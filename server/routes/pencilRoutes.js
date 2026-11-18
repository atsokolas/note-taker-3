const express = require('express');
const mongoose = require('mongoose');
const { pencilled } = require('../services/pencilled');

const TEXT_KEPT = 2000;
const WHY_KEPT = 500;

const plain = blocks => (blocks || []).map(block => String(block.text || '').trim()).filter(Boolean).join('\n\n');
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlOf = blocks => (blocks || []).map(block => `<p>${escapeHtml(String(block.text || ''))}</p>`).join('');

/* Inking and striking: the reader's verdict on what an agent wrote. Ink takes
   it up, and it is theirs from then on; a strike takes it out (a note an
   agent rewrote goes back to the reader's own last version). Every verdict
   is kept, with what it was about, and that log is what an agent reads as
   the reader's taste. Only the reader gives a verdict. */
const buildPencilRouter = ({
  authenticateToken, humanOnly, Article, NotebookEntry, Verdict,
  EntryRevision = null, ReferenceEdge = null, ArticleReadingState = null,
  deleteArticleEmbeddingState = async () => {}, deleteHighlightEmbeddingState = async () => {}
}) => {
  const router = express.Router();
  const valid = id => mongoose.isValidObjectId(id);

  // Each kind: what it says (with the hand that wrote it), how it is inked, and how it is struck.
  const KINDS = {
    note: {
      find: async ({ userId, id }) => {
        const note = await NotebookEntry.findOne({ _id: id, userId }).select('title blocks pencil').lean();
        return note && { pencil: note.pencil, title: note.title, text: plain(note.blocks) };
      },
      ink: ({ userId, id }) => NotebookEntry.updateOne({ _id: id, userId }, { $set: { pencil: null } }),
      strike: async ({ userId, id }) => {
        const yours = EntryRevision && await EntryRevision.findOne({ userId, kind: 'note', entryId: id, hand: '' }).sort({ createdAt: -1 }).lean();
        if (yours) {
          const { title, blocks } = yours.snapshot;
          await NotebookEntry.updateOne({ _id: id, userId }, { $set: { title, blocks, content: htmlOf(blocks), pencil: null } });
          return 'restored';
        }
        await NotebookEntry.deleteOne({ _id: id, userId });
        await ReferenceEdge?.deleteMany({ userId, sourceType: 'notebook', sourceId: id });
        return 'removed';
      }
    },
    article: {
      find: async ({ userId, id }) => {
        const article = await Article.findOne({ _id: id, userId }).select('title url pencil').lean();
        return article && { pencil: article.pencil, title: article.title, text: article.url };
      },
      ink: ({ userId, id }) => Article.updateOne({ _id: id, userId }, { $set: { pencil: null, 'highlights.$[].pencil': null } }),
      strike: async ({ userId, id }) => {
        await Article.deleteOne({ _id: id, userId });
        await ArticleReadingState?.deleteMany({ userId, articleId: id });
        await deleteArticleEmbeddingState({ userId, articleId: id });
        return 'removed';
      }
    },
    highlight: {
      find: async ({ userId, id, highlightId }) => {
        const article = await Article.findOne({ _id: id, userId, 'highlights._id': highlightId }, { title: 1, 'highlights.$': 1 }).lean();
        const mark = article?.highlights?.[0];
        return mark && { pencil: mark.pencil, title: article.title, text: mark.text };
      },
      ink: ({ userId, id, highlightId }) => Article.updateOne({ _id: id, userId, 'highlights._id': highlightId }, { $set: { 'highlights.$.pencil': null } }),
      strike: async ({ userId, id, highlightId }) => {
        await Article.updateOne({ _id: id, userId }, { $pull: { highlights: { _id: highlightId } } });
        await deleteHighlightEmbeddingState({ userId, highlightId });
        return 'removed';
      }
    }
  };

  const named = (body = {}) => {
    const { kind, id, highlightId } = body;
    if (!KINDS[kind] || !valid(id) || (kind === 'highlight' && !valid(highlightId))) return null;
    return { kind, id, ...(kind === 'highlight' ? { highlightId } : {}) };
  };

  const record = ({ req, verdict, target, found }) => Verdict?.create({
    userId: req.user.id,
    verdict,
    kind: target.kind,
    agent: found.pencil.agent,
    title: String(found.title || '').slice(0, 300),
    text: String(found.text || '').slice(0, TEXT_KEPT),
    why: String(req.body?.why || '').trim().slice(0, WHY_KEPT)
  });

  // Everything still in pencil, newest first, for the reader to take up.
  router.get('/api/pencil', authenticateToken, humanOnly, async (req, res) => {
    try {
      return res.json({ pencil: await pencilled({ Article, NotebookEntry, userId: req.user.id }) });
    } catch (error) {
      console.error('[pencil] list failed', error.message);
      return res.status(500).json({ error: 'What is in pencil could not be listed.' });
    }
  });

  router.post('/api/ink', authenticateToken, humanOnly, async (req, res) => {
    const target = named(req.body);
    if (!target) return res.status(400).json({ error: 'Name a note, an article or a highlight of yours to ink.' });
    try {
      const scope = { userId: req.user.id, ...target };
      const found = await KINDS[target.kind].find(scope);
      if (!found) return res.status(404).json({ error: 'Nothing of yours has that id.' });
      await KINDS[target.kind].ink(scope);
      if (found.pencil?.agent) await record({ req, verdict: 'ink', target, found });
      return res.json({ ...target, pencil: null });
    } catch (error) {
      console.error('[ink] failed', error.message);
      return res.status(500).json({ error: 'That could not be inked.' });
    }
  });

  router.post('/api/strike', authenticateToken, humanOnly, async (req, res) => {
    const target = named(req.body);
    if (!target) return res.status(400).json({ error: 'Name a note, an article or a highlight in pencil to strike.' });
    try {
      const scope = { userId: req.user.id, ...target };
      const found = await KINDS[target.kind].find(scope);
      if (!found) return res.status(404).json({ error: 'Nothing of yours has that id.' });
      if (!found.pencil?.agent) return res.status(409).json({ error: 'Only pencil can be struck; this is yours.' });
      await record({ req, verdict: 'strike', target, found });
      return res.json({ ...target, struck: await KINDS[target.kind].strike(scope) });
    } catch (error) {
      console.error('[strike] failed', error.message);
      return res.status(500).json({ error: 'That could not be struck.' });
    }
  });

  return router;
};

module.exports = { buildPencilRouter };
