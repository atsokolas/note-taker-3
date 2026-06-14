const express = require('express');
const crypto = require('crypto');

const SLUG_BYTES = 9;

const generateSlug = () => crypto.randomBytes(SLUG_BYTES)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const sanitizeParagraphBlocks = (blocks = []) => (
  (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.type === 'paragraph')
    .map((block) => ({
      id: String(block?.id || ''),
      type: 'paragraph',
      text: String(block?.text || '').trim()
    }))
    .filter((block) => block.text)
);

const buildSharedQuestionRouter = ({
  authenticateToken,
  SharedQuestion,
  Question,
  User
}) => {
  const router = express.Router();

  const findOwnedQuestion = async (userId, questionId) => {
    const safeId = String(questionId || '').trim();
    if (!safeId) return null;
    return Question.findOne({ _id: safeId, userId });
  };

  router.post('/api/questions/:id/share', authenticateToken, async (req, res) => {
    try {
      const question = await findOwnedQuestion(req.user.id, req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }

      const existing = await SharedQuestion.findOne({
        userId: req.user.id,
        questionId: question._id
      });
      if (existing) {
        return res.status(200).json({
          slug: existing.slug,
          questionId: String(existing.questionId),
          createdAt: existing.createdAt
        });
      }

      let owner = null;
      try {
        owner = await User.findById(req.user.id).select('email name displayName');
      } catch (_err) {
        owner = null;
      }
      const ownerDisplayName = String(
        owner?.displayName
        || owner?.name
        || (owner?.email || '').split('@')[0]
        || ''
      ).trim();

      let slug = generateSlug();
      try {
        const created = await SharedQuestion.create({
          userId: req.user.id,
          questionId: question._id,
          slug,
          ownerDisplayName
        });
        return res.status(201).json({
          slug: created.slug,
          questionId: String(created.questionId),
          createdAt: created.createdAt
        });
      } catch (err) {
        if (err && err.code === 11000) {
          slug = generateSlug();
          const created = await SharedQuestion.create({
            userId: req.user.id,
            questionId: question._id,
            slug,
            ownerDisplayName
          });
          return res.status(201).json({
            slug: created.slug,
            questionId: String(created.questionId),
            createdAt: created.createdAt
          });
        }
        throw err;
      }
    } catch (error) {
      console.error('❌ Error minting shared question:', error);
      return res.status(500).json({ error: 'Failed to share question.' });
    }
  });

  router.delete('/api/questions/:id/share', authenticateToken, async (req, res) => {
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
      const share = await SharedQuestion.findOne({
        userId: req.user.id,
        questionId: question._id
      });
      if (!share) {
        return res.status(200).json({ shared: false });
      }
      return res.status(200).json({
        shared: true,
        slug: share.slug,
        createdAt: share.createdAt
      });
    } catch (error) {
      console.error('❌ Error reading shared question state:', error);
      return res.status(500).json({ error: 'Failed to read share state.' });
    }
  });

  router.get('/api/public/questions/:slug', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').trim();
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required.' });
      }
      const share = await SharedQuestion.findOne({ slug });
      if (!share) {
        return res.status(404).json({ error: 'Shared question not found.' });
      }
      const question = await Question.findOne({
        _id: share.questionId,
        userId: share.userId
      }).select('text status conceptName linkedTagName blocks updatedAt');
      if (!question) {
        return res.status(404).json({ error: 'Shared question no longer exists.' });
      }

      const conceptName = String(question.conceptName || question.linkedTagName || '').trim();
      const paragraphs = sanitizeParagraphBlocks(question.blocks);

      return res.status(200).json({
        slug: share.slug,
        sharedAt: share.createdAt,
        ownerDisplayName: share.ownerDisplayName || '',
        question: {
          text: String(question.text || '').trim(),
          status: question.status === 'answered' ? 'answered' : 'open',
          conceptName,
          paragraphs,
          updatedAt: question.updatedAt
        }
      });
    } catch (error) {
      console.error('❌ Error fetching public question:', error);
      return res.status(500).json({ error: 'Failed to fetch shared question.' });
    }
  });

  return router;
};

module.exports = { buildSharedQuestionRouter };
