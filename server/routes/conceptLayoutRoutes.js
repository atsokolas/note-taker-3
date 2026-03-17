const express = require('express');

const buildConceptLayoutRouter = ({
  authenticateToken,
  resolveConceptByParam,
  normalizeConceptLayout,
  createConceptLayoutCard,
  normalizeConceptLayoutCardRole
}) => {
  const router = express.Router();

  router.get('/api/concepts/:id/layout', authenticateToken, async (req, res) => {
    try {
      const concept = await resolveConceptByParam(req.user.id, req.params.id, { createIfMissing: true });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const hadLayout = concept?.conceptLayout && typeof concept.conceptLayout === 'object';
      const layout = normalizeConceptLayout(concept?.conceptLayout || {});
      if (!hadLayout) {
        concept.conceptLayout = layout;
        concept.markModified('conceptLayout');
        await concept.save();
      }

      res.status(200).json({
        conceptId: String(concept._id),
        conceptName: concept.name,
        layout
      });
    } catch (error) {
      console.error('❌ Error loading concept layout:', error);
      res.status(500).json({ error: 'Failed to load concept layout.' });
    }
  });

  router.put('/api/concepts/:id/layout', authenticateToken, async (req, res) => {
    try {
      const concept = await resolveConceptByParam(req.user.id, req.params.id, { createIfMissing: true });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const incomingLayout = req.body?.layout && typeof req.body.layout === 'object'
        ? req.body.layout
        : (req.body || {});
      const layout = normalizeConceptLayout(incomingLayout, { baseLayout: concept.conceptLayout });
      concept.conceptLayout = layout;
      concept.markModified('conceptLayout');
      await concept.save();

      res.status(200).json({
        conceptId: String(concept._id),
        conceptName: concept.name,
        layout
      });
    } catch (error) {
      console.error('❌ Error saving concept layout:', error);
      res.status(500).json({ error: 'Failed to save concept layout.' });
    }
  });

  router.post('/api/concepts/:id/layout/add-card', authenticateToken, async (req, res) => {
    try {
      const concept = await resolveConceptByParam(req.user.id, req.params.id, { createIfMissing: true });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const layout = normalizeConceptLayout(concept.conceptLayout || {});
      const sectionId = String(req.body?.sectionId || '').trim();
      const itemType = String(req.body?.itemType || '').trim();
      const itemId = String(req.body?.itemId || '').trim();
      if (!itemType || !itemId) {
        return res.status(400).json({ error: 'itemType and itemId are required.' });
      }

      const createdCard = await createConceptLayoutCard({
        userId: req.user.id,
        itemType,
        itemId,
        title: req.body?.title,
        snippet: req.body?.snippet,
        role: req.body?.role
      });
      if (!createdCard) {
        return res.status(404).json({ error: 'Could not resolve source item for card.' });
      }

      const duplicate = layout.cards.find(card => (
        card.itemType === createdCard.itemType && String(card.itemId) === String(createdCard.itemId)
      ));
      const card = duplicate || createdCard;
      if (duplicate && req.body?.role) {
        card.role = normalizeConceptLayoutCardRole(req.body.role, card.role || 'idea');
      }
      if (!duplicate) layout.cards.push(card);

      const targetSection = layout.sections.find(section => section.id === sectionId) || layout.sections[0];
      if (!targetSection) {
        return res.status(400).json({ error: 'No sections available for this concept layout.' });
      }

      layout.sections = layout.sections.map((section) => {
        const nextCardIds = section.cardIds.filter(cardId => cardId !== card.id);
        if (section.id === targetSection.id) {
          nextCardIds.push(card.id);
        }
        return { ...section, cardIds: nextCardIds };
      });
      const normalized = normalizeConceptLayout(layout);

      concept.conceptLayout = normalized;
      concept.markModified('conceptLayout');
      await concept.save();

      res.status(201).json({
        conceptId: String(concept._id),
        conceptName: concept.name,
        card,
        layout: normalized
      });
    } catch (error) {
      console.error('❌ Error adding concept layout card:', error);
      res.status(500).json({ error: 'Failed to add concept layout card.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptLayoutRouter
};
