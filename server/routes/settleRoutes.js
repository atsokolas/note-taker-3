const express = require('express');
const mongoose = require('mongoose');
const { docText } = require('../lib/editorialText');
const { createWikiRevision, snapshotPage } = require('../services/wikiRevisionService');
const { findWriteTimeCanonicalPage } = require('../services/wikiDedupeService');
const { SETTLE_KINDS, settleDraftFrom, settleRefusal, settledLabel, settledPageFor } = require('../services/settlement');

/* One gesture from Think: this note, or this concept, is finished; let it
   settle into Wiki. The first time makes the page; every time after is a new
   revision of it. */
const buildSettleRouter = ({
  authenticateToken,
  NotebookEntry,
  TagMeta,
  Article,
  WikiPage,
  WikiRevision,
  buildUniqueSlug,
  refreshPageClaims,
  serializePage,
  onPageChanged = async () => {}
}) => {
  const router = express.Router();
  const models = { NotebookEntry, TagMeta, Article };

  router.post('/api/:kind(notebook|concepts)/:id/settle', authenticateToken, async (req, res) => {
    const { kind, id } = req.params;
    const { noun, createdFrom, load, writing } = SETTLE_KINDS[kind];
    try {
      if (req.agentToken) return res.status(403).json({ error: `Only you can settle your own ${noun}.` });
      const userId = req.user.id;
      const record = mongoose.Types.ObjectId.isValid(id) ? await load(models, userId, id) : null;
      if (!record) return res.status(404).json({ error: `${noun[0].toUpperCase()}${noun.slice(1)} not found.` });

      const draft = settleDraftFrom(await writing(models, record));
      const refusal = settleRefusal(draft, noun);
      if (refusal) return res.status(422).json({ error: refusal });

      const settled = await settledPageFor({ WikiPage, userId, kind, id: record._id });
      const namesake = findWriteTimeCanonicalPage(
        await WikiPage.find({ userId, status: { $ne: 'archived' }, _id: { $ne: settled?._id } }).sort({ updatedAt: -1 }).limit(500),
        draft.title
      );
      if (namesake) {
        return res.status(409).json({
          error: `Wiki already has a page called “${namesake.title}”. Rename this ${noun} to settle it as its own page.`,
          page: { _id: String(namesake._id), title: namesake.title }
        });
      }

      const before = settled ? snapshotPage(settled) : null;
      const page = settled || new WikiPage({
        userId,
        pageType: 'topic',
        status: 'published',
        visibility: 'private',
        sourceScope: 'selected_sources',
        createdFrom: { type: createdFrom, objectId: record._id, label: settledLabel(kind, record._id) }
      });
      if (page.title !== draft.title) {
        page.title = draft.title;
        page.slug = await buildUniqueSlug(userId, draft.title, page._id);
      }
      page.body = draft.body;
      page.plainText = docText(draft.body);
      page.sourceRefs = draft.sourceRefs;
      refreshPageClaims(page);
      await page.save();
      await onPageChanged(page, userId);
      await createWikiRevision({
        WikiRevision,
        userId,
        page,
        before,
        reason: settled ? 'user_edit' : 'created',
        actorType: 'user',
        summary: `${settled ? 'Settled again' : 'Settled'} from the ${noun} “${draft.title}”.`
      });
      return res.status(settled ? 200 : 201).json({ page: serializePage(page), resettled: Boolean(settled) });
    } catch (error) {
      console.error(`Error settling a ${noun} into Wiki:`, error);
      return res.status(500).json({ error: `The ${noun} did not settle. Try again.` });
    }
  });

  return router;
};

module.exports = { buildSettleRouter };
