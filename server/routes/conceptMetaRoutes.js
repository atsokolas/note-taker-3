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
        html: String(value?.hypothesis?.html || '').trim(),
        versions
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

  const createWorkbenchId = (prefix = 'workbench') => (
    `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`
  );

  const createWorkbenchMessage = ({ text = '', action = '', suggestedCards = [] }) => ({
    id: createWorkbenchId('message'),
    role: 'assistant',
    text: String(text || '').trim(),
    action: String(action || '').trim(),
    suggestedCards: Array.isArray(suggestedCards) ? suggestedCards.slice(0, 3) : []
  });

  const createWorkbenchComment = ({ title = '', body = '', tone = 'signal' }) => ({
    id: createWorkbenchId('comment'),
    title: String(title || '').trim(),
    body: String(body || '').trim(),
    tone: String(tone || 'signal').trim(),
    anchorText: '',
    relatedCardId: '',
    target: 'hypothesis',
    createdAt: new Date().toISOString()
  });

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
      const response = await saveWorkbenchMutation(concept, ideaWorkbench, null);
      return res.status(200).json(response);
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

  router.post('/api/concepts/:name/idea-workbench/change-drafts/:draftId/apply', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const draftId = String(req.params.draftId || '').trim();
      const workbench = normalizeIdeaWorkbenchPayload(concept.ideaWorkbench || {});
      const draft = (Array.isArray(workbench.changeDrafts) ? workbench.changeDrafts : []).find((entry) => String(entry?.id || '').trim() === draftId);
      if (!draft) return res.status(404).json({ error: 'Change draft not found.' });

      const appliedAt = new Date().toISOString();
      const existingSourceKeys = new Set((Array.isArray(workbench.cards) ? workbench.cards : []).map((card) => String(card?.sourceKey || card?.id || '').trim()).filter(Boolean));
      const cardsToAdd = (Array.isArray(draft.cards) ? draft.cards : []).filter((card) => {
        const key = String(card?.sourceKey || card?.id || '').trim();
        if (!key) return true;
        return !existingSourceKeys.has(key);
      });

      const nextWorkbench = {
        ...workbench,
        cards: [...(Array.isArray(workbench.cards) ? workbench.cards : []), ...cardsToAdd],
        importedSourceKeys: [
          ...new Set([
            ...(Array.isArray(workbench.importedSourceKeys) ? workbench.importedSourceKeys : []),
            ...(Array.isArray(draft.sourceKeys) ? draft.sourceKeys : []),
            ...(Array.isArray(draft.cards) ? draft.cards.map((card) => String(card?.sourceKey || '').trim()).filter(Boolean) : [])
          ])
        ],
        changeDrafts: (Array.isArray(workbench.changeDrafts) ? workbench.changeDrafts : []).filter((entry) => String(entry?.id || '').trim() !== draftId),
        meta: {
          ...(workbench.meta && typeof workbench.meta === 'object' ? workbench.meta : {}),
          lastReviewedAt: appliedAt,
          stale: false,
          staleReason: '',
          staleSignature: '',
          dismissedFreshnessSignature: ''
        },
        agent: {
          ...(workbench.agent && typeof workbench.agent === 'object' ? workbench.agent : {}),
          comments: [
            createWorkbenchComment({
              title: draft.title,
              body: draft.summary,
              tone: String(draft?.kind || '').trim().toLowerCase() === 'contradiction' ? 'warning' : 'signal'
            }),
            ...((Array.isArray(workbench?.agent?.comments) ? workbench.agent.comments : []))
          ],
          messages: [
            ...((Array.isArray(workbench?.agent?.messages) ? workbench.agent.messages : [])),
            createWorkbenchMessage({
              text: String(draft?.applyMessage || '').trim() || `Applied ${String(draft?.title || 'change draft').trim().toLowerCase()}.`,
              action: 'change-applied',
              suggestedCards: Array.isArray(draft.cards) ? draft.cards : []
            })
          ]
        }
      };

      const response = await saveWorkbenchMutation(concept, nextWorkbench, {
        id: createWorkbenchId('event'),
        type: 'change_draft_applied',
        actor: 'user',
        summary: `Applied ${String(draft?.title || 'change draft').trim().toLowerCase()}.`,
        createdAt: appliedAt,
        payload: { draftId, kind: String(draft?.kind || '').trim(), count: Array.isArray(draft?.cards) ? draft.cards.length : 0 }
      });
      return res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error applying idea workbench change draft:', error);
      return res.status(500).json({ error: 'Failed to apply change draft.' });
    }
  });

  router.post('/api/concepts/:name/idea-workbench/change-drafts/:draftId/dismiss', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const draftId = String(req.params.draftId || '').trim();
      const workbench = normalizeIdeaWorkbenchPayload(concept.ideaWorkbench || {});
      const draft = (Array.isArray(workbench.changeDrafts) ? workbench.changeDrafts : []).find((entry) => String(entry?.id || '').trim() === draftId);
      if (!draft) return res.status(404).json({ error: 'Change draft not found.' });

      const nextWorkbench = {
        ...workbench,
        changeDrafts: (Array.isArray(workbench.changeDrafts) ? workbench.changeDrafts : []).filter((entry) => String(entry?.id || '').trim() !== draftId),
        meta: String(draft?.kind || '').trim().toLowerCase() === 'refresh'
          ? {
            ...(workbench.meta && typeof workbench.meta === 'object' ? workbench.meta : {}),
            dismissedFreshnessSignature: String(draft?.signature || '').trim()
          }
          : workbench.meta
      };

      const response = await saveWorkbenchMutation(concept, nextWorkbench, {
        id: createWorkbenchId('event'),
        type: 'change_draft_dismissed',
        actor: 'user',
        summary: `Dismissed ${String(draft?.title || 'change draft').trim().toLowerCase()}.`,
        createdAt: new Date().toISOString(),
        payload: { draftId, kind: String(draft?.kind || '').trim() }
      });
      return res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error dismissing idea workbench change draft:', error);
      return res.status(500).json({ error: 'Failed to dismiss change draft.' });
    }
  });

  router.post('/api/concepts/:name/idea-workbench/comments/:commentId/accept', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const commentId = String(req.params.commentId || '').trim();
      const workbench = normalizeIdeaWorkbenchPayload(concept.ideaWorkbench || {});
      const comment = (Array.isArray(workbench?.agent?.comments) ? workbench.agent.comments : []).find((entry) => String(entry?.id || '').trim() === commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found.' });
      if (!String(comment?.suggestedHtml || '').trim()) {
        return res.status(400).json({ error: 'Comment has no suggested revision to apply.' });
      }

      const nextWorkbench = {
        ...workbench,
        hypothesis: {
          ...(workbench.hypothesis && typeof workbench.hypothesis === 'object' ? workbench.hypothesis : {}),
          html: `${String(workbench?.hypothesis?.html || '<p></p>').trim() || '<p></p>'}${String(comment.suggestedHtml || '').trim()}`
        },
        agent: {
          ...(workbench.agent && typeof workbench.agent === 'object' ? workbench.agent : {}),
          comments: (Array.isArray(workbench?.agent?.comments) ? workbench.agent.comments : []).filter((entry) => String(entry?.id || '').trim() !== commentId),
          messages: [
            ...((Array.isArray(workbench?.agent?.messages) ? workbench.agent.messages : [])),
            createWorkbenchMessage({
              text: 'Applied the pending revision to the concept draft.',
              action: 'revision-applied'
            })
          ]
        }
      };
      const response = await saveWorkbenchMutation(concept, nextWorkbench, {
        id: createWorkbenchId('event'),
        type: 'agent_suggestion_accepted',
        actor: 'user',
        summary: 'Accepted an agent hypothesis suggestion.',
        createdAt: new Date().toISOString(),
        payload: { commentId, target: String(comment?.target || '').trim() }
      });
      return res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error accepting idea workbench comment:', error);
      return res.status(500).json({ error: 'Failed to accept revision comment.' });
    }
  });

  router.post('/api/concepts/:name/idea-workbench/comments/:commentId/dismiss', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const commentId = String(req.params.commentId || '').trim();
      const workbench = normalizeIdeaWorkbenchPayload(concept.ideaWorkbench || {});
      const comment = (Array.isArray(workbench?.agent?.comments) ? workbench.agent.comments : []).find((entry) => String(entry?.id || '').trim() === commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found.' });

      const nextWorkbench = {
        ...workbench,
        agent: {
          ...(workbench.agent && typeof workbench.agent === 'object' ? workbench.agent : {}),
          comments: (Array.isArray(workbench?.agent?.comments) ? workbench.agent.comments : []).filter((entry) => String(entry?.id || '').trim() !== commentId),
          messages: [
            ...((Array.isArray(workbench?.agent?.messages) ? workbench.agent.messages : [])),
            createWorkbenchMessage({
              text: 'Dismissed the pending revision and kept the draft unchanged.',
              action: 'revision-dismissed'
            })
          ]
        }
      };
      const response = await saveWorkbenchMutation(concept, nextWorkbench, {
        id: createWorkbenchId('event'),
        type: 'agent_suggestion_dismissed',
        actor: 'user',
        summary: 'Dismissed an agent hypothesis suggestion.',
        createdAt: new Date().toISOString(),
        payload: { commentId, target: String(comment?.target || '').trim() }
      });
      return res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error dismissing idea workbench comment:', error);
      return res.status(500).json({ error: 'Failed to dismiss revision comment.' });
    }
  });

  router.post('/api/concepts/:name/idea-workbench/mark-reviewed', authenticateToken, async (req, res) => {
    try {
      const concept = await findConceptDocument(req.user.id, req.params.name);
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const workbench = normalizeIdeaWorkbenchPayload(concept.ideaWorkbench || {});
      const reviewedAt = new Date().toISOString();
      const staleSignature = String(workbench?.meta?.staleSignature || '').trim();
      const nextWorkbench = {
        ...workbench,
        changeDrafts: (Array.isArray(workbench.changeDrafts) ? workbench.changeDrafts : []).filter((draft) => String(draft?.kind || '').trim().toLowerCase() !== 'refresh'),
        meta: {
          ...(workbench.meta && typeof workbench.meta === 'object' ? workbench.meta : {}),
          lastReviewedAt: reviewedAt,
          stale: false,
          staleReason: '',
          staleSignature: '',
          dismissedFreshnessSignature: staleSignature || String(workbench?.meta?.dismissedFreshnessSignature || '').trim()
        },
        agent: {
          ...(workbench.agent && typeof workbench.agent === 'object' ? workbench.agent : {}),
          messages: [
            ...((Array.isArray(workbench?.agent?.messages) ? workbench.agent.messages : [])),
            createWorkbenchMessage({
              text: 'Marked this concept as current with the reviewed archive material.',
              action: 'mark-reviewed'
            })
          ]
        }
      };
      const response = await saveWorkbenchMutation(concept, nextWorkbench, {
        id: createWorkbenchId('event'),
        type: 'concept_marked_reviewed',
        actor: 'user',
        summary: 'Marked the concept as reviewed.',
        createdAt: reviewedAt,
        payload: { reviewedAt }
      });
      return res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error marking idea workbench reviewed:', error);
      return res.status(500).json({ error: 'Failed to mark concept reviewed.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptMetaRouter
};
