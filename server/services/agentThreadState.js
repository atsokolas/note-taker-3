const {
  inferWorkerRoleFromPlanKind,
  sanitizeAgentPlanner
} = require('./agentWorkerRoles');

const MAX_THREAD_MESSAGE_COUNT = 120;

const THREAD_STATUS_VALUES = new Set(['active', 'archived']);
const THREAD_SCOPE_VALUES = new Set(['global', 'workspace', 'article', 'notebook', 'concept', 'handoff', 'selection']);
const THREAD_ROLE_VALUES = new Set(['system', 'user', 'assistant', 'tool']);
const THREAD_STEP_STATUS_VALUES = new Set(['pending', 'in_progress', 'completed', 'blocked']);
const ACTOR_TYPE_VALUES = new Set(['user', 'native_agent', 'byo_agent']);

const clean = (value) => String(value || '').trim();

const truncate = (value, limit = 240) => {
  const safe = clean(value);
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit).trim()}...`;
};

const normalizeActor = (input = {}, fallbackType = 'user') => {
  const actorType = clean(input?.actorType).toLowerCase();
  return {
    actorType: ACTOR_TYPE_VALUES.has(actorType) ? actorType : fallbackType,
    actorId: clean(input?.actorId)
  };
};

const normalizeThreadStatus = (value, fallback = 'active') => {
  const status = clean(value).toLowerCase();
  return THREAD_STATUS_VALUES.has(status) ? status : fallback;
};

const normalizeThreadScope = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const type = clean(source.type).toLowerCase();
  return {
    type: THREAD_SCOPE_VALUES.has(type) ? type : 'global',
    id: clean(source.id),
    title: clean(source.title),
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {}
  };
};

const normalizeThreadMessage = (input = {}, fallbackRole = 'assistant') => {
  const source = input && typeof input === 'object' ? input : {};
  const role = clean(source.role).toLowerCase();
  return {
    role: THREAD_ROLE_VALUES.has(role) ? role : fallbackRole,
    text: clean(source.text).slice(0, 8000),
    actor: normalizeActor(source.actor || {}, fallbackRole === 'user' ? 'user' : 'native_agent'),
    relatedItems: Array.isArray(source.relatedItems) ? source.relatedItems : [],
    citations: Array.isArray(source.citations) ? source.citations : [],
    suggestedActions: Array.isArray(source.suggestedActions) ? source.suggestedActions : [],
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
    createdAt: source.createdAt ? new Date(source.createdAt) : new Date()
  };
};

const normalizeThreadPlanStep = (input = {}, index = 0) => {
  const source = input && typeof input === 'object' ? input : {};
  const status = clean(source.status).toLowerCase();
  return {
    id: clean(source.id) || `step-${index + 1}`,
    title: truncate(source.title || source.label || `Step ${index + 1}`, 160),
    status: THREAD_STEP_STATUS_VALUES.has(status) ? status : 'pending',
    kind: clean(source.kind).slice(0, 60),
    workerRole: clean(source.workerRole).toLowerCase() || inferWorkerRoleFromPlanKind(source.kind),
    actor: normalizeActor(source.actor || {}, 'native_agent'),
    notes: clean(source.notes).slice(0, 1000)
  };
};

const normalizeThreadPlan = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const steps = Array.isArray(source.steps)
    ? source.steps.map((step, index) => normalizeThreadPlanStep(step, index)).slice(0, 12)
    : [];
  const successCriteria = Array.isArray(source.successCriteria)
    ? source.successCriteria.map(item => truncate(item, 220)).filter(Boolean).slice(0, 8)
    : [];
  return {
    objective: clean(source.objective).slice(0, 4000),
    currentStepId: clean(source.currentStepId),
    successCriteria,
    steps,
    status: normalizeThreadStatus(source.status, 'active')
  };
};

const normalizeThreadCheckpoint = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const openQuestions = Array.isArray(source.openQuestions)
    ? source.openQuestions.map(item => truncate(item, 220)).filter(Boolean).slice(0, 8)
    : [];
  const nextActions = Array.isArray(source.nextActions)
    ? source.nextActions.map(item => truncate(item, 220)).filter(Boolean).slice(0, 8)
    : [];
  return {
    summary: clean(source.summary).slice(0, 2000),
    openQuestions,
    nextActions,
    updatedAt: source.updatedAt ? new Date(source.updatedAt) : new Date(),
    updatedBy: normalizeActor(source.updatedBy || {}, 'native_agent')
  };
};

const normalizeThreadPlanner = (input = {}) => sanitizeAgentPlanner(input || {});

const appendThreadMessage = (thread, message = {}) => {
  if (!thread) return;
  const safeMessage = normalizeThreadMessage(message);
  if (!safeMessage.text) return;
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  messages.push(safeMessage);
  thread.messages = messages.slice(-MAX_THREAD_MESSAGE_COUNT);
  thread.lastActor = safeMessage.actor;
  if (safeMessage.role === 'assistant' && safeMessage.text) {
    thread.summary = truncate(safeMessage.text, 280);
  }
};

const collectUserVisibleMessages = (messages = [], limit = 12) => (
  (Array.isArray(messages) ? messages : [])
    .map((message) => normalizeThreadMessage(message))
    .filter((message) => ['user', 'assistant'].includes(clean(message?.role).toLowerCase()) && clean(message?.text))
    .slice(-Math.max(1, limit))
);

const extractOpenQuestions = (messages = [], limit = 3) => {
  const output = [];
  [...messages]
    .reverse()
    .forEach((message) => {
      if (output.length >= limit) return;
      if (clean(message?.role).toLowerCase() !== 'user') return;
      const text = clean(message?.text);
      if (!text || !text.includes('?')) return;
      const question = truncate(text, 220);
      if (!question || output.includes(question)) return;
      output.push(question);
    });
  return output;
};

const extractSuggestedActions = (messages = [], plan = {}, limit = 3) => {
  const latestAssistant = [...messages].reverse().find((message) => clean(message?.role).toLowerCase() === 'assistant') || null;
  const suggested = Array.isArray(latestAssistant?.suggestedActions)
    ? latestAssistant.suggestedActions
        .map((item) => truncate(
          typeof item === 'string'
            ? item
            : item?.title || item?.label || item?.text || '',
          220
        ))
        .filter(Boolean)
        .slice(0, limit)
    : [];
  if (suggested.length > 0) return suggested;
  const safePlan = normalizeThreadPlan(plan || {});
  const currentStep = safePlan.steps.find((step) => step.id === safePlan.currentStepId)
    || safePlan.steps.find((step) => step.status === 'in_progress')
    || safePlan.steps.find((step) => step.status === 'pending')
    || null;
  return currentStep?.title ? [truncate(currentStep.title, 220)] : [];
};

const compactThreadState = (thread, {
  actor = null,
  force = false
} = {}) => {
  if (!thread) return thread;
  const messages = collectUserVisibleMessages(thread.messages, 12);
  const checkpointActorType = clean(thread?.checkpoint?.updatedBy?.actorType).toLowerCase();
  const canReplaceCheckpoint = force || !thread.checkpoint || checkpointActorType === 'native_agent';
  const shouldCompact = force || !thread.checkpoint || (messages.length >= 6 && canReplaceCheckpoint);

  const safePlan = normalizeThreadPlan(thread.plan || {});
  const nextCurrentStepId = safePlan.currentStepId || safePlan.steps[0]?.id || '';
  const nextSteps = safePlan.steps.map((step) => {
    if (!nextCurrentStepId || step.id !== nextCurrentStepId) return step;
    if (step.status !== 'pending' || messages.length < 2) return step;
    return { ...step, status: 'in_progress' };
  });
  thread.plan = normalizeThreadPlan({
    ...safePlan,
    currentStepId: nextCurrentStepId,
    steps: nextSteps
  });

  if (!shouldCompact) return thread;

  const latestAssistant = [...messages].reverse().find((message) => clean(message?.role).toLowerCase() === 'assistant') || null;
  const latestUser = [...messages].reverse().find((message) => clean(message?.role).toLowerCase() === 'user') || null;
  const summarySource = clean(latestAssistant?.text)
    || clean(thread.summary)
    || clean(latestUser?.text)
    || clean(thread?.plan?.objective)
    || clean(thread?.title);
  if (!summarySource) return thread;

  const updatedBy = normalizeActor(actor || thread.lastActor || latestAssistant?.actor || latestUser?.actor || {}, 'native_agent');
  const openQuestions = extractOpenQuestions(messages, 3);
  const nextActions = extractSuggestedActions(messages, thread.plan || {}, 3);
  thread.summary = truncate(summarySource, 280);
  thread.checkpoint = normalizeThreadCheckpoint({
    summary: truncate(summarySource, 2000),
    openQuestions,
    nextActions,
    updatedBy
  });
  return thread;
};

const threadMessagesToHistory = (messages = []) => (
  (Array.isArray(messages) ? messages : [])
    .filter(message => ['user', 'assistant'].includes(clean(message?.role).toLowerCase()))
    .slice(-16)
    .map((message) => ({
      role: clean(message.role).toLowerCase(),
      text: clean(message.text),
      action: clean(message?.metadata?.action || '')
    }))
    .filter(message => message.text)
);

const sanitizeAgentThreadDoc = (doc) => {
  const messages = Array.isArray(doc?.messages) ? doc.messages : [];
  const scope = normalizeThreadScope(doc?.scope || {});
  const plan = normalizeThreadPlan(doc?.plan || {});
  const checkpoint = doc?.checkpoint ? normalizeThreadCheckpoint(doc.checkpoint) : null;
  const planner = doc?.planner ? normalizeThreadPlanner(doc.planner) : null;
  return {
    threadId: clean(doc?._id),
    title: clean(doc?.title),
    status: normalizeThreadStatus(doc?.status, 'active'),
    summary: clean(doc?.summary),
    scope,
    createdBy: normalizeActor(doc?.createdBy || {}, 'user'),
    lastActor: doc?.lastActor ? normalizeActor(doc.lastActor, 'native_agent') : null,
    handoffId: clean(doc?.handoffId),
    planner,
    plan,
    checkpoint,
    messages: messages.slice(-40).map((message) => {
      const safeMessage = normalizeThreadMessage(message);
      return {
        role: safeMessage.role,
        text: safeMessage.text,
        actor: safeMessage.actor,
        relatedItems: safeMessage.relatedItems,
        citations: safeMessage.citations,
        suggestedActions: safeMessage.suggestedActions,
        metadata: safeMessage.metadata,
        createdAt: safeMessage.createdAt ? new Date(safeMessage.createdAt).toISOString() : null
      };
    }),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null
  };
};

module.exports = {
  MAX_THREAD_MESSAGE_COUNT,
  normalizeActor,
  normalizeThreadStatus,
  normalizeThreadScope,
  normalizeThreadMessage,
  normalizeThreadPlan,
  normalizeThreadCheckpoint,
  normalizeThreadPlanner,
  appendThreadMessage,
  compactThreadState,
  threadMessagesToHistory,
  sanitizeAgentThreadDoc,
  truncate
};
