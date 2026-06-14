const express = require('express');
const crypto = require('crypto');

/**
 * Public concept share routes.
 *
 * Three endpoints:
 *  - POST   /api/concepts/:name/share  (auth)  → mint or return existing slug
 *  - DELETE /api/concepts/:name/share  (auth)  → revoke (delete the row)
 *  - GET    /api/public/concepts/:slug (open)  → read-only snapshot
 *
 * Concepts in this app live virtually (assembled from highlights tagged with
 * a name + ConceptNote + workbench state at read time). The share row is just
 * a slug → (userId, conceptName) pointer; the public read assembles the
 * snapshot from the same loaders the owner sees, then strips PII.
 */

const SLUG_BYTES = 9; // 12-char base64url is plenty of entropy and short enough to read aloud.

const generateSlug = () => crypto.randomBytes(SLUG_BYTES)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const buildSharedConceptRouter = ({
  authenticateToken,
  SharedConcept,
  TagMeta,
  ConceptNote,
  User,
  escapeRegExp,
  getConceptRelated
}) => {
  const router = express.Router();

  const findConceptByName = async (userId, rawName) => {
    const safeName = String(rawName || '').trim();
    if (!safeName) return null;
    return TagMeta.findOne({
      userId,
      name: new RegExp(`^${escapeRegExp(safeName)}$`, 'i')
    });
  };

  // POST /api/concepts/:name/share — mint or return existing slug.
  router.post('/api/concepts/:name/share', authenticateToken, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      if (!conceptName) {
        return res.status(400).json({ error: 'Concept name is required.' });
      }
      const concept = await findConceptByName(req.user.id, conceptName);
      if (!concept) {
        return res.status(404).json({ error: 'Concept not found.' });
      }

      // Idempotent: returning the existing share keeps the link stable across
      // accidental double-clicks. Revoke + re-mint is the way to rotate.
      const existing = await SharedConcept.findOne({
        userId: req.user.id,
        conceptName: concept.name
      });
      if (existing) {
        return res.status(200).json({
          slug: existing.slug,
          conceptName: existing.conceptName,
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

      // Retry once on the unlikely slug collision.
      let slug = generateSlug();
      try {
        const created = await SharedConcept.create({
          userId: req.user.id,
          conceptName: concept.name,
          slug,
          ownerDisplayName
        });
        return res.status(201).json({
          slug: created.slug,
          conceptName: created.conceptName,
          createdAt: created.createdAt
        });
      } catch (err) {
        if (err && err.code === 11000) {
          slug = generateSlug();
          const created = await SharedConcept.create({
            userId: req.user.id,
            conceptName: concept.name,
            slug,
            ownerDisplayName
          });
          return res.status(201).json({
            slug: created.slug,
            conceptName: created.conceptName,
            createdAt: created.createdAt
          });
        }
        throw err;
      }
    } catch (error) {
      console.error('❌ Error minting shared concept:', error);
      return res.status(500).json({ error: 'Failed to share concept.' });
    }
  });

  // DELETE /api/concepts/:name/share — revoke the share.
  router.delete('/api/concepts/:name/share', authenticateToken, async (req, res) => {
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
      return res.status(200).json({ revoked: true, conceptName });
    } catch (error) {
      console.error('❌ Error revoking shared concept:', error);
      return res.status(500).json({ error: 'Failed to revoke share.' });
    }
  });

  // GET /api/concepts/:name/share — read the current share state for the owner.
  router.get('/api/concepts/:name/share', authenticateToken, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      if (!conceptName) {
        return res.status(400).json({ error: 'Concept name is required.' });
      }
      const share = await SharedConcept.findOne({
        userId: req.user.id,
        conceptName: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
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
      console.error('❌ Error reading shared concept state:', error);
      return res.status(500).json({ error: 'Failed to read share state.' });
    }
  });

  // GET /api/public/concepts/:slug — public read-only snapshot. No auth.
  router.get('/api/public/concepts/:slug', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').trim();
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required.' });
      }
      const share = await SharedConcept.findOne({ slug });
      if (!share) {
        return res.status(404).json({ error: 'Shared concept not found.' });
      }
      const concept = await TagMeta.findOne({
        userId: share.userId,
        name: new RegExp(`^${escapeRegExp(share.conceptName)}$`, 'i')
      });
      if (!concept) {
        // Owner deleted the underlying concept after sharing; treat as 404
        // rather than leaking a stale pointer.
        return res.status(404).json({ error: 'Shared concept no longer exists.' });
      }

      // Snapshot the workbench state at read time. The hypothesis HTML is
      // user-authored markup that we sanitize on write; safe to expose.
      const workbench = (concept.ideaWorkbench && typeof concept.ideaWorkbench === 'object')
        ? concept.ideaWorkbench
        : {};
      const cards = Array.isArray(workbench.cards) ? workbench.cards : [];
      const supports = cards.filter(card => card?.zone === 'supports');
      const contradictions = cards.filter(card => card?.zone === 'contradictions');
      const questions = cards.filter(card => card?.zone === 'questions');

      // Strip user-private fields from cards (no source paths to private
      // articles, no agent annotations). Public cards keep the authored
      // argument, not the private provenance trail.
      const sanitizeCard = (card) => ({
        id: String(card?.id || ''),
        type: String(card?.type || ''),
        title: String(card?.title || ''),
        content: String(card?.content || ''),
        whyItMatters: String(card?.whyItMatters || ''),
        strength: String(card?.strength || ''),
        confidence: String(card?.confidence || '')
      });

      return res.status(200).json({
        slug: share.slug,
        sharedAt: share.createdAt,
        ownerDisplayName: share.ownerDisplayName || '',
        concept: {
          name: concept.name,
          description: String(concept.description || ''),
          hypothesisHtml: String(workbench?.hypothesis?.html || ''),
          framing: String(workbench?.header?.prompt || ''),
          supports: supports.map(sanitizeCard),
          contradictions: contradictions.map(sanitizeCard),
          questions: questions.map(sanitizeCard)
        }
      });
    } catch (error) {
      console.error('❌ Error fetching public concept:', error);
      return res.status(500).json({ error: 'Failed to fetch shared concept.' });
    }
  });

  return router;
};

module.exports = { buildSharedConceptRouter };
