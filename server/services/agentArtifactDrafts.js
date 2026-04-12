const ARTIFACT_TYPES = new Set(['note', 'concept', 'question', 'handoff']);
const ARTIFACT_STATUSES = new Set(['pending', 'promoted', 'dismissed']);

const clean = (value) => String(value || '').trim();

const truncate = (value, limit = 240) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit).trim()}...`;
};

const normalizeArtifactType = (value, fallback = 'note') => {
  const candidate = clean(value).toLowerCase();
  return ARTIFACT_TYPES.has(candidate) ? candidate : fallback;
};

const normalizeArtifactStatus = (value, fallback = 'pending') => {
  const candidate = clean(value).toLowerCase();
  return ARTIFACT_STATUSES.has(candidate) ? candidate : fallback;
};

const artifactTypeFromOutputType = (outputType = '') => {
  const safe = clean(outputType).toLowerCase();
  if (safe === 'note_draft') return 'note';
  if (safe === 'concept_draft') return 'concept';
  if (safe === 'question_draft') return 'question';
  if (safe === 'handoff_draft') return 'handoff';
  if ([
    'research_brief_draft',
    'synthesis_doc_draft',
    'slide_outline_draft',
    'summary_brief',
    'critique_brief',
    'question_set',
    'connection_map',
    'gap_report',
    'duplicate_report',
    'stale_summary_report',
    'contradiction_report',
    'concept_candidate_report',
    'missing_link_report',
    'concept_health_report',
    'workspace_hygiene_report',
    'concept_network_report',
    'recurring_hygiene_report'
  ].includes(safe)) return 'note';
  return '';
};

const titlePrefixFromOutputType = (outputType = '') => {
  const safe = clean(outputType).toLowerCase();
  if (safe === 'summary_brief') return 'Summary brief';
  if (safe === 'critique_brief') return 'Critique brief';
  if (safe === 'question_set') return 'Question set';
  if (safe === 'connection_map') return 'Connection map';
  if (safe === 'research_brief_draft') return 'Research brief';
  if (safe === 'synthesis_doc_draft') return 'Synthesis doc';
  if (safe === 'slide_outline_draft') return 'Slide outline';
  if (safe === 'gap_report') return 'Gap report';
  if (safe === 'duplicate_report') return 'Duplicate scan';
  if (safe === 'stale_summary_report') return 'Stale summary scan';
  if (safe === 'contradiction_report') return 'Contradiction scan';
  if (safe === 'concept_candidate_report') return 'Concept candidates';
  if (safe === 'missing_link_report') return 'Missing link report';
  if (safe === 'concept_health_report') return 'Concept health scan';
  if (safe === 'workspace_hygiene_report') return 'Workspace hygiene summary';
  if (safe === 'concept_network_report') return 'Concept network scan';
  if (safe === 'recurring_hygiene_report') return 'Recurring hygiene summary';
  return '';
};

const stripMarkdownTitle = (value = '') => clean(value).replace(/^#{1,6}\s*/, '');

const deriveDraftTitle = ({
  artifactType = 'note',
  reply = '',
  contextTitle = '',
  skillTitle = '',
  outputType = ''
} = {}) => {
  const lines = clean(reply)
    .split('\n')
    .map((line) => stripMarkdownTitle(line))
    .filter(Boolean);
  const firstLine = lines[0] || '';
  const outputPrefix = titlePrefixFromOutputType(outputType);
  if (artifactType === 'question') {
    const questionTitle = firstLine || `Question from ${clean(contextTitle) || 'agent'}`;
    return truncate(questionTitle.endsWith('?') ? questionTitle : `${questionTitle.replace(/[.]+$/, '')}?`, 160);
  }
  if (artifactType === 'note' && outputPrefix) {
    const safeContextTitle = clean(contextTitle);
    return truncate(
      safeContextTitle ? `${outputPrefix}: ${safeContextTitle}` : outputPrefix,
      160
    );
  }
  if (firstLine && firstLine.length <= 160) return truncate(firstLine, 160);
  if (artifactType === 'concept') return truncate(clean(contextTitle) || 'New concept', 160);
  if (artifactType === 'handoff') return truncate(clean(skillTitle) || 'New handoff', 160);
  return truncate(clean(contextTitle) || clean(skillTitle) || 'New draft', 160);
};

const deriveDraftBody = (reply = '') => clean(reply).slice(0, 12000);

const stripMarkdownLine = (value = '') => clean(value)
  .replace(/^#{1,6}\s*/, '')
  .replace(/^[-*+]\s+/, '')
  .replace(/^\d+\.\s+/, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1');

const deriveDraftSummary = (reply = '') => {
  const lines = clean(reply)
    .split('\n')
    .map((line) => stripMarkdownLine(line))
    .filter(Boolean)
    .filter((line) => line.length >= 24);
  const preferred = lines.find((line) => !/^(summary brief|critique brief|question set|connection map|research brief|synthesis doc|slide outline)\s*:/i.test(line))
    || lines[0]
    || clean(reply);
  return truncate(preferred, 280);
};

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const textToParagraphBlocks = (createBlockId, value = '') => {
  const safe = clean(value);
  if (!safe) return [{ id: createBlockId(), type: 'paragraph', text: '' }];
  const paragraphs = safe.split(/\n{2,}/).map(chunk => clean(chunk)).filter(Boolean);
  return paragraphs.slice(0, 80).map((paragraph) => ({
    id: createBlockId(),
    type: 'paragraph',
    text: paragraph
  }));
};

const textToHtml = (createBlockId, value = '') => {
  const blocks = textToParagraphBlocks(createBlockId, value);
  return blocks.map((block) => `<p>${escapeHtml(block.text).replace(/\n/g, '<br/>')}</p>`).join('');
};

const notebookTagsFromDraft = (draft = {}) => {
  const outputType = clean(draft?.skill?.outputType).toLowerCase();
  const tags = ['agent-draft'];
  if (outputType === 'research_brief_draft') tags.push('research-brief');
  if (outputType === 'synthesis_doc_draft') tags.push('synthesis-doc');
  if (outputType === 'slide_outline_draft') tags.push('slide-outline');
  if (outputType === 'summary_brief') tags.push('summary-brief');
  if (outputType === 'critique_brief') tags.push('critique-brief');
  if (outputType === 'missing_link_report') tags.push('missing-link-report');
  if (outputType === 'concept_health_report') tags.push('concept-health');
  if (outputType === 'workspace_hygiene_report') tags.push('workspace-hygiene');
  if (outputType === 'concept_network_report') tags.push('concept-network');
  if (outputType === 'recurring_hygiene_report') tags.push('recurring-hygiene');
  return Array.from(new Set(tags.filter(Boolean)));
};

const sanitizeAgentArtifactDraftDoc = (doc) => ({
  draftId: clean(doc?._id),
  artifactType: normalizeArtifactType(doc?.artifactType, 'note'),
  status: normalizeArtifactStatus(doc?.status, 'pending'),
  title: clean(doc?.title),
  summary: clean(doc?.summary),
  body: clean(doc?.body),
  sourceThreadId: clean(doc?.sourceThreadId),
  sourceHandoffId: clean(doc?.sourceHandoffId),
  sourceContext: doc?.sourceContext && typeof doc.sourceContext === 'object' ? {
    type: clean(doc.sourceContext.type),
    id: clean(doc.sourceContext.id),
    title: clean(doc.sourceContext.title)
  } : null,
  skill: doc?.skill && typeof doc.skill === 'object' ? {
    id: clean(doc.skill.id),
    title: clean(doc.skill.title),
    outputType: clean(doc.skill.outputType),
    workerRole: clean(doc.skill.workerRole),
    workflow: doc.skill.workflow && typeof doc.skill.workflow === 'object' ? {
      id: clean(doc.skill.workflow.id),
      label: clean(doc.skill.workflow.label),
      track: clean(doc.skill.workflow.track),
      cadence: clean(doc.skill.workflow.cadence),
      loop: Boolean(doc.skill.workflow.loop),
      steps: Array.isArray(doc.skill.workflow.steps)
        ? doc.skill.workflow.steps.map((step) => clean(step)).filter(Boolean)
        : [],
      nextSkills: Array.isArray(doc.skill.workflow.nextSkills)
        ? doc.skill.workflow.nextSkills.map((skill) => ({
            id: clean(skill?.id),
            title: clean(skill?.title),
            workerRole: clean(skill?.workerRole),
            outputType: clean(skill?.outputType),
            instruction: clean(skill?.instruction)
          })).filter((skill) => skill.id && skill.title)
        : []
    } : null
  } : null,
  createdBy: doc?.createdBy && typeof doc.createdBy === 'object' ? {
    actorType: clean(doc.createdBy.actorType),
    actorId: clean(doc.createdBy.actorId)
  } : null,
  promotedTo: doc?.promotedTo && typeof doc.promotedTo === 'object' ? {
    type: clean(doc.promotedTo.type),
    id: clean(doc.promotedTo.id),
    title: clean(doc.promotedTo.title),
    path: clean(doc.promotedTo.path)
  } : null,
  createdAt: doc?.createdAt || null,
  updatedAt: doc?.updatedAt || null
});

const createAgentArtifactDraftFromSkillReply = async ({
  AgentArtifactDraft,
  userId,
  actor,
  reply = '',
  thread = null,
  handoffId = null,
  context = null,
  skillInvocation = {}
} = {}) => {
  const artifactType = artifactTypeFromOutputType(skillInvocation?.outputType);
  const body = deriveDraftBody(reply);
  if (!artifactType || !body || !AgentArtifactDraft) return null;

  const sourceContext = context && typeof context === 'object' ? {
    type: clean(context.type),
    id: clean(context.id),
    title: clean(context.title)
  } : {};

  const created = await AgentArtifactDraft.create({
    userId,
    artifactType,
    status: 'pending',
    title: deriveDraftTitle({
      artifactType,
      reply,
      contextTitle: sourceContext.title,
      skillTitle: skillInvocation?.skillTitle,
      outputType: skillInvocation?.outputType
    }),
    summary: deriveDraftSummary(reply),
    body,
    sourceThreadId: thread?._id || null,
    sourceHandoffId: handoffId || thread?.handoffId || null,
    sourceContext,
    skill: {
      id: clean(skillInvocation?.skillId),
      title: clean(skillInvocation?.skillTitle),
      outputType: clean(skillInvocation?.outputType),
      workerRole: clean(skillInvocation?.workerRole),
      workflow: skillInvocation?.workflow && typeof skillInvocation.workflow === 'object'
        ? {
            id: clean(skillInvocation.workflow.id),
            label: clean(skillInvocation.workflow.label),
            track: clean(skillInvocation.workflow.track),
            cadence: clean(skillInvocation.workflow.cadence),
            loop: Boolean(skillInvocation.workflow.loop),
            steps: Array.isArray(skillInvocation.workflow.steps)
              ? skillInvocation.workflow.steps.map((step) => clean(step)).filter(Boolean)
              : [],
            nextSkills: Array.isArray(skillInvocation.workflow.nextSkills)
              ? skillInvocation.workflow.nextSkills.map((skill) => ({
                  id: clean(skill?.id),
                  title: clean(skill?.title),
                  workerRole: clean(skill?.workerRole),
                  outputType: clean(skill?.outputType),
                  instruction: clean(skill?.instruction)
                })).filter((skill) => skill.id && skill.title)
              : []
          }
        : null
    },
    createdBy: actor && typeof actor === 'object' ? {
      actorType: clean(actor.actorType),
      actorId: clean(actor.actorId)
    } : { actorType: 'user', actorId: '' }
  });

  return created;
};

const createAgentArtifactDraftRecord = async ({
  AgentArtifactDraft,
  userId,
  actor,
  payload = {}
} = {}) => {
  if (!AgentArtifactDraft) return null;
  const source = payload && typeof payload === 'object' ? payload : {};
  const skill = source.skill && typeof source.skill === 'object' ? source.skill : {};
  const outputType = clean(skill.outputType || source.outputType);
  const artifactType = normalizeArtifactType(
    source.artifactType || artifactTypeFromOutputType(outputType),
    ''
  );
  const body = deriveDraftBody(source.body || source.content || source.reply || '');
  if (!artifactType || !body) return null;

  const sourceContext = source.sourceContext && typeof source.sourceContext === 'object'
    ? {
        type: clean(source.sourceContext.type),
        id: clean(source.sourceContext.id),
        title: clean(source.sourceContext.title)
      }
    : source.context && typeof source.context === 'object'
      ? {
          type: clean(source.context.type),
          id: clean(source.context.id),
          title: clean(source.context.title)
        }
      : {};

  return AgentArtifactDraft.create({
    userId,
    artifactType,
    status: 'pending',
    title: clean(source.title) || deriveDraftTitle({
      artifactType,
      reply: body,
      contextTitle: sourceContext.title,
      skillTitle: skill.title || source.skillTitle,
      outputType
    }),
    summary: clean(source.summary) || deriveDraftSummary(body),
    body,
    sourceThreadId: clean(source.sourceThreadId || source.threadId) || null,
    sourceHandoffId: clean(source.sourceHandoffId || source.handoffId) || null,
    sourceContext,
    skill: {
      id: clean(skill.id || source.skillId),
      title: clean(skill.title || source.skillTitle),
      outputType,
      workerRole: clean(skill.workerRole || source.workerRole),
      workflow: source.workflow && typeof source.workflow === 'object'
        ? {
            id: clean(source.workflow.id),
            label: clean(source.workflow.label),
            track: clean(source.workflow.track),
            cadence: clean(source.workflow.cadence),
            loop: Boolean(source.workflow.loop),
            steps: Array.isArray(source.workflow.steps)
              ? source.workflow.steps.map((step) => clean(step)).filter(Boolean)
              : [],
            nextSkills: Array.isArray(source.workflow.nextSkills)
              ? source.workflow.nextSkills.map((item) => ({
                  id: clean(item?.id),
                  title: clean(item?.title),
                  workerRole: clean(item?.workerRole),
                  outputType: clean(item?.outputType),
                  instruction: clean(item?.instruction)
                })).filter((item) => item.id && item.title)
              : []
          }
        : null
    },
    createdBy: actor && typeof actor === 'object' ? {
      actorType: clean(actor.actorType),
      actorId: clean(actor.actorId)
    } : { actorType: 'user', actorId: '' }
  });
};

const promoteAgentArtifactDraftRecord = async ({
  draft,
  userId,
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
} = {}) => {
  if (!draft) return { draft: null, promoted: null };

  let promoted = null;
  let promotedTo = null;

  if (draft.artifactType === 'note') {
    const blocks = textToParagraphBlocks(createBlockId, draft.body);
    const created = await NotebookEntry.create({
      userId,
      title: clean(draft.title) || 'Untitled note',
      content: textToHtml(createBlockId, draft.body),
      blocks,
      type: 'note',
      tags: notebookTagsFromDraft(draft)
    });
    await syncNotebookReferences(userId, created._id, blocks);
    enqueueNotebookEmbedding(created);
    promoted = created;
    promotedTo = {
      type: 'notebook',
      id: String(created._id),
      title: clean(created.title),
      path: `/think?tab=notebook&entryId=${created._id}`
    };
  } else if (draft.artifactType === 'concept') {
    const updated = await updateConceptMeta(userId, clean(draft.title) || 'New concept', {
      description: clean(draft.body)
    });
    promoted = updated;
    promotedTo = {
      type: 'concept',
      id: String(updated?._id || ''),
      title: clean(updated?.name || draft.title),
      path: `/think?tab=concepts&concept=${encodeURIComponent(clean(updated?.name || draft.title))}`
    };
  } else if (draft.artifactType === 'question') {
    const blocks = textToParagraphBlocks(createBlockId, draft.body);
    const conceptName = clean(draft?.sourceContext?.type).toLowerCase() === 'concept'
      ? clean(draft?.sourceContext?.title)
      : '';
    const created = await Question.create({
      userId,
      text: clean(draft.title) || 'New question?',
      status: 'open',
      linkedTagName: conceptName,
      conceptName,
      blocks
    });
    enqueueQuestionEmbedding(created);
    promoted = created;
    promotedTo = {
      type: 'question',
      id: String(created._id),
      title: clean(created.text),
      path: `/think?tab=questions&questionId=${created._id}`
    };
  } else if (draft.artifactType === 'handoff') {
    const createdBy = { actorType: 'user', actorId: String(userId) };
    const requestedActor = { actorType: 'native_agent', actorId: '' };
    const title = clean(draft.title) || 'New handoff';
    const objective = clean(draft.body);
    const handoff = await AgentHandoff.create({
      userId,
      title,
      taskType: 'custom',
      objective,
      status: 'pending',
      priority: 'normal',
      context: {
        sourceDraftId: String(draft._id),
        sourceThreadId: clean(draft.sourceThreadId),
        sourceContext: draft.sourceContext || {}
      },
      input: {},
      output: {},
      plan: buildDefaultHandoffPlan({ taskType: 'custom', title, objective }),
      checkpoint: buildDefaultHandoffCheckpoint({ title, requestedActor }),
      requestedActor,
      createdBy,
      events: [{
        eventType: 'created',
        actor: createdBy,
        note: 'Promoted from agent draft.',
        payload: { sourceDraftId: String(draft._id) }
      }]
    });
    const thread = await createThreadForHandoff({
      userId,
      title,
      objective,
      taskType: 'custom',
      requestedActor,
      createdBy,
      handoffId: handoff._id
    });
    handoff.threadId = thread._id;
    await handoff.save();
    promoted = sanitizeAgentHandoffDoc(handoff);
    promotedTo = {
      type: 'handoff',
      id: String(handoff._id),
      title: clean(handoff.title),
      path: `/think?tab=handoffs&handoffId=${handoff._id}`
    };
  } else {
    const error = new Error('Unsupported draft type.');
    error.status = 400;
    throw error;
  }

  draft.status = 'promoted';
  draft.promotedTo = promotedTo || {};
  await draft.save();

  return {
    draft,
    promoted
  };
};

module.exports = {
  normalizeArtifactType,
  normalizeArtifactStatus,
  artifactTypeFromOutputType,
  deriveDraftSummary,
  sanitizeAgentArtifactDraftDoc,
  createAgentArtifactDraftFromSkillReply,
  createAgentArtifactDraftRecord,
  promoteAgentArtifactDraftRecord
};
