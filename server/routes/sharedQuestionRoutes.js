const express = require('express');
const {
  NOT_PUBLISHED,
  PREVIEW_STALE,
  asRow,
  freezeThinkSnapshot,
  hashPublicQuestion,
  isDuplicateKey,
  liveQuestionPreview,
  missingSnapshot,
  projectPublicQuestion,
  readLean,
  shareSlug,
  thinkShareState
} = require('../services/authoredThinkShare');

const buildSharedQuestionRouter = ({
  authenticateToken,
  SharedQuestion,
  Question,
  User
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

  const findOwnedQuestion = async (userId, questionId) => {
    const safeId = String(questionId || '').trim();
    if (!safeId) return null;
    return Question.findOne({ _id: safeId, userId });
  };

  const payload = (share, extras) => thinkShareState(share, { ...extras, kind: 'question' });

  const freezeLegacy = async (share, preview, currentHash) => {
    if (!missingSnapshot(share) || !preview) return share;
    const now = share.publishedAt || share.createdAt || new Date();
    const updated = await SharedQuestion.findOneAndUpdate(
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
    const raced = asRow(await readLean(SharedQuestion.findOne({ _id: share._id })));
    return raced || share;
  };

  router.post('/api/questions/:id/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const question = await findOwnedQuestion(req.user.id, req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const { preview, currentHash, ownerDisplayName, publishable } = await liveQuestionPreview({
        User,
        question,
        userId: req.user.id
      });
      if (!publishable) {
        return res.status(409).json({ error: 'Nothing to share yet.', field: 'preview' });
      }
      const previewHash = String(req.body?.previewHash || '').trim();
      if (previewHash && previewHash !== currentHash) {
        return res.status(409).json({ error: PREVIEW_STALE.question, field: 'previewHash' });
      }

      const existing = asRow(await readLean(SharedQuestion.findOne({
        userId: req.user.id,
        questionId: question._id
      })));
      if (existing) {
        const frozen = await freezeLegacy(existing, preview, existing.contentHash || currentHash);
        return res.status(200).json(payload(frozen, { preview, currentHash }));
      }

      const now = new Date();
      try {
        const created = await SharedQuestion.create({
          userId: req.user.id,
          questionId: question._id,
          slug: shareSlug(),
          ownerDisplayName,
          snapshot: freezeThinkSnapshot(preview, now),
          contentHash: currentHash,
          publishedAt: now
        });
        return res.status(201).json(payload(asRow(created), { preview, currentHash }));
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const raced = asRow(await readLean(SharedQuestion.findOne({
          userId: req.user.id,
          questionId: question._id
        })));
        if (!raced) throw error;
        return res.status(200).json(payload(raced, { preview, currentHash }));
      }
    } catch (error) {
      console.error('❌ Error minting shared question:', error);
      return res.status(500).json({ error: 'Failed to share question.' });
    }
  });

  router.delete('/api/questions/:id/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const question = await findOwnedQuestion(req.user.id, req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const result = await SharedQuestion.findOneAndDelete({
        userId: req.user.id,
        questionId: question._id
      });
      if (!result) {
        return res.status(404).json({ error: 'No active share for this question.' });
      }
      noStore(res);
      return res.status(200).json({ revoked: true, questionId: String(question._id) });
    } catch (error) {
      console.error('❌ Error revoking shared question:', error);
      return res.status(500).json({ error: 'Failed to revoke share.' });
    }
  });

  router.get('/api/questions/:id/share', authenticateToken, async (req, res) => {
    try {
      const question = await findOwnedQuestion(req.user.id, req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const { preview, currentHash } = await liveQuestionPreview({
        User,
        question,
        userId: req.user.id
      });
      let share = asRow(await readLean(SharedQuestion.findOne({
        userId: req.user.id,
        questionId: question._id
      })));
      if (share && missingSnapshot(share)) {
        share = await freezeLegacy(share, preview, currentHash);
      }
      noStore(res);
      return res.status(200).json(payload(share, { preview, currentHash }));
    } catch (error) {
      console.error('❌ Error reading shared question state:', error);
      return res.status(500).json({ error: 'Failed to read share state.' });
    }
  });

  router.put('/api/questions/:id/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const question = await findOwnedQuestion(req.user.id, req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const { preview, currentHash, ownerDisplayName, publishable } = await liveQuestionPreview({
        User,
        question,
        userId: req.user.id
      });
      if (!publishable) {
        return res.status(409).json({ error: 'Nothing to share yet.', field: 'preview' });
      }
      const previewHash = String(req.body?.previewHash || '').trim();
      if (!previewHash || previewHash !== currentHash) {
        return res.status(409).json({ error: PREVIEW_STALE.question, field: 'previewHash' });
      }
      const existing = asRow(await readLean(SharedQuestion.findOne({
        userId: req.user.id,
        questionId: question._id
      })));
      if (!existing) return res.status(404).json({ error: 'This question is not shared.' });

      const now = new Date();
      const firstPublished = existing.publishedAt || existing.snapshot?.publishedAt || now;
      const updated = await SharedQuestion.findOneAndUpdate(
        { userId: req.user.id, questionId: question._id },
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
      console.error('❌ Error updating shared question:', error);
      return res.status(500).json({ error: 'Failed to update that share.' });
    }
  });

  router.get('/api/public/questions/:slug', async (req, res) => {
    noStore(res);
    try {
      const slug = String(req.params.slug || '').trim();
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required.' });
      }
      let share = asRow(await readLean(SharedQuestion.findOne({ slug })));
      if (!share) {
        return res.status(404).json({ error: NOT_PUBLISHED.question });
      }
      if (missingSnapshot(share)) {
        const question = await readLean(Question.findOne({
          _id: share.questionId,
          userId: share.userId
        }));
        if (!question) {
          return res.status(404).json({ error: NOT_PUBLISHED.question });
        }
        const preview = projectPublicQuestion(question, share.ownerDisplayName || '');
        share = await freezeLegacy(share, preview, hashPublicQuestion(preview));
      }
      if (!share?.snapshot) {
        return res.status(404).json({ error: NOT_PUBLISHED.question });
      }
      return res.status(200).json(share.snapshot);
    } catch (error) {
      console.error('❌ Error fetching public question:', error);
      return res.status(500).json({ error: 'Failed to fetch shared question.' });
    }
  });

  return router;
};

module.exports = { buildSharedQuestionRouter };
