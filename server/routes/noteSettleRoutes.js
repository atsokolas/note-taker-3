const express = require('express');
const mongoose = require('mongoose');
const { docText } = require('../lib/editorialText');
const { createWikiRevision, snapshotPage } = require('../services/wikiRevisionService');
const { findWriteTimeCanonicalPage } = require('../services/wikiDedupeService');
const { settleDraftFrom, settleRefusal, settledPageFor } = require('../services/noteSettlement');

/* One gesture from Think: this note is finished, let it settle into Wiki.
   The first time makes the page; every time after is a new revision of it. */
const buildNoteSettleRouter = ({
  authenticateToken,
  NotebookEntry,
  WikiPage,
  WikiRevision,
  buildUniqueSlug,
  refreshPageClaims,
  serializePage,
  onPageChanged = async () => {}
}) => {
  const router = express.Router();

  router.post('/api/notebook/:id/settle', authenticateToken, async (req, res) => {
    try {
      if (req.agentToken) return res.status(403).json({ error: 'Only you can settle your own note.' });
      const userId = req.user.id;
      const entry = mongoose.Types.ObjectId.isValid(req.params.id)
        ? await NotebookEntry.findOne({ _id: req.params.id, userId })
        : null;
      if (!entry) return res.status(404).json({ error: 'Note not found.' });

      const draft = settleDraftFrom(entry);
      const refusal = settleRefusal(draft);
      if (refusal) return res.status(422).json({ error: refusal });

      const settled = await settledPageFor({ WikiPage, userId, entryId: entry._id });
      const namesake = findWriteTimeCanonicalPage(
        await WikiPage.find({ userId, status: { $ne: 'archived' }, _id: { $ne: settled?._id } }).sort({ updatedAt: -1 }).limit(500),
        draft.title
      );
      if (namesake) {
        return res.status(409).json({
          error: `Wiki already has a page called “${namesake.title}”. Rename this note to settle it as its own page.`,
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
        createdFrom: { type: 'notebook', objectId: entry._id, label: `settled-note:${entry._id}` }
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
        summary: `${settled ? 'Settled again' : 'Settled'} from the note “${draft.title}”.`
      });
      return res.status(settled ? 200 : 201).json({ page: serializePage(page), resettled: Boolean(settled) });
    } catch (error) {
      console.error('Error settling note into Wiki:', error);
      return res.status(500).json({ error: 'The note did not settle. Try again.' });
    }
  });

  return router;
};

module.exports = { buildNoteSettleRouter };
