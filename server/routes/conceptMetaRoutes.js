const express = require('express');

const buildConceptMetaRouter = ({
  authenticateToken,
  getConcepts,
  getConceptMeta,
  updateConceptMeta,
  getConceptRelated,
  TagMeta,
  escapeRegExp,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();
  const findConceptDocument = async (userId, rawParam) => {
    const safeParam = String(rawParam || '').trim();
    if (!safeParam) return null;
    if (/^[a-f0-9]{24}$/i.test(safeParam)) {
      const byId = await TagMeta.findOne({ _id: safeParam, userId });
      if (byId) return byId;
    }
    return TagMeta.findOne({
      userId,
      name: new RegExp(`^${escapeRegExp(safeParam)}$`, 'i')
    });
  };

  const normalizeIdeaWorkbenchPayload = (value = {}) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      const error = new Error('Idea workbench payload must be an object.');
      error.status = 400;
      throw error;
    }

    const cards = (Array.isArray(value.cards) ? value.cards : []).map((card) => ({
      id: String(card?.id || '').trim(),
      sourceKey: String(card?.sourceKey || '').trim(),
      zone: String(card?.zone || 'workspace').trim(),
      type: String(card?.type || 'Note').trim(),
      title: String(card?.title || '').trim(),
      content: String(card?.content || '').trim(),
      source: String(card?.source || '').trim(),
      sourcePath: String(card?.sourcePath || '').trim(),
      whyItMatters: String(card?.whyItMatters || '').trim(),
      confidence: String(card?.confidence || '').trim(),
      strength: String(card?.strength || '').trim(),
      agentAnnotation: String(card?.agentAnnotation || '').trim(),
      relatedHypothesisLabel: String(card?.relatedHypothesisLabel || '').trim(),
      origin: String(card?.origin || '').trim(),
      tags: (Array.isArray(card?.tags) ? card.tags : []).map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 12),
      createdAt: String(card?.createdAt || '').trim()
    })).filter((card) => card.id && card.zone && card.type && (card.title || card.content));

    const versions = (Array.isArray(value?.hypothesis?.versions) ? value.hypothesis.versions : []).map((version) => ({
      id: String(version?.id || '').trim(),
      label: String(version?.label || '').trim(),
      maturity: String(version?.maturity || '').trim(),
      html: String(version?.html || '').trim(),
      summary: String(version?.summary || '').trim(),
      createdAt: String(version?.createdAt || '').trim()
    })).filter((version) => version.id && version.label);

    const comments = (Array.isArray(value?.agent?.comments) ? value.agent.comments : []).map((comment) => ({
      id: String(comment?.id || '').trim(),
      title: String(comment?.title || '').trim(),
      body: String(comment?.body || '').trim(),
      tone: String(comment?.tone || '').trim(),
      anchorText: String(comment?.anchorText || '').trim(),
      relatedCardId: String(comment?.relatedCardId || '').trim(),
      target: String(comment?.target || '').trim(),
      createdAt: String(comment?.createdAt || '').trim()
    })).filter((comment) => comment.id && comment.title && comment.body);

    const messages = (Array.isArray(value?.agent?.messages) ? value.agent.messages : []).map((message) => ({
      id: String(message?.id || '').trim(),
      role: String(message?.role || '').trim(),
      text: String(message?.text || '').trim(),
      action: String(message?.action || '').trim(),
      suggestedCards: (Array.isArray(message?.suggestedCards) ? message.suggestedCards : []).map((card) => ({
        id: String(card?.id || '').trim(),
        sourceKey: String(card?.sourceKey || '').trim(),
        zone: String(card?.zone || 'workspace').trim(),
        type: String(card?.type || 'Agent suggestion').trim(),
        title: String(card?.title || '').trim(),
        content: String(card?.content || '').trim(),
        source: String(card?.source || '').trim(),
        sourcePath: String(card?.sourcePath || '').trim(),
        whyItMatters: String(card?.whyItMatters || '').trim(),
        confidence: String(card?.confidence || '').trim(),
        strength: String(card?.strength || '').trim(),
        agentAnnotation: String(card?.agentAnnotation || '').trim(),
        relatedHypothesisLabel: String(card?.relatedHypothesisLabel || '').trim(),
        origin: String(card?.origin || '').trim(),
        tags: (Array.isArray(card?.tags) ? card.tags : []).map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 12),
        createdAt: String(card?.createdAt || '').trim()
      })).filter((card) => card.id && (card.title || card.content))
    })).filter((message) => message.id && message.role && message.text);

    return {
      version: Number(value?.version) || 1,
      header: {
        label: String(value?.header?.label || 'Idea').trim() || 'Idea',
        title: String(value?.header?.title || '').trim(),
        prompt: String(value?.header?.prompt || '').trim(),
        stage: String(value?.header?.stage || '').trim()
      },
      workspaceDraft: String(value?.workspaceDraft || '').trim(),
      workspaceDraftType: String(value?.workspaceDraftType || 'Note').trim() || 'Note',
      importedSourceKeys: (Array.isArray(value?.importedSourceKeys) ? value.importedSourceKeys : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 200),
      cards,
      hypothesis: {
        html: String(value?.hypothesis?.html || '').trim(),
        versions
      },
      agent: {
        comments,
        messages
      },
      updatedAt: new Date().toISOString()
    };
  };

  const normalizeIdeaWorkbenchEvents = (value) => {
    const rawEvents = Array.isArray(value) ? value : [value];
    return rawEvents
      .map((event) => ({
        id: String(event?.id || '').trim(),
        type: String(event?.type || '').trim(),
        actor: String(event?.actor || 'user').trim(),
        summary: String(event?.summary || '').trim(),
        createdAt: String(event?.createdAt || new Date().toISOString()).trim(),
        payload: event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
          ? event.payload
          : {}
      }))
      .filter((event) => event.id && event.type)
      .slice(0, 50);
  };

  router.get('/api/concepts', authenticateToken, async (req, res) => {
    try {
      const data = await getConcepts(req.user.id);
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error fetching concepts:', error);
      res.status(500).json({ error: 'Failed to fetch concepts.' });
    }
  });

  router.get('/api/concepts/:name', authenticateToken, async (req, res) => {
    try {
      const data = await getConceptMeta(req.user.id, req.params.name);
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error fetching concept meta:', error);
      res.status(500).json({ error: 'Failed to fetch concept meta.' });
    }
  });

  router.put('/api/concepts/:name', authenticateToken, async (req, res) => {
    try {
      const conceptName = String(req.params.name || '').trim();
      const existing = await TagMeta.findOne({
        userId: req.user.id,
        name: new RegExp(`^${escapeRegExp(conceptName)}$`, 'i')
      }).select('_id');
      const updated = await updateConceptMeta(req.user.id, req.params.name, req.body || {});
      if (!existing && updated?._id) {
        trackEvent({
          event: EVENT_NAMES.CONCEPT_CREATED,
          userId: req.user.id,
          requestId: req.requestId,
          properties: {
            conceptId: String(updated._id),
            conceptName: String(updated.name || conceptName).trim()
          }
        });
        trackEvent({
          event: EVENT_NAMES.WORKSPACE_CREATED,
          userId: req.user.id,
          requestId: req.requestId,
          properties: {
            workspaceType: 'concept',
            conceptId: String(updated._id),
            conceptName: String(updated.name || conceptName).trim()
          }
        });
      }
      res.status(200).json(updated);
    } catch (error) {
      console.error('❌ Error updating concept meta:', error);
      res.status(500).json({ error: 'Failed to update concept meta.' });
    }
  });

  router.get('/api/concepts/:name/related', authenticateToken, async (req, res) => {
    try {
      const { limit = 20, offset = 0 } = req.query;
      const data = await getConceptRelated(req.user.id, req.params.name, { limit, offset });
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Error fetching concept related data:', error);
      res.status(500).json({ error: 'Failed to fetch concept related data.' });
    }
  });

  router.get('/api/concepts/:name/idea-workbench', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      return res.status(200).json({
        conceptId: String(concept._id),
        conceptName: String(concept.name || ''),
        ideaWorkbench: concept.ideaWorkbench && typeof concept.ideaWorkbench === 'object'
          ? concept.ideaWorkbench
          : null,
        revision: Number(concept.ideaWorkbenchRevision || 0),
        events: Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : []
      });
    } catch (error) {
      console.error('❌ Error fetching idea workbench:', error);
      return res.status(500).json({ error: 'Failed to fetch idea workbench.' });
    }
  });

  router.put('/api/concepts/:name/idea-workbench', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const baseRevision = Number(req.body?.baseRevision);
      const currentRevision = Number(concept.ideaWorkbenchRevision || 0);
      if (Number.isFinite(baseRevision) && baseRevision !== currentRevision) {
        return res.status(409).json({
          error: 'Idea workbench has changed since this copy was loaded.',
          revision: currentRevision,
          ideaWorkbench: concept.ideaWorkbench && typeof concept.ideaWorkbench === 'object'
            ? concept.ideaWorkbench
            : null,
          events: Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : []
        });
      }
      const ideaWorkbench = normalizeIdeaWorkbenchPayload(req.body?.ideaWorkbench || req.body || {});
      concept.ideaWorkbench = ideaWorkbench;
      concept.ideaWorkbenchRevision = currentRevision + 1;
      concept.markModified('ideaWorkbench');
      concept.markModified('ideaWorkbenchRevision');
      await concept.save();
      return res.status(200).json({
        conceptId: String(concept._id),
        conceptName: String(concept.name || ''),
        ideaWorkbench,
        revision: Number(concept.ideaWorkbenchRevision || 0),
        events: Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : []
      });
    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error.message || 'Invalid idea workbench payload.' });
      }
      console.error('❌ Error saving idea workbench:', error);
      return res.status(500).json({ error: 'Failed to save idea workbench.' });
    }
  });

  router.post('/api/concepts/:name/idea-workbench/events', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const normalizedEvents = normalizeIdeaWorkbenchEvents(req.body?.events || req.body?.event || []);
      if (normalizedEvents.length === 0) {
        return res.status(400).json({ error: 'At least one valid event is required.' });
      }
      const existing = Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : [];
      concept.ideaWorkbenchEvents = [...existing, ...normalizedEvents].slice(-400);
      concept.markModified('ideaWorkbenchEvents');
      await concept.save();
      return res.status(200).json({
        conceptId: String(concept._id),
        conceptName: String(concept.name || ''),
        events: Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : []
      });
    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error.message || 'Invalid idea workbench event payload.' });
      }
      console.error('❌ Error saving idea workbench events:', error);
      return res.status(500).json({ error: 'Failed to save idea workbench events.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptMetaRouter
};
