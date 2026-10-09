const express = require('express');
const {
  trackHarnessEvent,
  trackRunLifecycleEvents
} = require('../services/agentHarnessEvents');
const { isSharedQuestionContext, sharedQuestionReadCapability } = require('../services/agentCapabilityBroker');
const { normalizeProposalBundle } = require('../services/agentProposalBundles');
const {
  planLibraryStructureProposal: defaultPlanLibraryStructureProposal,
  persistLibraryStructureProposal: defaultPersistLibraryStructureProposal
} = require('../services/agentStructurePlanningService');

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
  AgentStructureProposal,
  Folder,
  Article,
  NotebookFolder,
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
  resolveRequestedProposalBundle,
  applyProposalBundleInvalidations,
  sanitizeAgentArtifactDraftDoc,
  sanitizeAgentStructureProposalDoc,
  planLibraryStructureProposal = defaultPlanLibraryStructureProposal,
  persistLibraryStructureProposal = defaultPersistLibraryStructureProposal,
  threadMessagesToHistory,
  truncate,
  trackEvent,
  EVENT_NAMES
}) => {
  const router = express.Router();

  const isLibraryOrganizationTurn = (result = {}) => (
    String(result?.capability?.id || '').trim() === 'capability.workspace.organize'
  );

  const bindChatTurn = (thread, requestContext) => {
    const surface = requestContext && typeof requestContext === 'object' ? requestContext : null;
    if (isSharedQuestionContext(surface)) {
      return {
        thread: thread && isSharedQuestionContext(thread.scope) ? thread : null,
        chatContext: surface,
        allowExecution: false
      };
    }
    return {
      thread,
      chatContext: surface || thread?.scope || null,
      allowExecution: true
    };
  };

  const prepareLibraryStructurePlan = async ({
    result = {},
    userId = '',
    message = '',
    context = {},
    proposalActor = { actorType: 'native_agent', actorId: 'resident' },
    canPropose = true
  } = {}) => {
    if (isSharedQuestionContext(context) || isSharedQuestionContext(result?.context)) {
      return {
        result: {
          ...result,
          proposalBundle: null,
          planner: null,
          suggestedActions: [],
          capability: sharedQuestionReadCapability()
        },
        draft: null
      };
    }
    if (!isLibraryOrganizationTurn(result)) return { result, draft: null };
    // The folder plan replaces the organize step; anything else staged in the
    // same turn, such as a rewrite, still waits under the reply.
    const proposalBundle = normalizeProposalBundle({
      ...result.proposalBundle,
      operations: (result.proposalBundle?.operations || []).filter(operation => operation.type !== 'organize_workspace')
    });
    const alsoStaged = proposalBundle ? ' The rewrite you asked for is staged below.' : '';
    if (!canPropose) {
      return {
        result: {
          ...result,
          proposalBundle,
          reply: `This agent can inspect your Library, but it is not allowed to stage structural changes. Nothing changed.${alsoStaged}`,
          structurePlanning: { status: 'blocked', reason: 'propose_changes_disabled' }
        },
        draft: null
      };
    }

    try {
      const planned = await planLibraryStructureProposal({
        Folder,
        Article,
        userId,
        request: message,
        sourceBundleId: String(result?.proposalBundle?.bundleId || '').trim(),
        actor: proposalActor
      });
      const operationCount = Array.isArray(planned?.draft?.operations) ? planned.draft.operations.length : 0;
      return {
        result: {
          ...result,
          proposalBundle,
          reply: `I staged “${planned.draft.title}” with ${operationCount} reviewable ${operationCount === 1 ? 'change' : 'changes'}. Inspect each move before applying it; nothing in your Library has changed yet.${alsoStaged}`,
          structurePlanning: {
            status: 'ready',
            inventory: planned.inventory,
            model: planned.model || undefined,
            provider: planned.provider || undefined,
            upstream: planned.upstream || undefined,
            upstreamAttempts: planned.upstreamAttempts
          }
        },
        draft: planned.draft
      };
    } catch (error) {
      const userFacingReason = Number(error?.status) === 409
        ? String(error?.message || '').trim()
        : 'The proposed operations could not be verified against your current folders and articles.';
      console.warn('[agent-chat] structure planning failed closed', {
        status: error?.status,
        message: error?.message,
        upstreamAttempts: error?.upstreamAttempts
      });
      return {
        result: {
          ...result,
          proposalBundle,
          reply: `I could not produce a safe Library structure plan from the current inventory, so I did not stage or apply anything. ${userFacingReason}`.trim() + alsoStaged,
          structurePlanning: {
            status: 'failed',
            reason: userFacingReason
          }
        },
        draft: null
      };
    }
  };

  const persistPreparedStructurePlan = async ({ prepared = {}, thread = null } = {}) => {
    if (!prepared?.draft || !thread?._id) return null;
    const proposal = await persistLibraryStructureProposal({
      AgentStructureProposal,
      draft: prepared.draft,
      threadId: String(thread._id)
    });
    return sanitizeAgentStructureProposalDoc(proposal);
  };

  const loadThread = async (userId, threadId) => {
    const safeId = String(threadId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(safeId)) return null;
    return AgentThread.findOne({ _id: safeId, userId });
  };

  const writeSse = (res, event, payload = {}) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const delay = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

  const streamReplyText = async (res, reply = '') => {
    const text = String(reply || '');
    const chunks = text.match(/\S+\s*/g) || (text ? [text] : []);
    for (const chunk of chunks) {
      writeSse(res, 'agent-delta', { delta: chunk });
      await delay(10);
    }
  };

  const buildActivityReceipt = ({ stage = 'activity', summary = '', elapsedMs = null } = {}) => ({
    key: `${stage}:${String(summary || '').trim()}`,
    stage,
    summary: String(summary || '').trim(),
    elapsedMs: Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) : undefined,
    createdAt: new Date().toISOString()
  });

  const emitActivity = (res, receipts, receipt) => {
    const safeReceipt = buildActivityReceipt(receipt);
    if (!safeReceipt.summary) return;
    if (receipts.some(item => item.key === safeReceipt.key)) return;
    receipts.push(safeReceipt);
    writeSse(res, 'agent-activity', safeReceipt);
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
        mode: String(result?.mode || '').trim() || undefined,
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable),
        planner: result?.planner ? normalizeThreadPlanner(result.planner) : undefined,
        capability: result?.capability && typeof result.capability === 'object' ? result.capability : undefined,
        modelRoute: result?.modelRoute && typeof result.modelRoute === 'object' ? result.modelRoute : undefined,
        activityReceipts: Array.isArray(result?.activityReceipts) ? result.activityReceipts : []
      }
    });
    targetThread.planner = result?.planner ? normalizeThreadPlanner(result.planner) : null;
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

  const summarizeNoMatchResolution = ({ invalidatedBundleIds = [] } = {}) => (
    invalidatedBundleIds.length > 0
      ? 'I found older pending proposals here, but they are stale now, so I did not execute them. Tell me the next move explicitly and I will restage it.'
      : 'That plan is no longer pending in this conversation, so nothing ran.'
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
      AgentStructureProposal,
      Folder,
      Article,
      NotebookFolder,
      NotebookEntry,
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

  // One turn of the thought partner, however it is asked for: the answer, any
  // structure plan it stages, the recorded thread, and any drafted artifact.
  // The streaming route sends the reply before the turn is recorded.
  const runChatTurn = async ({
    userId,
    actor,
    body = {},
    thread = null,
    context,
    entitlements,
    source,
    requestId,
    signal,
    proposalActor,
    canPropose,
    beforeRecord = async result => result
  }) => {
    const generated = await generateCollaborativeReply({
      userId,
      message: body.message,
      history: thread ? threadMessagesToHistory(thread.messages) : body.history,
      context,
      limit: body.limit,
      premiumWebResearchAvailable: entitlements.premiumWebResearchAvailable,
      skillInvocation: body.skillInvocation || {},
      signal
    });
    const prepared = await prepareLibraryStructurePlan({
      result: generated,
      userId,
      message: body.message,
      context,
      proposalActor,
      canPropose
    });
    const result = await beforeRecord(prepared.result);
    const persistedThread = await persistChatTurn({
      userId,
      actor,
      payload: prepared.draft ? { ...body, persistThread: true } : body,
      result,
      thread
    });
    const structureProposal = await persistPreparedStructurePlan({ prepared, thread: persistedThread });
    const threadId = String(persistedThread?._id || thread?._id || '');
    if (result?.proposalBundle) {
      emitHarnessEvent({
        event: EVENT_NAMES?.AGENT_PROPOSAL_BUNDLE_STAGED,
        userId,
        requestId,
        properties: { threadId, bundleId: String(result.proposalBundle.bundleId || ''), source }
      });
    }
    const draftArtifact = await createAgentArtifactDraftFromSkillReply({
      AgentArtifactDraft,
      userId,
      actor,
      reply: result?.reply,
      thread: persistedThread,
      context: body.context || thread?.scope || null,
      skillInvocation: body.skillInvocation || {}
    });
    if (draftArtifact?._id) {
      emitHarnessEvent({
        event: EVENT_NAMES?.AGENT_ARTIFACT_DRAFT_STAGED,
        userId,
        requestId,
        properties: {
          threadId,
          draftId: String(draftArtifact._id),
          artifactType: String(draftArtifact.artifactType || ''),
          source
        }
      });
    }
    return {
      ...result,
      entitlements,
      thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined,
      draftArtifact: draftArtifact ? sanitizeAgentArtifactDraftDoc(draftArtifact) : undefined,
      structureProposal: structureProposal || undefined
    };
  };

  router.post('/api/agent/chat', authenticateToken, async (req, res) => {
    try {
      const loadedThread = await loadThread(String(req.user.id), req.body?.threadId);
      const { thread, chatContext, allowExecution } = bindChatTurn(loadedThread, req.body?.context);
      const actor = { actorType: 'user', actorId: String(req.user.id) };
      const approvedBundleId = String(req.body?.approveBundleId || '').trim();
      if (allowExecution && thread && approvedBundleId) {
        const resolution = resolveRequestedProposalBundle({
          thread,
          bundleId: approvedBundleId,
          context: chatContext
        });

        applyProposalBundleInvalidations({ thread, bundleIds: resolution.invalidatedBundleIds });

        let executionResult;
        if (resolution.status === 'matched') {
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
              bundleId: approvedBundleId,
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
          executionResult = {
            mode: 'execution_intent',
            reply: summarizeRunExecution({
              bundle: resolution.bundle,
              run: run?.toObject ? run.toObject({ getters: false, virtuals: false }) : run
            }),
            proposalResolution: {
              status: 'matched',
              bundleId: approvedBundleId,
              title: String(resolution.bundle?.title || '').trim()
            },
            run: sanitizeAgentRunDoc(run)
          };
        } else {
          emitHarnessEvent({
            event: EVENT_NAMES?.AGENT_EXECUTION_INTENT_NO_MATCH,
            userId: String(req.user.id),
            requestId: req.requestId,
            properties: {
              threadId: String(thread?._id || ''),
              invalidatedBundleCount: resolution.invalidatedBundleIds.length,
              source: 'chat'
            }
          });
          executionResult = {
            mode: 'execution_intent',
            reply: summarizeNoMatchResolution({ invalidatedBundleIds: resolution.invalidatedBundleIds }),
            proposalResolution: {
              status: 'none',
              bundleId: approvedBundleId,
              invalidatedBundleIds: resolution.invalidatedBundleIds
            }
          };
        }
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

      const entitlements = await getUserAgentEntitlements(String(req.user.id));
      return res.status(200).json(await runChatTurn({
        userId: String(req.user.id),
        actor,
        body: req.body || {},
        thread,
        context: chatContext,
        entitlements,
        source: 'native_chat',
        requestId: req.requestId
      }));
    } catch (error) {
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        return res.status(Number(error.status)).json({ error: error.message || 'Invalid agent chat request.' });
      }
      console.error('❌ Error generating collaborative agent reply:', error);
      return res.status(500).json({ error: 'Failed to generate agent reply.' });
    }
  });

  router.post('/api/agent/chat/stream', authenticateToken, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const startedAt = Date.now();
    const activityReceipts = [];
    const streamController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) streamController.abort();
    });
    try {
      const loadedThread = await loadThread(String(req.user.id), req.body?.threadId);
      const { thread, chatContext: context } = bindChatTurn(loadedThread, req.body?.context);
      const actor = { actorType: 'user', actorId: String(req.user.id) };
      if (context?.pageId && !context?.metadata?.exploration && !context?.exploration) {
        emitActivity(res, activityReceipts, {
          stage: 'read_page',
          summary: 'Read the selected wiki page.'
        });
      }
      const referenceCount = Array.isArray(context?.references) ? context.references.length : 0;
      if (referenceCount) {
        emitActivity(res, activityReceipts, {
          stage: 'load_references',
          summary: `Loaded ${referenceCount} referenced item${referenceCount === 1 ? '' : 's'}.`
        });
      }
      const entitlements = await getUserAgentEntitlements(String(req.user.id));
      const turn = await runChatTurn({
        userId: String(req.user.id),
        actor,
        body: req.body || {},
        thread,
        context,
        entitlements,
        source: 'native_chat_stream',
        requestId: req.requestId,
        signal: streamController.signal,
        beforeRecord: async (result) => {
          if (result?.retrieval?.searchedWorkspace) {
            const relatedCount = Array.isArray(result?.relatedItems) ? result.relatedItems.length : 0;
            emitActivity(res, activityReceipts, { stage: 'search', summary: 'Searched the workspace context.' });
            emitActivity(res, activityReceipts, {
              stage: 'retrieve',
              summary: relatedCount
                ? `Retrieved ${relatedCount} related workspace item${relatedCount === 1 ? '' : 's'}.`
                : 'No additional related workspace items were needed.'
            });
          } else if (context?.pageId) {
            emitActivity(res, activityReceipts, { stage: 'retrieve', summary: 'Answered from the selected wiki page.' });
          }
          emitActivity(res, activityReceipts, {
            stage: 'compose',
            summary: `Composed reply in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`
          });
          await streamReplyText(res, result?.reply);
          return { ...result, activityReceipts };
        }
      });
      writeSse(res, 'agent-final', turn);
      return res.end();
    } catch (error) {
      console.error('❌ Error streaming collaborative agent reply:', error);
      writeSse(res, 'error', {
        error: Number(error?.status) >= 400 && Number(error?.status) < 500
          ? error.message || 'Invalid agent chat request.'
          : 'Failed to generate agent reply.'
      });
      return res.end();
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
      const loadedThread = await loadThread(String(req.personalAgent.userId), req.body?.threadId);
      const { thread, chatContext } = bindChatTurn(loadedThread, req.body?.context);
      const actor = { actorType: 'byo_agent', actorId: String(req.personalAgent.id || '') };
      const turn = await runChatTurn({
        userId: String(req.personalAgent.userId),
        actor,
        body: req.body || {},
        thread,
        context: chatContext,
        entitlements,
        source: 'byo_chat',
        requestId: req.requestId,
        proposalActor: actor,
        canPropose: capabilities.proposeChanges
      });
      return res.status(200).json({
        ...turn,
        actor: { ...actor, actorName: String(req.personalAgent.name || '') }
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
