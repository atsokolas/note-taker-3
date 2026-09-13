const express = require('express');
const {
  PREVIEW_STALE,
  canPublishVolume,
  composeVolumeSnapshot,
  hashPublicVolume,
  isDuplicateKey,
  loadPublishedCatalog,
  selectPieces,
  shareSlug,
  volumeIntroduction,
  volumeShareState,
  volumeTitle
} = require('../services/authoredNotebookVolume');

const buildNotebookVolumeRouter = ({
  authenticateToken,
  SharedNotebook = null,
  SharedNotebookVolume = null,
  User = null
}) => {
  const router = express.Router();
  const humanOnly = (req, res, next) => {
    if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
      return res.status(403).json({ error: 'Only the human owner can do this.' });
    }
    return next();
  };
  const noStore = (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
  };

  const ownerNameOf = async (userId) => {
    if (!User?.findById) return '';
    try {
      const query = User.findById(userId).select('name displayName email');
      const owner = typeof query.lean === 'function' ? await query.lean() : await query;
      return String(
        owner?.displayName
        || owner?.name
        || String(owner?.email || '').split('@')[0]
        || ''
      ).trim();
    } catch (_error) {
      return '';
    }
  };

  const volumePayload = async (userId, volume, draft = {}) => {
    const catalog = await loadPublishedCatalog(SharedNotebook, userId);
    const ownerDisplayName = volume?.ownerDisplayName || await ownerNameOf(userId);
    const selection = draft.notebookIds || volume?.notebookIds || [];
    return volumeShareState(volume, {
      catalog,
      selection,
      title: draft.title != null ? draft.title : (volume?.snapshot?.title || ''),
      introduction: draft.introduction != null
        ? draft.introduction
        : (volume?.snapshot?.introduction || ''),
      ownerDisplayName
    });
  };

  const draftFromBody = (body = {}) => {
    const draft = {};
    const ids = Array.isArray(body?.notebookIds)
      ? body.notebookIds
      : String(body?.notebookIds || '').split(',');
    const notebookIds = ids
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (notebookIds.length) draft.notebookIds = notebookIds;
    if (Object.prototype.hasOwnProperty.call(body || {}, 'title')) draft.title = body.title;
    if (Object.prototype.hasOwnProperty.call(body || {}, 'introduction')) {
      draft.introduction = body.introduction;
    }
    return draft;
  };

  const freezeFromBody = async (userId, body, existing = null) => {
    const catalog = await loadPublishedCatalog(SharedNotebook, userId);
    const ownerDisplayName = existing?.ownerDisplayName || await ownerNameOf(userId);
    const selected = selectPieces(catalog, body?.notebookIds);
    const preview = composeVolumeSnapshot({
      title: volumeTitle(body?.title),
      introduction: volumeIntroduction(body?.introduction),
      ownerDisplayName,
      pieces: selected,
      publishedAt: existing?.publishedAt
    });
    const currentHash = hashPublicVolume(preview);
    if (!canPublishVolume(preview)) {
      const error = new Error(
        selected.length < 2
          ? 'Share at least two notes first.'
          : 'Nothing to share yet.'
      );
      error.status = 409;
      error.field = 'preview';
      throw error;
    }
    const previewHash = String(body?.previewHash || '').trim();
    if (previewHash && previewHash !== currentHash) {
      const error = new Error(PREVIEW_STALE);
      error.status = 409;
      error.field = 'previewHash';
      throw error;
    }
    return { selected, preview, currentHash, ownerDisplayName };
  };

  /* Published state only. Workshop title/introduction stay off this URL so
     access logs cannot retain unpublished drafts. Compose through POST /preview. */
  router.get('/api/volumes', authenticateToken, async (req, res) => {
    if (!SharedNotebookVolume) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const found = await SharedNotebookVolume.findOne({ userId: req.user.id }).lean();
      noStore(res);
      return res.status(200).json(await volumePayload(req.user.id, found));
    } catch (error) {
      console.error('❌ Error reading notebook volume:', error);
      return res.status(500).json({ error: 'Failed to read that volume.' });
    }
  });

  router.post('/api/volumes/preview', authenticateToken, async (req, res) => {
    if (!SharedNotebookVolume) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const found = await SharedNotebookVolume.findOne({ userId: req.user.id }).lean();
      noStore(res);
      return res.status(200).json(await volumePayload(req.user.id, found, draftFromBody(req.body)));
    } catch (error) {
      console.error('❌ Error previewing notebook volume:', error);
      return res.status(500).json({ error: 'Failed to preview that volume.' });
    }
  });

  router.post('/api/volumes', authenticateToken, humanOnly, async (req, res) => {
    if (!SharedNotebookVolume) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const existing = await SharedNotebookVolume.findOne({ userId: req.user.id }).lean();
      if (existing) {
        return res.status(200).json(await volumePayload(req.user.id, existing));
      }
      const frozen = await freezeFromBody(req.user.id, req.body);
      const now = new Date();
      const snapshot = composeVolumeSnapshot({
        title: frozen.preview.title,
        introduction: frozen.preview.introduction,
        ownerDisplayName: frozen.ownerDisplayName,
        pieces: frozen.selected,
        publishedAt: now
      });
      try {
        const created = await SharedNotebookVolume.create({
          userId: req.user.id,
          slug: shareSlug(),
          ownerDisplayName: frozen.ownerDisplayName,
          notebookIds: frozen.selected.map((piece) => piece.notebookId),
          snapshot,
          contentHash: hashPublicVolume(snapshot),
          publishedAt: now
        });
        return res.status(201).json(await volumePayload(
          req.user.id,
          created.toObject ? created.toObject() : created
        ));
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const raced = await SharedNotebookVolume.findOne({ userId: req.user.id }).lean();
        if (!raced) throw error;
        return res.status(200).json(await volumePayload(req.user.id, raced));
      }
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, field: error.field });
      }
      console.error('❌ Error sharing notebook volume:', error);
      return res.status(500).json({ error: 'Failed to share that volume.' });
    }
  });

  router.put('/api/volumes', authenticateToken, humanOnly, async (req, res) => {
    if (!SharedNotebookVolume) return res.status(503).json({ error: 'Sharing is not available.' });
    try {
      const existing = await SharedNotebookVolume.findOne({ userId: req.user.id }).lean();
      if (!existing) return res.status(404).json({ error: 'This volume is not shared.' });
      const previewHash = String(req.body?.previewHash || '').trim();
      if (!previewHash) {
        return res.status(409).json({ error: PREVIEW_STALE, field: 'previewHash' });
      }
      const frozen = await freezeFromBody(req.user.id, req.body, existing);
      const now = new Date();
      const firstPublished = existing.publishedAt || existing.snapshot?.publishedAt || now;
      const snapshot = composeVolumeSnapshot({
        title: frozen.preview.title,
        introduction: frozen.preview.introduction,
        ownerDisplayName: frozen.ownerDisplayName,
        pieces: frozen.selected,
        publishedAt: firstPublished,
        extra: { revisedAt: now, correction: req.body?.correction }
      });
      const updated = await SharedNotebookVolume.findOneAndUpdate(
        { userId: req.user.id },
        {
          $set: {
            snapshot,
            contentHash: hashPublicVolume(snapshot),
            publishedAt: firstPublished,
            ownerDisplayName: frozen.ownerDisplayName,
            notebookIds: frozen.selected.map((piece) => piece.notebookId)
          }
        },
        { new: true }
      );
      const row = updated && typeof updated.toObject === 'function' ? updated.toObject() : updated;
      return res.status(200).json(await volumePayload(req.user.id, row));
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message, field: error.field });
      }
      console.error('❌ Error updating notebook volume:', error);
      return res.status(500).json({ error: 'Failed to update that volume.' });
    }
  });

  router.delete('/api/volumes', authenticateToken, humanOnly, async (req, res) => {
    if (!SharedNotebookVolume) return res.status(200).json({ revoked: true });
    try {
      await SharedNotebookVolume.deleteOne({ userId: req.user.id });
      noStore(res);
      return res.status(200).json({ revoked: true });
    } catch (error) {
      console.error('❌ Error revoking notebook volume:', error);
      return res.status(500).json({ error: 'Failed to revoke that volume.' });
    }
  });

  router.get('/api/public/volumes/:slug', async (req, res) => {
    noStore(res);
    if (!SharedNotebookVolume) return res.status(404).json({ error: 'This volume is not published.' });
    try {
      const share = await SharedNotebookVolume.findOne({ slug: String(req.params.slug || '').trim() }).lean();
      if (!share?.snapshot) return res.status(404).json({ error: 'This volume is not published.' });
      return res.status(200).json(share.snapshot);
    } catch (error) {
      console.error('❌ Error opening shared volume:', error);
      return res.status(500).json({ error: 'Failed to open that volume.' });
    }
  });

  return router;
};

module.exports = { buildNotebookVolumeRouter };
