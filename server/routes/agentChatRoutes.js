const express = require('express');

const buildAgentChatRouter = ({
  authenticateToken,
  authenticatePersonalAgentKey,
  getUserAgentEntitlements,
  generateCollaborativeReply,
  normalizePersonalAgentCapabilities,
  mongoose,
  AgentThread,
  AgentArtifactDraft,
  normalizeThreadScope,
  appendThreadMessage,
  compactThreadState,
  normalizeThreadPlanner,
  sanitizeAgentThreadDoc,
  createAgentArtifactDraftFromSkillReply,
  sanitizeAgentArtifactDraftDoc,
  threadMessagesToHistory,
  truncate
}) => {
  const router = express.Router();

  const loadThread = async (userId, threadId) => {
    const safeId = String(threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(safeId)) return null;
    return AgentThread.findOne({ _id: safeId, userId });
  };

  const persistChatTurn = async ({
    userId,
    actor,
    payload = {},
    result = {},
    thread = null
  }) => {
    const shouldPersist = Boolean(thread) || Boolean(payload.persistThread);
    if (!shouldPersist) return null;

    let targetThread = thread;
    if (!targetThread) {
      const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
      targetThread = await AgentThread.create({
        userId,
        title: truncate(payload.threadTitle || payload.message || 'Thought partner', 120),
        status: 'active',
        summary: '',
        scope: normalizeThreadScope(context),
        createdBy: actor,
        lastActor: actor,
        messages: []
      });
    }

    appendThreadMessage(targetThread, {
      role: 'user',
      text: String(payload.message || '').trim(),
      actor
    });
    appendThreadMessage(targetThread, {
      role: 'assistant',
      text: String(result?.reply || '').trim(),
      actor: { actorType: 'native_agent', actorId: '' },
      relatedItems: Array.isArray(result?.relatedItems) ? result.relatedItems : [],
      citations: Array.isArray(result?.citations) ? result.citations : [],
      suggestedActions: Array.isArray(result?.suggestedActions) ? result.suggestedActions : [],
      metadata: {
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable),
        planner: result?.planner ? normalizeThreadPlanner(result.planner) : undefined
      }
    });
    if (result?.planner) {
      targetThread.planner = normalizeThreadPlanner(result.planner);
    }
    compactThreadState(targetThread, {
      actor: { actorType: 'native_agent', actorId: '' }
    });
    await targetThread.save();
    return targetThread;
  };

  router.post('/api/agent/chat', authenticateToken, async (req, res) => {
    try {
      const thread = await loadThread(String(req.user.id), req.body?.threadId);
      const entitlements = await getUserAgentEntitlements(String(req.user.id));
      const result = await generateCollaborativeReply({
        userId: String(req.user.id),
        message: req.body?.message,
        history: thread ? threadMessagesToHistory(thread.messages) : req.body?.history,
        context: req.body?.context || thread?.scope || null,
        limit: req.body?.limit,
        premiumWebResearchAvailable: entitlements.premiumWebResearchAvailable,
        skillInvocation: req.body?.skillInvocation || {}
      });
      const persistedThread = await persistChatTurn({
        userId: String(req.user.id),
        actor: { actorType: 'user', actorId: String(req.user.id) },
        payload: req.body || {},
        result,
        thread
      });
      const draftArtifact = await createAgentArtifactDraftFromSkillReply({
        AgentArtifactDraft,
        userId: String(req.user.id),
        actor: { actorType: 'user', actorId: String(req.user.id) },
        reply: result?.reply,
        thread: persistedThread,
        context: req.body?.context || thread?.scope || null,
        skillInvocation: req.body?.skillInvocation || {}
      });
      return res.status(200).json({
        ...result,
        entitlements,
        thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined,
        draftArtifact: draftArtifact ? sanitizeAgentArtifactDraftDoc(draftArtifact) : undefined
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid agent chat request.' });
      }
      console.error('❌ Error generating collaborative agent reply:', error);
      return res.status(500).json({ error: 'Failed to generate agent reply.' });
    }
  });

  router.get('/api/agent/byo/session', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const entitlements = await getUserAgentEntitlements(String(req.personalAgent.userId));
      return res.status(200).json({
        agent: {
          id: String(req.personalAgent?.id || ''),
          name: String(req.personalAgent?.name || ''),
          capabilities: normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {})
        },
        mode: 'internal_only',
        premiumWebResearchAvailable: Boolean(entitlements.premiumWebResearchAvailable),
        entitlements
      });
    } catch (error) {
      console.error('❌ Error loading BYO agent session:', error);
      return res.status(500).json({ error: 'Failed to load BYO agent session.' });
    }
  });

  router.post('/api/agent/byo/chat', authenticatePersonalAgentKey, async (req, res) => {
    try {
      const capabilities = normalizePersonalAgentCapabilities(req.personalAgent?.capabilities || {});
      if (!capabilities.read || !capabilities.search) {
        return res.status(403).json({ error: 'This personal agent cannot read/search private workspace content.' });
      }
      const entitlements = await getUserAgentEntitlements(String(req.personalAgent.userId));
      const thread = await loadThread(String(req.personalAgent.userId), req.body?.threadId);

      const result = await generateCollaborativeReply({
        userId: String(req.personalAgent.userId),
        message: req.body?.message,
        history: thread ? threadMessagesToHistory(thread.messages) : req.body?.history,
        context: req.body?.context || thread?.scope || null,
        limit: req.body?.limit,
        premiumWebResearchAvailable: entitlements.premiumWebResearchAvailable,
        skillInvocation: req.body?.skillInvocation || {}
      });
      const persistedThread = await persistChatTurn({
        userId: String(req.personalAgent.userId),
        actor: {
          actorType: 'byo_agent',
          actorId: String(req.personalAgent.id || '')
        },
        payload: req.body || {},
        result,
        thread
      });
      const draftArtifact = await createAgentArtifactDraftFromSkillReply({
        AgentArtifactDraft,
        userId: String(req.personalAgent.userId),
        actor: {
          actorType: 'byo_agent',
          actorId: String(req.personalAgent.id || '')
        },
        reply: result?.reply,
        thread: persistedThread,
        context: req.body?.context || thread?.scope || null,
        skillInvocation: req.body?.skillInvocation || {}
      });

      return res.status(200).json({
        ...result,
        entitlements,
        thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined,
        draftArtifact: draftArtifact ? sanitizeAgentArtifactDraftDoc(draftArtifact) : undefined,
        actor: {
          actorType: 'byo_agent',
          actorId: String(req.personalAgent.id || ''),
          actorName: String(req.personalAgent.name || '')
        }
      });
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid BYO agent chat request.' });
      }
      console.error('❌ Error generating BYO collaborative agent reply:', error);
      return res.status(500).json({ error: 'Failed to generate BYO agent reply.' });
    }
  });

  return router;
};

module.exports = {
  buildAgentChatRouter
};
