const express = require('express');
const { recordRevision, snapshotOf } = require('../services/entryHistory');
const { ConceptRenameError, renameConcept } = require('../services/conceptRename');
const { verifyReviewerConceptOwner } = require('../services/reviewerRehearsalBudget');
const { settledPageFor } = require('../services/settlement');

const buildConceptMetaRouter = ({
  authenticateToken,
  getConcepts,
  getConceptMeta,
  updateConceptMeta,
  getConceptRelated,
  TagMeta,
  WikiPage = null,
  User = null,
  EntryRevision = null,
  conceptReferences = {},
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

    const normalizeWorkbenchCard = (card = {}, fallbackType = 'Note') => ({
      id: String(card?.id || '').trim(),
      sourceKey: String(card?.sourceKey || '').trim(),
      zone: String(card?.zone || 'workspace').trim(),
      type: String(card?.type || fallbackType).trim(),
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
      createdAt: String(card?.createdAt || '').trim(),
      updatedAt: String(card?.updatedAt || '').trim()
    });

    const cards = (Array.isArray(value.cards) ? value.cards : [])
      .map((card) => normalizeWorkbenchCard(card, 'Note'))
      .filter((card) => card.id && card.zone && card.type && (card.title || card.content));

    const changeDrafts = (Array.isArray(value.changeDrafts) ? value.changeDrafts : []).map((draft) => ({
      id: String(draft?.id || '').trim(),
      kind: String(draft?.kind || 'support').trim(),
      status: String(draft?.status || 'pending').trim(),
      title: String(draft?.title || '').trim(),
      summary: String(draft?.summary || '').trim(),
      caption: String(draft?.caption || '').trim(),
      reason: String(draft?.reason || '').trim(),
      signature: String(draft?.signature || '').trim(),
      sourceKeys: (Array.isArray(draft?.sourceKeys) ? draft.sourceKeys : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 80),
      cards: (Array.isArray(draft?.cards) ? draft.cards : [])
        .map((card) => normalizeWorkbenchCard(card, 'Agent suggestion'))
        .filter((card) => card.id && card.zone && (card.title || card.content))
        .slice(0, 12),
      createdAt: String(draft?.createdAt || '').trim(),
      applyMessage: String(draft?.applyMessage || '').trim()
    })).filter((draft) => draft.id && draft.kind && draft.status);

    const comments = (Array.isArray(value?.agent?.comments) ? value.agent.comments : []).map((comment) => ({
      id: String(comment?.id || '').trim(),
      title: String(comment?.title || '').trim(),
      body: String(comment?.body || '').trim(),
      tone: String(comment?.tone || '').trim(),
      anchorText: String(comment?.anchorText || '').trim(),
      relatedCardId: String(comment?.relatedCardId || '').trim(),
      target: String(comment?.target || '').trim(),
      status: String(comment?.status || 'active').trim(),
      caption: String(comment?.caption || '').trim(),
      suggestedHtml: String(comment?.suggestedHtml || '').trim(),
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
        // Earlier wording is kept by the entry history, not inside the draft.
        html: String(value?.hypothesis?.html || '').trim()
      },
      agent: {
      comments,
      messages
      },
      changeDrafts,
      meta: {
        lastReviewedAt: String(value?.meta?.lastReviewedAt || '').trim(),
        stale: Boolean(value?.meta?.stale),
        staleReason: String(value?.meta?.staleReason || '').trim(),
        staleSignature: String(value?.meta?.staleSignature || '').trim(),
        dismissedFreshnessSignature: String(value?.meta?.dismissedFreshnessSignature || '').trim()
      },
      updatedAt: new Date().toISOString()
    };
  };

  const buildIdeaWorkbenchMeta = (ideaWorkbench = {}) => {
    const workbenchMeta = ideaWorkbench?.meta && typeof ideaWorkbench.meta === 'object'
      ? ideaWorkbench.meta
      : {};
    const pendingDrafts = (Array.isArray(ideaWorkbench?.changeDrafts) ? ideaWorkbench.changeDrafts : [])
      .filter((draft) => String(draft?.status || '').trim().toLowerCase() === 'pending');
    const refreshDraft = pendingDrafts.find((draft) => String(draft?.kind || '').trim().toLowerCase() === 'refresh');
    const freshSourceCount = Array.isArray(refreshDraft?.cards) ? refreshDraft.cards.length : 0;
    const stale = Boolean(workbenchMeta?.stale);
    return {
      lastReviewedAt: String(workbenchMeta?.lastReviewedAt || '').trim(),
      stale,
      staleReason: String(workbenchMeta?.staleReason || '').trim(),
      staleSignature: String(workbenchMeta?.staleSignature || '').trim(),
      dismissedFreshnessSignature: String(workbenchMeta?.dismissedFreshnessSignature || '').trim(),
      pendingDraftCount: pendingDrafts.length,
      freshSourceCount,
      statusLabel: stale
        ? (freshSourceCount > 0 ? `${freshSourceCount} newer ${freshSourceCount === 1 ? 'source' : 'sources'}` : 'Needs review')
        : 'Current'
    };
  };

  const appendWorkbenchEvent = (concept, event) => {
    const existing = Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : [];
    concept.ideaWorkbenchEvents = [...existing, event].slice(-400);
    concept.markModified('ideaWorkbenchEvents');
  };

  const buildWorkbenchResponse = (concept) => ({
    conceptId: String(concept._id),
    conceptName: String(concept.name || ''),
    ideaWorkbench: concept.ideaWorkbench && typeof concept.ideaWorkbench === 'object'
      ? concept.ideaWorkbench
      : null,
    ideaWorkbenchMeta: concept.ideaWorkbenchMeta && typeof concept.ideaWorkbenchMeta === 'object'
      ? concept.ideaWorkbenchMeta
      : null,
    revision: Number(concept.ideaWorkbenchRevision || 0),
    events: Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : []
  });

  const saveWorkbenchMutation = async (concept, nextWorkbench, event) => {
    concept.ideaWorkbench = nextWorkbench;
    concept.ideaWorkbenchMeta = buildIdeaWorkbenchMeta(nextWorkbench);
    concept.ideaWorkbenchRevision = Number(concept.ideaWorkbenchRevision || 0) + 1;
    concept.markModified('ideaWorkbench');
    concept.markModified('ideaWorkbenchMeta');
    concept.markModified('ideaWorkbenchRevision');
    if (event) {
      appendWorkbenchEvent(concept, event);
    }
    await concept.save();
    return buildWorkbenchResponse(concept);
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
      const settled = WikiPage && data._id ? await settledPageFor({ WikiPage, userId: req.user.id, kind: 'concepts', id: data._id }).select('_id title') : null;
      res.status(200).json({ ...data, settledIn: settled ? { _id: String(settled._id), title: settled.title } : null });
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

  router.post('/api/concepts/:name/rename', authenticateToken, async (req, res) => {
    if (req.agentToken || req.authInfo?.tokenSource === 'agent-token' || req.personalAgent) {
      return res.status(403).json({ error: 'Only the human owner can rename a concept.' });
    }
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      return res.status(200).json(await renameConcept({
        TagMeta,
        models: conceptReferences,
        userId: req.user.id,
        from: concept?.name || req.params.name,
        to: req.body?.name
      }));
    } catch (error) {
      if (error instanceof ConceptRenameError) return res.status(error.status).json({ error: error.message });
      console.error('❌ Error renaming concept:', error);
      return res.status(500).json({ error: 'The concept kept its old name. Try again in a moment.' });
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
      const reviewerIdentity = req.agentToken ? null
        : await verifyReviewerConceptOwner({ concept, userId: req.user.id, User });
      if (reviewerIdentity) console.info(`[REVIEWER_IDENTITY] concept=${reviewerIdentity.conceptId} user=${reviewerIdentity.userId} username=${reviewerIdentity.username}`);
      return res.status(200).json({
        ...(reviewerIdentity ? { reviewerIdentity } : {}),
        conceptId: String(concept._id),
        conceptName: String(concept.name || ''),
        ideaWorkbench: concept.ideaWorkbench && typeof concept.ideaWorkbench === 'object'
          ? concept.ideaWorkbench
          : null,
        ideaWorkbenchMeta: concept.ideaWorkbenchMeta && typeof concept.ideaWorkbenchMeta === 'object'
          ? concept.ideaWorkbenchMeta
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
          ideaWorkbenchMeta: concept.ideaWorkbenchMeta && typeof concept.ideaWorkbenchMeta === 'object'
            ? concept.ideaWorkbenchMeta
            : null,
          events: Array.isArray(concept.ideaWorkbenchEvents) ? concept.ideaWorkbenchEvents : []
        });
      }
      const ideaWorkbench = normalizeIdeaWorkbenchPayload(req.body?.ideaWorkbench || req.body || {});
      const before = snapshotOf('concept', concept);
      const beforeAt = concept.updatedAt;
      const response = await saveWorkbenchMutation(concept, ideaWorkbench, null);
      await recordRevision({
        EntryRevision, userId: req.user.id, kind: 'concept', entryId: concept._id,
        before, beforeAt, after: snapshotOf('concept', concept), restoredFrom: req.body?.restoredFrom
      });
      return res.status(200).json(response);
    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error.message || 'Invalid idea workbench payload.' });
      }
      console.error('❌ Error saving idea workbench:', error);
      return res.status(500).json({ error: 'Failed to save idea workbench.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptMetaRouter
};
