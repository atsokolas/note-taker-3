const express = require('express');
const {
  trackHarnessEvent,
  trackRunLifecycleEvents
} = require('../services/agentHarnessEvents');

const buildAgentChatRouter = ({
  authenticateToken,
  authenticatePersonalAgentKey,
  getUserAgentEntitlements,
  generateCollaborativeReply,
  normalizePersonalAgentCapabilities,
  mongoose,
  AgentThread,
  AgentRun,
  AgentHandoff,
  AgentProtocolApproval,
  AgentProposedChange,
  TagMeta,
  NotebookEntry,
  AgentArtifactDraft,
  normalizeThreadScope,
  appendThreadMessage,
  compactThreadState,
  normalizeThreadPlanner,
  sanitizeAgentThreadDoc,
  sanitizeAgentRunDoc,
  createAgentArtifactDraftFromSkillReply,
  createRunFromProposalBundle,
  executeAgentRun,
  applyProposalBundleRunOutcome,
  createProposedChangesForRun,
  requestRunStepApproval,
  reconcileAgentRunState,
  buildDefaultHandoffPlan,
  buildDefaultHandoffCheckpoint,
  createThreadForHandoff,
  sanitizeAgentHandoffDoc,
  shouldResolveExecutionIntent,
  resolveExecutableProposalBundle,
  applyProposalBundleInvalidations,
  sanitizeAgentArtifactDraftDoc,
  threadMessagesToHistory,
  truncate,
  trackEvent,
  EVENT_NAMES
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
      proposalBundle: result?.proposalBundle || null,
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

  const summarizeRunExecution = ({
    bundle = null,
    run = null
  } = {}) => {
    const safeBundleTitle = String(bundle?.title || '').trim() || 'that proposal';
    const safeRun = run && typeof run === 'object' ? run : {};
    const proposedChangeCount = Array.isArray(safeRun.steps)
      ? safeRun.steps.filter((step) => String(step?.type || '').trim().toLowerCase() === 'propose_content_change').length
      : 0;
    if (String(safeRun.status || '').trim().toLowerCase() === 'paused_for_approval') {
      const blockedTitle = String(safeRun?.blockedStep?.title || '').trim() || 'the next risky step';
      return `Resolved this to "${safeBundleTitle}". I executed the safe steps and paused on "${blockedTitle}" for approval.`;
    }
    if (String(safeRun.status || '').trim().toLowerCase() === 'awaiting_review') {
      return `Resolved this to "${safeBundleTitle}". I executed the operational steps and staged ${proposedChangeCount || 1} reviewable content ${proposedChangeCount === 1 ? 'change' : 'changes'}.`;
    }
    if (String(safeRun.status || '').trim().toLowerCase() === 'completed') {
      return `Resolved this to "${safeBundleTitle}" and executed it.`;
    }
    return `Resolved this to "${safeBundleTitle}" and started the run.`;
  };

  const summarizeAmbiguousResolution = (candidates = []) => {
    const labels = candidates
      .map((candidate) => String(candidate?.bundle?.title || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (labels.length === 0) {
      return 'I found more than one pending proposal here. Tell me which one to execute.';
    }
    return `I still have multiple pending bundles here: ${labels.map((label) => `"${label}"`).join(', ')}. Say which one to execute.`;
  };

  const summarizeNoMatchResolution = ({ invalidatedBundleIds = [] } = {}) => (
    invalidatedBundleIds.length > 0
      ? 'I found older pending proposals here, but they are stale now, so I did not execute them. Tell me the next move explicitly and I will restage it.'
      : 'I do not have a still-pending executable proposal in this thread.'
  );

  const executeResolvedProposalBundle = async ({
    userId,
    thread,
    bundle,
    actor
  }) => {
    const created = createRunFromProposalBundle({
      thread,
      bundleId: bundle?.bundleId,
      actor
    });
    const runDoc = await AgentRun.create({
      userId,
      threadId: thread._id,
      sourceBundleId: created.sourceBundleId,
      title: created.title,
      status: created.status,
      createdBy: created.createdBy,
      lastActor: created.lastActor,
      currentOpId: created.currentOpId,
      blockedOpId: created.blockedOpId,
      steps: created.steps,
      completedStepCount: created.completedStepCount,
      startedAt: created.startedAt,
      pausedAt: created.pausedAt,
      completedAt: created.completedAt
    });

    const advanced = await executeAgentRun({
      run: {
        ...created,
        runId: String(runDoc._id)
      },
      thread,
      userId,
      actor,
      AgentHandoff,
      buildDefaultHandoffPlan,
      buildDefaultHandoffCheckpoint,
      createThreadForHandoff,
      sanitizeAgentHandoffDoc,
      approvePendingApprovalSteps: true,
      requestStepApproval: ({ run, step, thread: runThread, actor: requestActor }) => requestRunStepApproval({
        AgentProtocolApproval,
        userId,
        run,
        step,
        thread: runThread,
        actor: requestActor
      })
    });

    runDoc.status = advanced.status;
    runDoc.lastActor = advanced.lastActor;
    runDoc.currentOpId = advanced.currentOpId;
    runDoc.blockedOpId = advanced.blockedOpId;
    runDoc.steps = advanced.steps;
    runDoc.completedStepCount = advanced.completedStepCount;
    runDoc.startedAt = advanced.startedAt;
    runDoc.pausedAt = advanced.pausedAt;
    runDoc.completedAt = advanced.completedAt;
    await runDoc.save();

    await createProposedChangesForRun({
      AgentProposedChange,
      TagMeta,
      NotebookEntry,
      userId,
      thread,
      run: {
        ...advanced,
        runId: String(runDoc._id)
      },
      actor
    });

    const reconciledRun = await reconcileAgentRunState({
      AgentRun,
      AgentProposedChange,
      userId,
      runId: String(runDoc._id)
    });

    applyProposalBundleRunOutcome({
      thread,
      run: {
        ...(reconciledRun?.toObject ? reconciledRun.toObject({ getters: false, virtuals: false }) : reconciledRun || advanced),
        runId: String(runDoc._id)
      }
    });

    return reconciledRun || runDoc;
  };

  const emitHarnessEvent = ({
    event,
    userId,
    requestId,
    properties = {}
  } = {}) => trackHarnessEvent({
    trackEvent,
    event,
    userId,
    requestId,
    properties
  });

  router.post('/api/agent/chat', authenticateToken, async (req, res) => {
    try {
      const thread = await loadThread(String(req.user.id), req.body?.threadId);
      const actor = { actorType: 'user', actorId: String(req.user.id) };
      if (thread && shouldResolveExecutionIntent(req.body?.message)) {
        const resolution = resolveExecutableProposalBundle({
          thread,
          message: req.body?.message,
          context: req.body?.context || thread?.scope || null
        });

        if (Array.isArray(resolution?.invalidatedBundleIds) && resolution.invalidatedBundleIds.length > 0) {
          applyProposalBundleInvalidations({
            thread,
            bundleIds: resolution.invalidatedBundleIds
          });
        }

        if (resolution?.status === 'matched' && resolution?.bundle) {
          const run = await executeResolvedProposalBundle({
            userId: String(req.user.id),
            thread,
            bundle: resolution.bundle,
            actor
          });
          emitHarnessEvent({
            event: EVENT_NAMES?.AGENT_EXECUTION_INTENT_MATCHED,
            userId: String(req.user.id),
            requestId: req.requestId,
            properties: {
              threadId: String(thread?._id || ''),
              bundleId: String(resolution.bundle?.bundleId || ''),
              source: 'chat'
            }
          });
          trackRunLifecycleEvents({
            trackEvent,
            EVENT_NAMES,
            userId: String(req.user.id),
            requestId: req.requestId,
            threadId: String(thread?._id || ''),
            run,
            source: 'chat_execution_intent',
            includeStarted: true
          });
          const executionResult = {
            mode: 'execution_intent',
            reply: summarizeRunExecution({
              bundle: resolution.bundle,
              run: run?.toObject ? run.toObject({ getters: false, virtuals: false }) : run
            }),
            proposalResolution: {
              status: 'matched',
              bundleId: String(resolution.bundle?.bundleId || '').trim(),
              title: String(resolution.bundle?.title || '').trim()
            },
            run: sanitizeAgentRunDoc(run)
          };
          const persistedThread = await persistChatTurn({
            userId: String(req.user.id),
            actor,
            payload: req.body || {},
            result: executionResult,
            thread
          });
          return res.status(200).json({
            ...executionResult,
            thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined
          });
        }

        if (resolution?.status === 'ambiguous') {
          emitHarnessEvent({
            event: EVENT_NAMES?.AGENT_EXECUTION_INTENT_AMBIGUOUS,
            userId: String(req.user.id),
            requestId: req.requestId,
            properties: {
              threadId: String(thread?._id || ''),
              candidateCount: Array.isArray(resolution?.candidates) ? resolution.candidates.length : 0,
              source: 'chat'
            }
          });
          const ambiguousResult = {
            mode: 'execution_intent',
            reply: summarizeAmbiguousResolution(resolution.candidates || []),
            proposalResolution: {
              status: 'ambiguous',
              candidates: (Array.isArray(resolution.candidates) ? resolution.candidates : []).map((candidate) => ({
                bundleId: String(candidate?.bundle?.bundleId || '').trim(),
                title: String(candidate?.bundle?.title || '').trim()
              }))
            }
          };
          const persistedThread = await persistChatTurn({
            userId: String(req.user.id),
            actor,
            payload: req.body || {},
            result: ambiguousResult,
            thread
          });
          return res.status(200).json({
            ...ambiguousResult,
            thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined
          });
        }

        if (resolution?.status === 'none') {
          emitHarnessEvent({
            event: EVENT_NAMES?.AGENT_EXECUTION_INTENT_NO_MATCH,
            userId: String(req.user.id),
            requestId: req.requestId,
            properties: {
              threadId: String(thread?._id || ''),
              invalidatedBundleCount: Array.isArray(resolution?.invalidatedBundleIds) ? resolution.invalidatedBundleIds.length : 0,
              source: 'chat'
            }
          });
          const noMatchResult = {
            mode: 'execution_intent',
            reply: summarizeNoMatchResolution({
              invalidatedBundleIds: resolution.invalidatedBundleIds || []
            }),
            proposalResolution: {
              status: 'none',
              invalidatedBundleIds: resolution.invalidatedBundleIds || []
            }
          };
          const persistedThread = await persistChatTurn({
            userId: String(req.user.id),
            actor,
            payload: req.body || {},
            result: noMatchResult,
            thread
          });
          return res.status(200).json({
            ...noMatchResult,
            thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined
          });
        }
      }

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
        actor,
        payload: req.body || {},
        result,
        thread
      });
      if (result?.proposalBundle) {
        emitHarnessEvent({
          event: EVENT_NAMES?.AGENT_PROPOSAL_BUNDLE_STAGED,
          userId: String(req.user.id),
          requestId: req.requestId,
          properties: {
            threadId: String(persistedThread?._id || thread?._id || ''),
            bundleId: String(result?.proposalBundle?.bundleId || ''),
            source: 'native_chat'
          }
        });
      }
      const draftArtifact = await createAgentArtifactDraftFromSkillReply({
        AgentArtifactDraft,
        userId: String(req.user.id),
        actor,
        reply: result?.reply,
        thread: persistedThread,
        context: req.body?.context || thread?.scope || null,
        skillInvocation: req.body?.skillInvocation || {}
      });
      if (draftArtifact?._id) {
        emitHarnessEvent({
          event: EVENT_NAMES?.AGENT_ARTIFACT_DRAFT_STAGED,
          userId: String(req.user.id),
          requestId: req.requestId,
          properties: {
            threadId: String(persistedThread?._id || thread?._id || ''),
            draftId: String(draftArtifact?._id || ''),
            artifactType: String(draftArtifact?.artifactType || ''),
            source: 'native_chat'
          }
        });
      }
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
      if (result?.proposalBundle) {
        emitHarnessEvent({
          event: EVENT_NAMES?.AGENT_PROPOSAL_BUNDLE_STAGED,
          userId: String(req.personalAgent.userId),
          requestId: req.requestId,
          properties: {
            threadId: String(persistedThread?._id || thread?._id || ''),
            bundleId: String(result?.proposalBundle?.bundleId || ''),
            source: 'byo_chat'
          }
        });
      }
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
      if (draftArtifact?._id) {
        emitHarnessEvent({
          event: EVENT_NAMES?.AGENT_ARTIFACT_DRAFT_STAGED,
          userId: String(req.personalAgent.userId),
          requestId: req.requestId,
          properties: {
            threadId: String(persistedThread?._id || thread?._id || ''),
            draftId: String(draftArtifact?._id || ''),
            artifactType: String(draftArtifact?.artifactType || ''),
            source: 'byo_chat'
          }
        });
      }

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
