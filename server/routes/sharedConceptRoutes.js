const express = require('express');
const {
  NOT_PUBLISHED,
  PREVIEW_STALE,
  asRow,
  freezeThinkSnapshot,
  hashPublicConcept,
  isDuplicateKey,
  liveConceptPreview,
  missingSnapshot,
  projectPublicConcept,
  readLean,
  shareSlug,
  thinkShareState
} = require('../services/authoredThinkShare');

/**
 * Public concept share routes.
 *
 * Same grammar as a shared notebook: freeze at POST, explicit PUT under the
 * same slug, public GET returns the stored snapshot. ConceptNote and private
 * source trails never enter the snapshot.
 */

const buildSharedConceptRouter = ({
  authenticateToken,
  SharedConcept,
  TagMeta,
  ConceptNote: _ConceptNote,
  User,
  escapeRegExp,
  getConceptRelated: _getConceptRelated
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

  const findConceptByName = async (userId, rawName) => {
    const safeName = String(rawName || '').trim();
    if (!safeName) return null;
    return TagMeta.findOne({
      userId,
      name: new RegExp(`^${escapeRegExp(safeName)}$`, 'i')
    });
  };

  const payload = (share, extras) => thinkShareState(share, { ...extras, kind: 'concept' });

  const freezeLegacy = async (share, preview, currentHash) => {
    if (!missingSnapshot(share) || !preview) return share;
    const now = share.publishedAt || share.createdAt || new Date();
    const updated = await SharedConcept.findOneAndUpdate(
      {
        _id: share._id,
        $or: [
          { snapshot: null },
          { snapshot: { $exists: false } },
          { contentHash: '' },
          { contentHash: null }
        ]
      },
      {
        $set: {
          snapshot: freezeThinkSnapshot(preview, now),
          contentHash: currentHash,
          publishedAt: now
        }
      },
      { new: true }
    );
    if (updated) return asRow(updated);
    const raced = asRow(await readLean(SharedConcept.findOne({ _id: share._id })));
    return raced || share;
  };

  router.post('/api/concepts/:name/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      if (!conceptName) {
        return res.status(400).json({ error: 'Concept name is required.' });
      }
      const concept = await findConceptByName(req.user.id, conceptName);
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      const { preview, currentHash, ownerDisplayName, publishable } = await liveConceptPreview({
        User,
        concept,
        userId: req.user.id
      });
      if (!publishable) {
        return res.status(409).json({ error: 'Nothing to share yet.', field: 'preview' });
      }
      const previewHash = String(req.body?.previewHash || '').trim();
      if (previewHash && previewHash !== currentHash) {
        return res.status(409).json({ error: PREVIEW_STALE.concept, field: 'previewHash' });
      }

      const existing = asRow(await readLean(SharedConcept.findOne({
        userId: req.user.id,
        conceptName: concept.name
      })));
      if (existing) {
        const frozen = await freezeLegacy(existing, preview, existing.contentHash || currentHash);
        return res.status(200).json(payload(frozen, { preview, currentHash }));
      }

      const now = new Date();
      try {
        const created = await SharedConcept.create({
          userId: req.user.id,
          conceptName: concept.name,
          slug: shareSlug(),
          ownerDisplayName,
          snapshot: freezeThinkSnapshot(preview, now),
          contentHash: currentHash,
          publishedAt: now
        });
        return res.status(201).json(payload(asRow(created), { preview, currentHash }));
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const raced = asRow(await readLean(SharedConcept.findOne({
          userId: req.user.id,
          conceptName: concept.name
        })));
        if (!raced) throw error;
        return res.status(200).json(payload(raced, { preview, currentHash }));
      }
    } catch (error) {
      console.error('❌ Error minting shared concept:', error);
      return res.status(500).json({ error: 'Failed to share concept.' });
    }
  });

  router.delete('/api/concepts/:name/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      if (!conceptName) {
        return res.status(400).json({ error: 'Concept name is required.' });
      }
      const result = await SharedConcept.findOneAndDelete({
        userId: req.user.id,
        conceptName: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
      });
      if (!result) {
        return res.status(404).json({ error: 'No active share for this concept.' });
      }
      noStore(res);
      return res.status(200).json({ revoked: true, conceptName });
    } catch (error) {
      console.error('❌ Error revoking shared concept:', error);
      return res.status(500).json({ error: 'Failed to revoke share.' });
    }
  });

  router.get('/api/concepts/:name/share', authenticateToken, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      if (!conceptName) {
        return res.status(400).json({ error: 'Concept name is required.' });
      }
      const concept = await findConceptByName(req.user.id, conceptName);
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      const { preview, currentHash } = await liveConceptPreview({
        User,
        concept,
        userId: req.user.id
      });
      let share = asRow(await readLean(SharedConcept.findOne({
        userId: req.user.id,
        conceptName: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
      })));
      if (share && missingSnapshot(share)) {
        share = await freezeLegacy(share, preview, currentHash);
      }
      noStore(res);
      return res.status(200).json(payload(share, { preview, currentHash }));
    } catch (error) {
      console.error('❌ Error reading shared concept state:', error);
      return res.status(500).json({ error: 'Failed to read share state.' });
    }
  });

  router.put('/api/concepts/:name/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      if (!conceptName) {
        return res.status(400).json({ error: 'Concept name is required.' });
      }
      const concept = await findConceptByName(req.user.id, conceptName);
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      const { preview, currentHash, ownerDisplayName, publishable } = await liveConceptPreview({
        User,
        concept,
        userId: req.user.id
      });
      if (!publishable) {
        return res.status(409).json({ error: 'Nothing to share yet.', field: 'preview' });
      }
      const previewHash = String(req.body?.previewHash || '').trim();
      if (!previewHash || previewHash !== currentHash) {
        return res.status(409).json({ error: PREVIEW_STALE.concept, field: 'previewHash' });
      }
      const existing = asRow(await readLean(SharedConcept.findOne({
        userId: req.user.id,
        conceptName: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
      })));
      if (!existing) return res.status(404).json({ error: 'This concept is not shared.' });

      const now = new Date();
      const firstPublished = existing.publishedAt || existing.snapshot?.publishedAt || now;
      const updated = await SharedConcept.findOneAndUpdate(
        { userId: req.user.id, conceptName: existing.conceptName },
        {
          $set: {
            snapshot: freezeThinkSnapshot(preview, firstPublished, {
              revisedAt: now,
              correction: req.body?.correction
            }),
            contentHash: currentHash,
            publishedAt: firstPublished,
            ownerDisplayName: ownerDisplayName || existing.ownerDisplayName || ''
          }
        },
        { new: true }
      );
      return res.status(200).json(payload(asRow(updated), { preview, currentHash }));
    } catch (error) {
      console.error('❌ Error updating shared concept:', error);
      return res.status(500).json({ error: 'Failed to update that share.' });
    }
  });

  router.get('/api/public/concepts/:slug', async (req, res) => {
    noStore(res);
    try {
      const slug = String(req.params.slug || '').trim();
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required.' });
      }
      let share = asRow(await readLean(SharedConcept.findOne({ slug })));
      if (!share) {
        return res.status(404).json({ error: NOT_PUBLISHED.concept });
      }
      if (missingSnapshot(share)) {
        const concept = await readLean(TagMeta.findOne({
          userId: share.userId,
          name: new RegExp(`^${escapeRegExp(share.conceptName)}$`, 'i')
        }));
        if (!concept) {
          return res.status(404).json({ error: NOT_PUBLISHED.concept });
        }
        const preview = projectPublicConcept(concept, share.ownerDisplayName || '');
        share = await freezeLegacy(share, preview, hashPublicConcept(preview));
      }
      if (!share?.snapshot) {
        return res.status(404).json({ error: NOT_PUBLISHED.concept });
      }
      return res.status(200).json(share.snapshot);
    } catch (error) {
      console.error('❌ Error fetching public concept:', error);
      return res.status(500).json({ error: 'Failed to fetch shared concept.' });
    }
  });

  return router;
};

module.exports = { buildSharedConceptRouter };
