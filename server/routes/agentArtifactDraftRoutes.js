const express = require('express');
const { trackHarnessEvent } = require('../services/agentHarnessEvents');

const buildAgentArtifactDraftRouter = ({
  authenticateToken,
  AgentArtifactDraft,
  NotebookEntry,
  Question,
  updateConceptMeta,
  syncNotebookReferences,
  enqueueNotebookEmbedding,
  enqueueQuestionEmbedding,
  createBlockId,
  AgentHandoff,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc,
  sanitizeAgentArtifactDraftDoc,
  promoteAgentArtifactDraftRecord,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  const clean = (value) => String(value || '').trim();

  const normalizeStatus = (value, fallback = 'pending') => {
    const candidate = clean(value).toLowerCase();
    return ['pending', 'promoted', 'dismissed', 'all'].includes(candidate) ? candidate : fallback;
  };

  const getDraft = async (userId, draftId) => AgentArtifactDraft.findOne({ _id: draftId, userId });

  router.get('/api/agent/artifacts/drafts', authenticateToken, async (req, res) => {
    try {
      const query = { userId: req.user.id };
      const status = normalizeStatus(req.query.status, 'pending');
      if (status !== 'all') query.status = status;
      const threadId = clean(req.query.threadId);
      const artifactType = clean(req.query.artifactType).toLowerCase();
      if (threadId) query.sourceThreadId = threadId;
      if (['note', 'concept', 'question', 'handoff'].includes(artifactType)) query.artifactType = artifactType;
      const rows = await AgentArtifactDraft.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(80);
      return res.status(200).json({ drafts: rows.map(sanitizeAgentArtifactDraftDoc) });
    } catch (error) {
      console.error('❌ Error listing agent artifact drafts:', error);
      return res.status(500).json({ error: 'Failed to list agent artifact drafts.' });
    }
  });

  router.patch('/api/agent/artifacts/drafts/:draftId', authenticateToken, async (req, res) => {
    try {
      const draft = await getDraft(req.user.id, req.params.draftId);
      if (!draft) return res.status(404).json({ error: 'Draft not found.' });
      if (String(draft.status || '').trim().toLowerCase() === 'promoted') {
        return res.status(400).json({ error: 'Promoted drafts cannot be edited.' });
      }

      if (req.body?.title !== undefined) {
        draft.title = clean(req.body.title).slice(0, 160);
      }
      if (req.body?.summary !== undefined) {
        draft.summary = clean(req.body.summary).slice(0, 280);
      }
      if (req.body?.body !== undefined) {
        draft.body = clean(req.body.body).slice(0, 12000);
      }
      if (!clean(draft.title) || !clean(draft.body)) {
        return res.status(400).json({ error: 'Draft title and body are required.' });
      }
      if (!clean(draft.summary)) {
        draft.summary = clean(draft.body).slice(0, 280);
      }
      await draft.save();
      return res.status(200).json({ draft: sanitizeAgentArtifactDraftDoc(draft) });
    } catch (error) {
      console.error('❌ Error updating artifact draft:', error);
      return res.status(500).json({ error: 'Failed to update artifact draft.' });
    }
  });

  router.post('/api/agent/artifacts/drafts/:draftId/dismiss', authenticateToken, async (req, res) => {
    try {
      const draft = await getDraft(req.user.id, req.params.draftId);
      if (!draft) return res.status(404).json({ error: 'Draft not found.' });
      draft.status = 'dismissed';
      await draft.save();
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_ARTIFACT_DRAFT_DISMISSED,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(draft?.sourceThreadId),
          draftId: clean(draft?._id),
          artifactType: clean(draft?.artifactType)
        }
      });
      return res.status(200).json({ draft: sanitizeAgentArtifactDraftDoc(draft) });
    } catch (error) {
      console.error('❌ Error dismissing artifact draft:', error);
      return res.status(500).json({ error: 'Failed to dismiss artifact draft.' });
    }
  });

  router.post('/api/agent/artifacts/drafts/:draftId/promote', authenticateToken, async (req, res) => {
    try {
      const draft = await getDraft(req.user.id, req.params.draftId);
      if (!draft) return res.status(404).json({ error: 'Draft not found.' });
      if (draft.status === 'promoted') {
        return res.status(200).json({ draft: sanitizeAgentArtifactDraftDoc(draft), reused: true });
      }

      const result = await promoteAgentArtifactDraftRecord({
        draft,
        userId: req.user.id,
        NotebookEntry,
        Question,
        updateConceptMeta,
        syncNotebookReferences,
        enqueueNotebookEmbedding,
        enqueueQuestionEmbedding,
        createBlockId,
        AgentHandoff,
        buildDefaultHandoffPlan,
        buildDefaultHandoffCheckpoint,
        createThreadForHandoff,
        sanitizeAgentHandoffDoc
      });
      trackHarnessEvent({
        trackEvent,
        event: EVENT_NAMES?.AGENT_ARTIFACT_DRAFT_PROMOTED,
        userId: String(req.user.id),
        requestId: req.requestId,
        properties: {
          threadId: clean(result?.draft?.sourceThreadId),
          draftId: clean(result?.draft?._id),
          artifactType: clean(result?.draft?.artifactType)
        }
      });

      return res.status(200).json({
        draft: sanitizeAgentArtifactDraftDoc(result.draft),
        promoted: result.promoted
      });
    } catch (error) {
      console.error('❌ Error promoting artifact draft:', error);
      return res.status(500).json({ error: 'Failed to promote artifact draft.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentArtifactDraftRouter
};
