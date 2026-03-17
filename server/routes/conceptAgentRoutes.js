const express = require('express');

const buildConceptAgentRouter = ({
  authenticateToken,
  resolveConceptByParam,
  buildConceptWorkspace,
  createConceptSuggestionDraft,
  getConceptSuggestionDrafts,
  mutateConceptSuggestionDraft,
  getUserAgentEntitlements,
  logAgentMetric,
  getAgentMetricsSnapshot
}) => {
  const router = express.Router();

  const isAgentAiUnavailableError = (error) => {
    const upstream = String(error?.payload?.upstream || '').toLowerCase();
    if (upstream !== 'ai_service') return false;
    const status = Number(error?.status || 0);
    if ([429, 502, 503, 504].includes(status)) return true;
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('timed out')
      || message.includes('fetch failed')
      || message.includes('request failed')
    );
  };

  router.post('/api/concepts/:conceptId/agent/build', authenticateToken, async (req, res) => {
    const conceptId = String(req.params.conceptId || '').trim();
    try {
      const mode = String(req.body?.mode || 'library_only').trim().toLowerCase();
      const maxLoops = req.body?.maxLoops ?? 2;
      const preview = Boolean(req.body?.preview);
      const applyPreview = Boolean(req.body?.applyPreview);
      logAgentMetric('route.build.attempt', {
        preview: preview ? 'yes' : 'no',
        applypreview: applyPreview ? 'yes' : 'no'
      });

      if (mode !== 'library_only') {
        return res.status(400).json({ error: 'mode must be "library_only".' });
      }
      if (preview && applyPreview) {
        return res.status(400).json({ error: 'preview and applyPreview cannot both be true.' });
      }

      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const conceptTitle = String(concept.name || '').trim();
      const conceptDescription = String(concept.description || '').trim();
      if (!conceptTitle && !conceptDescription) {
        return res.status(400).json({ error: 'Concept title or description is required for agent build.' });
      }

      const summary = await buildConceptWorkspace({
        conceptId: String(concept._id),
        userId: String(req.user.id),
        mode,
        maxLoops,
        preview,
        applyPreview
      });

      res.status(200).json({
        ok: true,
        summary,
        conceptId: String(concept._id)
      });
      logAgentMetric('route.build.success', {
        preview: preview ? 'yes' : 'no',
        applypreview: applyPreview ? 'yes' : 'no',
        fallbackplan: summary?.usedFallbackPlan ? 'yes' : 'no',
        fallbackcandidates: summary?.usedFallbackCandidates ? 'yes' : 'no'
      });
    } catch (error) {
      logAgentMetric('route.build.error', {
        status: String(Number(error?.status) || 500),
        upstream: String(error?.payload?.upstream || 'none')
      });
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error?.message || 'Invalid agent build request.' });
      }
      if (Number(error?.status) === 404) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      if (Number(error?.status) === 401 || Number(error?.status) === 403) {
        return res.status(Number(error.status)).json({ error: error?.message || 'Unauthorized.' });
      }
      if (isAgentAiUnavailableError(error)) {
        console.warn('[AGENT-BUILD] ai_service unavailable', {
          requestId: req.requestId,
          conceptId,
          userId: String(req.user?.id || ''),
          status: Number(error?.status) || 0
        });
        return res.status(500).json({ error: 'Agent build is temporarily unavailable. Please try again shortly.' });
      }

      console.error('❌ Error building concept workspace with agent:', error);
      return res.status(500).json({ error: 'Failed to build concept workspace.' });
    }
  });

  router.post('/api/concepts/:conceptId/agent/suggest', authenticateToken, async (req, res) => {
    const conceptId = String(req.params.conceptId || '').trim();
    try {
      const mode = String(req.body?.mode || 'library_only').trim().toLowerCase();
      const maxLoops = req.body?.maxLoops ?? 2;
      logAgentMetric('route.scout.attempt', { mode });

      if (mode !== 'library_only') {
        return res.status(400).json({ error: 'mode must be "library_only".' });
      }

      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const summary = await createConceptSuggestionDraft({
        conceptId: String(concept._id),
        userId: String(req.user.id),
        mode,
        maxLoops
      });

      const responsePayload = {
        ok: true,
        conceptId: String(concept._id),
        draftId: String(summary.draftId || ''),
        summary: summary.summary || { itemSuggestions: 0, conceptSuggestions: 0 }
      };
      logAgentMetric('route.scout.success', {
        mode,
        fallback: summary?.summary?.usedFallbackSuggestions ? 'yes' : 'no'
      });
      return res.status(200).json(responsePayload);
    } catch (error) {
      logAgentMetric('route.scout.error', {
        status: String(Number(error?.status) || 500),
        upstream: String(error?.payload?.upstream || 'none')
      });
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error?.message || 'Invalid suggestion request.' });
      }
      if (Number(error?.status) === 404) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      if (Number(error?.status) === 401 || Number(error?.status) === 403) {
        return res.status(Number(error.status)).json({ error: error?.message || 'Unauthorized.' });
      }
      if (isAgentAiUnavailableError(error)) {
        console.warn('[AGENT-SUGGEST] ai_service unavailable', {
          requestId: req.requestId,
          conceptId,
          userId: String(req.user?.id || ''),
          status: Number(error?.status) || 0
        });
        return res.status(500).json({ error: 'Agent suggestions are temporarily unavailable. Please try again shortly.' });
      }

      console.error('❌ Error creating concept suggestion draft:', error);
      return res.status(500).json({ error: 'Failed to generate concept suggestions.' });
    }
  });

  router.get('/api/debug/agent-metrics', authenticateToken, async (_req, res) => {
    return res.status(200).json({
      ok: true,
      metrics: getAgentMetricsSnapshot()
    });
  });

  router.get('/api/concepts/:conceptId/agent/suggestions', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const data = await getConceptSuggestionDrafts({
        conceptId: String(concept._id),
        userId: String(req.user.id)
      });

      return res.status(200).json({
        ok: true,
        conceptId: String(concept._id),
        drafts: Array.isArray(data?.drafts) ? data.drafts : []
      });
    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error?.message || 'Invalid request.' });
      }
      if (Number(error?.status) === 404) {
        return res.status(404).json({ error: 'Concept not found.' });
      }
      if (Number(error?.status) === 401 || Number(error?.status) === 403) {
        return res.status(Number(error.status)).json({ error: error?.message || 'Unauthorized.' });
      }
      console.error('❌ Error loading concept suggestion drafts:', error);
      return res.status(500).json({ error: 'Failed to load concept suggestions.' });
    }
  });

  router.post('/api/concepts/:conceptId/agent/suggestions/:draftId/accept', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const draftId = String(req.params.draftId || '').trim();
      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const result = await mutateConceptSuggestionDraft({
        conceptId: String(concept._id),
        userId: String(req.user.id),
        draftId,
        action: 'accept',
        suggestionIds: req.body?.suggestionIds
      });

      return res.status(200).json({
        ok: true,
        conceptId: String(concept._id),
        draftId: String(result?.draftId || draftId),
        updatedCount: Number(result?.updatedCount || 0),
        workspaceSummary: result?.workspaceSummary || null
      });
    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error?.message || 'Invalid request.' });
      }
      if (Number(error?.status) === 404) {
        return res.status(404).json({ error: error?.message || 'Suggestion draft not found.' });
      }
      if (Number(error?.status) === 401 || Number(error?.status) === 403) {
        return res.status(Number(error.status)).json({ error: error?.message || 'Unauthorized.' });
      }
      console.error('❌ Error accepting concept suggestions:', error);
      return res.status(500).json({ error: 'Failed to accept concept suggestions.' });
    }
  });

  router.post('/api/concepts/:conceptId/agent/suggestions/:draftId/discard', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const draftId = String(req.params.draftId || '').trim();
      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });

      const result = await mutateConceptSuggestionDraft({
        conceptId: String(concept._id),
        userId: String(req.user.id),
        draftId,
        action: 'discard',
        suggestionIds: req.body?.suggestionIds
      });

      return res.status(200).json({
        ok: true,
        conceptId: String(concept._id),
        draftId: String(result?.draftId || draftId),
        updatedCount: Number(result?.updatedCount || 0)
      });
    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ error: error?.message || 'Invalid request.' });
      }
      if (Number(error?.status) === 404) {
        return res.status(404).json({ error: error?.message || 'Suggestion draft not found.' });
      }
      if (Number(error?.status) === 401 || Number(error?.status) === 403) {
        return res.status(Number(error.status)).json({ error: error?.message || 'Unauthorized.' });
      }
      console.error('❌ Error discarding concept suggestions:', error);
      return res.status(500).json({ error: 'Failed to discard concept suggestions.' });
    }
  });

  router.post('/api/concepts/:conceptId/agent/research', authenticateToken, async (req, res) => {
    try {
      const conceptId = String(req.params.conceptId || '').trim();
      const concept = await resolveConceptByParam(req.user.id, conceptId, { createIfMissing: false });
      if (!concept) return res.status(404).json({ error: 'Concept not found.' });
      const entitlements = await getUserAgentEntitlements(String(req.user.id));

      if (!entitlements.premiumWebResearchAvailable) {
        return res.status(402).json({
          ok: false,
          error: 'Premium web research is not enabled for this account.',
          required: 'premium_web_research',
          entitlements
        });
      }

      return res.status(501).json({
        ok: false,
        error: 'Research scout not implemented',
        hint: 'Requires web research pipeline implementation',
        entitlements
      });
    } catch (error) {
      console.error('❌ Error handling concept research scaffold route:', error);
      return res.status(500).json({ error: 'Failed to start concept research.' });
    }
  });

  return router;
};

module.exports = {
  buildConceptAgentRouter
};
