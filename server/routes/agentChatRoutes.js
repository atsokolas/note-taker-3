const express = require('express');
const {
  trackHarnessEvent,
  trackRunLifecycleEvents
} = require('../services/agentHarnessEvents');
const {
  askWikiPage: defaultAskWikiPage,
  loadWikiAskCorpus: defaultLoadWikiAskCorpus
} = require('../services/wikiAskService');
const { findWikiBacklinks: defaultFindWikiBacklinks } = require('../services/wikiBacklinkService');
const { getWikiSchemaPromptContent } = require('../services/wikiSchemaService');

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
  WikiPage,
  WikiRevision,
  WikiSchemaSettings,
  askWikiPage = defaultAskWikiPage,
  loadWikiAskCorpus = defaultLoadWikiAskCorpus,
  findWikiBacklinks = defaultFindWikiBacklinks,
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

  const textFromRichDoc = (node) => {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(textFromRichDoc).filter(Boolean).join('\n\n');
    if (typeof node !== 'object') return '';
    const ownText = typeof node.text === 'string' ? node.text : '';
    const childText = Array.isArray(node.content)
      ? node.content.map(textFromRichDoc).filter(Boolean).join(node.type === 'doc' ? '\n\n' : '')
      : '';
    return [ownText, childText].filter(Boolean).join('').trim();
  };

  const loadSelectedWikiPage = async ({ userId, pageId } = {}) => {
    const safePageId = String(pageId || '').trim();
    if (!safePageId || !WikiPage?.findOne) return null;
    if (mongoose?.Types?.ObjectId?.isValid && !mongoose.Types.ObjectId.isValid(safePageId)) return null;
    const query = WikiPage.findOne({
      _id: safePageId,
      userId,
      status: { $ne: 'archived' },
      archived: { $ne: true }
    });
    const selected = query?.select
      ? query.select('title slug pageType plainText body sourceRefs claims citations freshness aiState updatedAt status')
      : query;
    if (selected?.lean) return selected.lean();
    return selected;
  };

  const buildWikiGraphChatReply = async ({ userId, message, context } = {}) => {
    const question = String(message || '').trim();
    const pageId = String(context?.pageId || '').trim();
    if (!question || !pageId || !askWikiPage || !loadWikiAskCorpus) return null;
    const page = await loadSelectedWikiPage({ userId, pageId });
    if (!page) return null;

    const corpus = await loadWikiAskCorpus({
      page,
      question,
      userId,
      WikiPage,
      WikiRevision,
      TagMeta,
      findWikiBacklinks
    });
    let wikiSchemaContent = '';
    if (WikiSchemaSettings) {
      try {
        wikiSchemaContent = await getWikiSchemaPromptContent({ WikiSchemaSettings, userId });
      } catch (_error) {
        wikiSchemaContent = '';
      }
    }
    const answerResult = await askWikiPage({
      page,
      question,
      relatedPages: corpus?.relatedPages || [],
      conceptRecords: corpus?.conceptRecords || [],
      backlinkRows: corpus?.backlinkRows || [],
      revisionRows: corpus?.revisionRows || [],
      wikiSchemaContent
    });
    const reply = textFromRichDoc(answerResult?.answer)
      || answerResult?.errorMessage
      || 'I could not compose an answer from the wiki graph.';
    const provenance = answerResult?.provenance || {};
    const wikiPages = Array.isArray(provenance.wikiPages) ? provenance.wikiPages : [];
    const relatedItems = wikiPages
      .filter(item => item?.id || item?.title)
      .map(item => ({
        itemType: 'wiki_page',
        itemId: String(item.id || ''),
        title: String(item.title || 'Wiki page'),
        relationType: item.role === 'selected' ? 'selected_context' : 'graph_context',
        role: item.role || ''
      }));
    const graphExpanded = provenance.mode === 'graph_expanded' || wikiPages.some(item => item.role === 'related');
    return {
      reply,
      relatedItems,
      citations: [],
      suggestedActions: [],
      retrieval: {
        searchedWorkspace: graphExpanded,
        source: 'wiki_graph',
        mode: provenance.mode || 'page_first',
        summary: provenance.summary || '',
        searchedSummary: provenance.searchedSummary || '',
        pageTitles: wikiPages.map(item => item.title).filter(Boolean)
      },
      wikiAsk: {
        status: answerResult?.status || 'answered',
        model: answerResult?.model || '',
        provenance,
        citationIndexesUsed: Array.isArray(answerResult?.citationIndexesUsed) ? answerResult.citationIndexesUsed : []
      }
    };
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
        premiumWebResearchAvailable: Boolean(result?.premiumWebResearchAvailable),
        planner: result?.planner ? normalizeThreadPlanner(result.planner) : undefined,
        activityReceipts: Array.isArray(result?.activityReceipts) ? result.activityReceipts : []
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

  router.post('/api/agent/chat/stream', authenticateToken, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const startedAt = Date.now();
    const activityReceipts = [];
    const streamController = new AbortController();
    let streamedReply = '';
    req.on('close', () => {
      if (!res.writableEnded) streamController.abort();
    });
    try {
      const thread = await loadThread(String(req.user.id), req.body?.threadId);
      const actor = { actorType: 'user', actorId: String(req.user.id) };
      const context = req.body?.context || thread?.scope || null;
      if (context?.pageId) {
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
      let result = await buildWikiGraphChatReply({
        userId: String(req.user.id),
        message: req.body?.message,
        context
      });
      if (result) {
        await streamReplyText(res, result.reply);
        streamedReply = result.reply;
      } else {
        result = await generateCollaborativeReply({
          userId: String(req.user.id),
          message: req.body?.message,
          history: thread ? threadMessagesToHistory(thread.messages) : req.body?.history,
          context,
          limit: req.body?.limit,
          premiumWebResearchAvailable: entitlements.premiumWebResearchAvailable,
          skillInvocation: req.body?.skillInvocation || {},
          signal: streamController.signal,
          onDelta: (delta) => {
            const text = String(delta || '');
            if (!text || res.writableEnded || streamController.signal.aborted) return;
            streamedReply += text;
            writeSse(res, 'agent-delta', { delta: text });
          }
        });
      }

      const relatedCount = Array.isArray(result?.relatedItems) ? result.relatedItems.length : 0;
      if (result?.retrieval?.source === 'wiki_graph') {
        const pageTitles = Array.isArray(result?.retrieval?.pageTitles)
          ? result.retrieval.pageTitles.filter(Boolean).slice(0, 4)
          : [];
        emitActivity(res, activityReceipts, {
          stage: 'search',
          summary: result?.retrieval?.searchedSummary || 'Searched the wiki graph around the selected page.'
        });
        emitActivity(res, activityReceipts, {
          stage: 'retrieve',
          summary: pageTitles.length > 1
            ? `Read ${pageTitles.join(' + ')}.`
            : 'Answered from the selected wiki page.'
        });
      } else if (result?.retrieval?.searchedWorkspace) {
        emitActivity(res, activityReceipts, {
          stage: 'search',
          summary: 'Searched the workspace context.'
        });
        emitActivity(res, activityReceipts, {
          stage: 'retrieve',
          summary: relatedCount
            ? `Retrieved ${relatedCount} related workspace item${relatedCount === 1 ? '' : 's'}.`
            : 'No additional related workspace items were needed.'
        });
      } else if (context?.pageId) {
        emitActivity(res, activityReceipts, {
          stage: 'retrieve',
          summary: 'Answered from the selected wiki page.'
        });
      }
      emitActivity(res, activityReceipts, {
        stage: 'compose',
        summary: `Composed reply in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`
      });

      const resultWithReceipts = {
        ...result,
        activityReceipts
      };
      if (!streamedReply) {
        await streamReplyText(res, resultWithReceipts.reply);
      }

      const persistedThread = await persistChatTurn({
        userId: String(req.user.id),
        actor,
        payload: req.body || {},
        result: resultWithReceipts,
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
            source: 'native_chat_stream'
          }
        });
      }
      const draftArtifact = await createAgentArtifactDraftFromSkillReply({
        AgentArtifactDraft,
        userId: String(req.user.id),
        actor,
        reply: result?.reply,
        thread: persistedThread,
        context,
        skillInvocation: req.body?.skillInvocation || {}
      });
      writeSse(res, 'agent-final', {
        ...resultWithReceipts,
        entitlements,
        thread: persistedThread ? sanitizeAgentThreadDoc(persistedThread) : undefined,
        draftArtifact: draftArtifact ? sanitizeAgentArtifactDraftDoc(draftArtifact) : undefined
      });
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
