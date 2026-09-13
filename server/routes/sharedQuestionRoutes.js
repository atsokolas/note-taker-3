const express = require('express');
const {
  BRIEF_NEEDS_READING,
  CONTRIBUTION_LIMIT,
  NOT_PUBLISHED,
  PREVIEW_STALE,
  asRow,
  claimContributionSlot,
  contributionBy,
  contributionConflict,
  contributionHeld,
  contributionRemainder,
  contributionText,
  freezeThinkSnapshot,
  hashPublicQuestion,
  isDuplicateKey,
  liveQuestionPreview,
  loadQuestionContributions,
  missingSnapshot,
  placedContributions,
  projectPublicQuestion,
  publicQuestionPage,
  readLean,
  releaseContributionSlot,
  shareSlug,
  thinkShareState
} = require('../services/authoredThinkShare');

const passthroughAuth = (_req, _res, next) => next();

const buildSharedQuestionRouter = ({
  authenticateToken,
  optionalAuthenticateToken = passthroughAuth,
  SharedQuestion,
  QuestionContribution,
  Question,
  User
}) => {
  const router = express.Router();
  const isAgentRequest = (req) => Boolean(
    req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent
  );
  const humanOnly = (req, res, next) => {
    if (isAgentRequest(req)) {
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

  const readingsFor = async (slug) => loadQuestionContributions(
    QuestionContribution,
    { slug: String(slug || '').trim() }
  );

  const payload = async (share, extras) => thinkShareState(share, {
    ...extras,
    kind: 'question',
    contributions: share?.slug ? await readingsFor(share.slug) : []
  });

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
        return res.status(200).json(await payload(frozen, { preview, currentHash }));
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
          publishedAt: now,
          contributionCount: 0
        });
        return res.status(201).json(await payload(asRow(created), { preview, currentHash }));
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const raced = asRow(await readLean(SharedQuestion.findOne({
          userId: req.user.id,
          questionId: question._id
        })));
        if (!raced) throw error;
        return res.status(200).json(await payload(raced, { preview, currentHash }));
      }
    } catch (error) {
      console.error('❌ Error minting shared question:', error);
      return res.status(500).json({ error: 'Failed to share question.' });
    }
  });

  router.delete('/api/questions/:id/share', authenticateToken, humanOnly, async (req, res) => {
    try {
      const questionId = String(req.params.id || '').trim();
      if (!questionId) {
        return res.status(404).json({ error: 'No active share for this question.' });
      }
      const result = await SharedQuestion.findOneAndDelete({
        userId: req.user.id,
        questionId
      });
      if (!result) {
        return res.status(404).json({ error: 'No active share for this question.' });
      }
      noStore(res);
      return res.status(200).json({ revoked: true, questionId: String(result.questionId || questionId) });
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
      return res.status(200).json(await payload(share, { preview, currentHash }));
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
      return res.status(200).json(await payload(asRow(updated), { preview, currentHash }));
    } catch (error) {
      console.error('❌ Error updating shared question:', error);
      return res.status(500).json({ error: 'Failed to update that share.' });
    }
  });

  /* The owner says how they take a reading. The reading and remainder stay.
     Empty clears. It never enters the snapshot. Agents cannot do this. */
  router.patch(
    '/api/questions/:id/share/contributions/:contributionId',
    authenticateToken,
    humanOnly,
    async (req, res) => {
      noStore(res);
      if (!QuestionContribution) {
        return res.status(404).json({ error: 'That reading is not on this share.' });
      }
      try {
        const question = await findOwnedQuestion(req.user.id, req.params.id);
        if (!question) {
          return res.status(404).json({ error: 'Question not found.' });
        }
        const share = asRow(await readLean(SharedQuestion.findOne({
          userId: req.user.id,
          questionId: question._id
        })));
        if (!share?.snapshot) {
          return res.status(404).json({ error: 'This question is not shared.' });
        }
        const contributionId = String(req.params.contributionId || '').trim();
        if (!contributionId) {
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        const existing = asRow(await readLean(QuestionContribution.findOne({
          _id: contributionId,
          slug: share.slug
        })));
        if (!existing) {
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        const conflict = contributionConflict(existing, {
          expectPlaced: true,
          expectedUpdatedAt: req.body?.updatedAt
        });
        if (conflict) {
          return res.status(409).json({ error: conflict.error, field: conflict.field });
        }
        const interpretation = contributionRemainder(req.body?.interpretation);
        const updated = await QuestionContribution.findOneAndUpdate(
          {
            _id: contributionId,
            slug: share.slug,
            held: { $ne: true },
            withdrawnAt: { $exists: false }
          },
          { $set: { interpretation, updatedAt: new Date() } },
          { new: true }
        );
        if (!updated) {
          const raced = asRow(await readLean(QuestionContribution.findOne({
            _id: contributionId,
            slug: share.slug
          })));
          const racedConflict = contributionConflict(raced, {
            expectPlaced: true,
            expectedUpdatedAt: req.body?.updatedAt
          });
          if (racedConflict) {
            return res.status(409).json({ error: racedConflict.error, field: racedConflict.field });
          }
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        const { preview, currentHash } = await liveQuestionPreview({
          User,
          question,
          userId: req.user.id
        });
        return res.status(200).json(await payload(share, { preview, currentHash }));
      } catch (error) {
        console.error('❌ Error interpreting question contribution:', error);
        return res.status(500).json({ error: 'Failed to save how you take that reading.' });
      }
    }
  );

  /* The owner may close the shared question with what holds, what they
     still hold, and what could move this. Contributor remainders stay on
     their readings. Empty clears. It never enters the snapshot. */
  router.patch(
    '/api/questions/:id/share/brief',
    authenticateToken,
    humanOnly,
    async (req, res) => {
      noStore(res);
      try {
        const question = await findOwnedQuestion(req.user.id, req.params.id);
        if (!question) {
          return res.status(404).json({ error: 'Question not found.' });
        }
        const share = asRow(await readLean(SharedQuestion.findOne({
          userId: req.user.id,
          questionId: question._id
        })));
        if (!share?.snapshot) {
          return res.status(404).json({ error: 'This question is not shared.' });
        }
        const contributions = await readingsFor(share.slug);
        if (!placedContributions(contributions).length) {
          return res.status(409).json({
            error: BRIEF_NEEDS_READING,
            field: 'brief'
          });
        }
        const brief = {
          agreement: contributionRemainder(req.body?.agreement),
          remainder: contributionRemainder(req.body?.remainder),
          observation: contributionRemainder(req.body?.observation)
        };
        const updated = await SharedQuestion.findOneAndUpdate(
          { _id: share._id, userId: req.user.id },
          { $set: { brief } },
          { new: true }
        );
        if (!updated) {
          return res.status(404).json({ error: 'This question is not shared.' });
        }
        const { preview, currentHash } = await liveQuestionPreview({
          User,
          question,
          userId: req.user.id
        });
        return res.status(200).json(await payload(asRow(updated), { preview, currentHash }));
      } catch (error) {
        console.error('❌ Error saving question share brief:', error);
        return res.status(500).json({ error: 'Failed to save that brief.' });
      }
    }
  );

  /* The owner places a held reading beside the published question.
     Until then it is not on the public page. Agents cannot do this. */
  router.post(
    '/api/questions/:id/share/contributions/:contributionId/place',
    authenticateToken,
    humanOnly,
    async (req, res) => {
      noStore(res);
      if (!QuestionContribution) {
        return res.status(404).json({ error: 'That reading is not on this share.' });
      }
      try {
        const question = await findOwnedQuestion(req.user.id, req.params.id);
        if (!question) {
          return res.status(404).json({ error: 'Question not found.' });
        }
        const share = asRow(await readLean(SharedQuestion.findOne({
          userId: req.user.id,
          questionId: question._id
        })));
        if (!share?.snapshot) {
          return res.status(404).json({ error: 'This question is not shared.' });
        }
        const contributionId = String(req.params.contributionId || '').trim();
        if (!contributionId) {
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        const existing = asRow(await readLean(QuestionContribution.findOne({
          _id: contributionId,
          slug: share.slug
        })));
        if (!existing) {
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        const conflict = contributionConflict(existing);
        if (conflict) {
          return res.status(409).json({ error: conflict.error, field: conflict.field });
        }
        if (contributionHeld(existing)) {
          const placed = await QuestionContribution.findOneAndUpdate(
            {
              _id: contributionId,
              slug: share.slug,
              held: true,
              withdrawnAt: { $exists: false }
            },
            { $set: { held: false, updatedAt: new Date() } },
            { new: true }
          );
          if (!placed) {
            const raced = asRow(await readLean(QuestionContribution.findOne({
              _id: contributionId,
              slug: share.slug
            })));
            const racedConflict = contributionConflict(raced);
            if (racedConflict) {
              return res.status(409).json({ error: racedConflict.error, field: racedConflict.field });
            }
            return res.status(404).json({ error: 'That reading is not on this share.' });
          }
        }
        const { preview, currentHash } = await liveQuestionPreview({
          User,
          question,
          userId: req.user.id
        });
        return res.status(200).json(await payload(share, { preview, currentHash }));
      } catch (error) {
        console.error('❌ Error placing question contribution:', error);
        return res.status(500).json({ error: 'Failed to place that reading.' });
      }
    }
  );

  router.get('/api/public/questions/:slug', optionalAuthenticateToken, async (req, res) => {
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
      const contributions = await readingsFor(share.slug);
      return res.status(200).json(publicQuestionPage(share, contributions, req.user?.id));
    } catch (error) {
      console.error('❌ Error fetching public question:', error);
      return res.status(500).json({ error: 'Failed to fetch shared question.' });
    }
  });

  /* A second person offers selected writing. It is held until the owner
     places it beside the frozen question. Optional remainder included,
     never merged into the snapshot, never a Library. Revoke closes the door. */
  router.post('/api/public/questions/:slug/contributions', optionalAuthenticateToken, async (req, res) => {
    noStore(res);
    if (!QuestionContribution) {
      return res.status(404).json({ error: NOT_PUBLISHED.question });
    }
    try {
      const share = asRow(await readLean(SharedQuestion.findOne({
        slug: String(req.params.slug || '').trim()
      })));
      if (!share?.snapshot) {
        return res.status(404).json({ error: NOT_PUBLISHED.question });
      }

      const by = contributionBy(req.body?.by);
      if (!by) {
        return res.status(400).json({ error: 'Say who this is from.', field: 'by' });
      }
      const text = contributionText(req.body?.text);
      if (!text) {
        return res.status(400).json({ error: 'Write a reading first.', field: 'text' });
      }
      const remainder = contributionRemainder(req.body?.remainder);

      const claimed = await claimContributionSlot(SharedQuestion, share.slug);
      if (!claimed) {
        const still = asRow(await readLean(SharedQuestion.findOne({ slug: share.slug })));
        if (!still?.snapshot) return res.status(404).json({ error: NOT_PUBLISHED.question });
        return res.status(409).json({
          error: 'This question cannot take another reading just now.',
          field: 'contributions',
          limit: CONTRIBUTION_LIMIT
        });
      }

      try {
        const contributorUserId = String(req.user?.id || '').trim();
        await QuestionContribution.create({
          userId: share.userId,
          questionId: share.questionId,
          slug: share.slug,
          by,
          text,
          remainder,
          held: true,
          ...(contributorUserId ? { contributorUserId } : {})
        });
      } catch (error) {
        await releaseContributionSlot(SharedQuestion, share.slug);
        throw error;
      }
      return res.status(201).json({ sent: true });
    } catch (error) {
      console.error('❌ Error receiving question contribution:', error);
      return res.status(500).json({ error: 'Failed to offer that reading.' });
    }
  });

  /* The person who offered a reading may take it back while the door
     stays open. The public page goes silent. The slot opens. Copies
     already taken stay with their holders. Agents cannot do this. */
  router.delete(
    '/api/public/questions/:slug/contributions/:contributionId',
    optionalAuthenticateToken,
    (req, res, next) => {
      if (isAgentRequest(req)) {
        return res.status(403).json({ error: 'Only the person who offered this can take it back.' });
      }
      return next();
    },
    async (req, res) => {
      noStore(res);
      if (!QuestionContribution) {
        return res.status(404).json({ error: NOT_PUBLISHED.question });
      }
      try {
        const slug = String(req.params.slug || '').trim();
        const contributionId = String(req.params.contributionId || '').trim();
        const contributorUserId = String(req.user?.id || '').trim();
        if (!slug || !contributionId) {
          return res.status(404).json({ error: NOT_PUBLISHED.question });
        }
        const share = asRow(await readLean(SharedQuestion.findOne({ slug })));
        if (!share?.snapshot) {
          return res.status(404).json({ error: NOT_PUBLISHED.question });
        }
        if (!contributorUserId) {
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        const withdrawn = await QuestionContribution.findOneAndUpdate(
          {
            _id: contributionId,
            slug,
            contributorUserId,
            withdrawnAt: { $exists: false }
          },
          { $set: { withdrawnAt: new Date(), updatedAt: new Date() } },
          { new: true }
        );
        if (!withdrawn) {
          return res.status(404).json({ error: 'That reading is not on this share.' });
        }
        await releaseContributionSlot(SharedQuestion, slug);
        return res.status(200).json({ withdrawn: true });
      } catch (error) {
        console.error('❌ Error withdrawing question contribution:', error);
        return res.status(500).json({ error: 'Failed to take that reading back.' });
      }
    }
  );

  return router;
};

module.exports = { buildSharedQuestionRouter };
