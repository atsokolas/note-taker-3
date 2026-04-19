const { normalizeProposalBundle } = require('./agentProposalBundles');

const clean = (value) => String(value || '').trim();

const tokenize = (value = '') => (
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
);

const EXECUTION_INTENT_PATTERNS = [
  /^(do it|do that|apply that|apply it|go ahead|yes|yes please|okay|ok|sure|pull that in|pull them in|bring that in|bring them in|rewrite it|rewrite that|use that|continue)$/i,
  /\b(do it|apply that|apply it|go ahead|rewrite it|rewrite that|pull that in|bring that in)\b/i
];

const shouldResolveExecutionIntent = (message = '') => {
  const safeMessage = clean(message);
  if (!safeMessage) return false;
  return EXECUTION_INTENT_PATTERNS.some((pattern) => pattern.test(safeMessage));
};

const buildMessageText = (message = {}) => [
  clean(message?.text),
  clean(message?.proposalBundle?.title)
].filter(Boolean).join(' ');

const buildBundleSearchText = (bundle = {}) => {
  const safeBundle = normalizeProposalBundle(bundle);
  if (!safeBundle) return '';
  return [
    safeBundle.title,
    safeBundle.summary,
    safeBundle.target?.title,
    ...(Array.isArray(safeBundle.operations) ? safeBundle.operations.flatMap((operation) => [
      clean(operation?.title),
      clean(operation?.summary),
      clean(operation?.type)
    ]) : [])
  ].filter(Boolean).join(' ');
};

const isBundleStale = ({
  bundle = {},
  context = {},
  now = new Date()
} = {}) => {
  const safeBundle = normalizeProposalBundle(bundle);
  if (!safeBundle) return false;
  const safeStatus = clean(safeBundle.status).toLowerCase();
  if (!['pending', 'partially_applied'].includes(safeStatus)) return false;

  const createdAt = safeBundle.createdAt ? new Date(safeBundle.createdAt) : null;
  if (createdAt && Number.isFinite(createdAt.getTime())) {
    const ageMs = Math.max(0, new Date(now).getTime() - createdAt.getTime());
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 14) return true;
  }

  const contextType = clean(context?.type).toLowerCase();
  const contextId = clean(context?.id);
  const bundleType = clean(safeBundle.target?.type).toLowerCase();
  const bundleId = clean(safeBundle.target?.id);
  if (contextType && contextId && bundleType === contextType && bundleId && bundleId !== contextId) {
    return true;
  }

  return false;
};

const applyProposalBundleInvalidations = ({
  thread = null,
  bundleIds = []
} = {}) => {
  if (!thread) return thread;
  const invalidatedIds = new Set((Array.isArray(bundleIds) ? bundleIds : []).map((bundleId) => clean(bundleId)).filter(Boolean));
  if (invalidatedIds.size === 0) return thread;

  const invalidateBundle = (bundle = null) => {
    const safeBundle = normalizeProposalBundle(bundle);
    if (!safeBundle) return bundle;
    if (!invalidatedIds.has(clean(safeBundle.bundleId))) return bundle;
    return {
      ...safeBundle,
      status: 'invalidated'
    };
  };

  if (Array.isArray(thread.proposalBundles)) {
    thread.proposalBundles = thread.proposalBundles.map(invalidateBundle);
  }
  if (Array.isArray(thread.messages)) {
    thread.messages = thread.messages.map((message) => {
      const safeMessage = message && typeof message === 'object' ? message : {};
      if (!safeMessage.proposalBundle) return safeMessage;
      return {
        ...safeMessage,
        proposalBundle: invalidateBundle(safeMessage.proposalBundle)
      };
    });
  }
  return thread;
};

const scoreBundleCandidate = ({
  bundle = {},
  message = '',
  thread = null,
  context = {}
} = {}) => {
  const safeBundle = normalizeProposalBundle(bundle);
  if (!safeBundle) return { score: -1, reasons: [] };

  const messageText = clean(message).toLowerCase();
  const messageTokens = new Set(tokenize(messageText));
  const bundleText = buildBundleSearchText(safeBundle).toLowerCase();
  const bundleTokens = tokenize(bundleText);
  const bundleTokenSet = new Set(bundleTokens);
  const reasons = [];
  let score = 0;

  const referencedByWords = [...messageTokens].some((token) => bundleTokenSet.has(token));
  if (referencedByWords) {
    score += 60;
    reasons.push('message_keyword_match');
  }

  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const latestProposalMessage = [...messages].reverse().find((entry) => clean(entry?.proposalBundle?.bundleId) === clean(safeBundle.bundleId)) || null;
  if (latestProposalMessage) {
    const recencyBoost = Math.max(1, 20 - Math.min(18, [...messages].reverse().findIndex((entry) => clean(entry?.proposalBundle?.bundleId) === clean(safeBundle.bundleId))));
    score += recencyBoost;
    reasons.push('proposal_message_recency');
  }

  const lastAssistantWithBundle = [...messages].reverse().find((entry) => clean(entry?.role).toLowerCase() === 'assistant' && clean(entry?.proposalBundle?.bundleId));
  if (clean(lastAssistantWithBundle?.proposalBundle?.bundleId) === clean(safeBundle.bundleId) && !referencedByWords) {
    score += 30;
    reasons.push('latest_assistant_bundle');
  }

  const assistantText = buildMessageText(lastAssistantWithBundle).toLowerCase();
  if (assistantText && referencedByWords && assistantText.includes(clean(safeBundle.title).toLowerCase())) {
    score += 20;
    reasons.push('assistant_alignment');
  }

  const contextType = clean(context?.type).toLowerCase();
  const contextId = clean(context?.id);
  if (contextType && contextId && clean(safeBundle.target?.type) === contextType && clean(safeBundle.target?.id) === contextId) {
    score += 10;
    reasons.push('context_target_match');
  }

  const genericExecutionOnly = messageTokens.size === 0 || [...messageTokens].every((token) => ['do', 'it', 'that', 'go', 'ahead', 'apply', 'yes', 'ok', 'okay', 'sure', 'continue', 'use', 'pull', 'bring', 'rewrite'].includes(token));
  if (genericExecutionOnly && !referencedByWords && clean(lastAssistantWithBundle?.proposalBundle?.bundleId) !== clean(safeBundle.bundleId)) {
    score -= 5;
  }

  return { score, reasons };
};

const resolveExecutableProposalBundle = ({
  thread = null,
  message = '',
  context = {},
  now = new Date()
} = {}) => {
  const safeMessage = clean(message);
  const bundles = Array.isArray(thread?.proposalBundles) ? thread.proposalBundles : [];
  const invalidatedBundleIds = bundles
    .map((bundle) => normalizeProposalBundle(bundle))
    .filter(Boolean)
    .filter((bundle) => isBundleStale({ bundle, context, now }))
    .map((bundle) => clean(bundle.bundleId));

  const eligible = bundles
    .map((bundle) => normalizeProposalBundle(bundle))
    .filter(Boolean)
    .filter((bundle) => clean(bundle.status).toLowerCase() === 'pending')
    .filter((bundle) => !invalidatedBundleIds.includes(clean(bundle.bundleId)));

  if (eligible.length === 0) {
    return {
      status: 'none',
      bundle: null,
      candidates: [],
      invalidatedBundleIds
    };
  }

  const scored = eligible
    .map((bundle) => ({
      bundle,
      ...scoreBundleCandidate({
        bundle,
        message,
        thread,
        context
      })
    }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.score < 0) {
    return {
      status: 'none',
      bundle: null,
      candidates: scored,
      invalidatedBundleIds
    };
  }

  const genericExecutionOnly = tokenize(safeMessage).every((token) => ['do', 'it', 'that', 'go', 'ahead', 'apply', 'yes', 'ok', 'okay', 'sure', 'continue', 'use', 'pull', 'bring', 'rewrite'].includes(token));
  const lastUserIndex = Array.isArray(thread?.messages)
    ? [...thread.messages].map((entry) => clean(entry?.role).toLowerCase()).lastIndexOf('user')
    : -1;
  const proposalMessagesSinceLastUser = (Array.isArray(thread?.messages) ? thread.messages : [])
    .slice(lastUserIndex + 1)
    .filter((entry) => clean(entry?.role).toLowerCase() === 'assistant' && clean(entry?.proposalBundle?.bundleId));
  if (genericExecutionOnly && proposalMessagesSinceLastUser.length > 1) {
    return {
      status: 'ambiguous',
      bundle: null,
      candidates: scored.slice(0, 3),
      invalidatedBundleIds
    };
  }

  const second = scored[1];
  const ambiguous = second && Math.abs((best?.score || 0) - (second?.score || 0)) <= 5 && best.score < 70;
  if (ambiguous) {
    return {
      status: 'ambiguous',
      bundle: null,
      candidates: scored.slice(0, 3),
      invalidatedBundleIds
    };
  }

  return {
    status: 'matched',
    bundle: best.bundle,
    candidates: scored,
    invalidatedBundleIds
  };
};

module.exports = {
  shouldResolveExecutionIntent,
  resolveExecutableProposalBundle,
  applyProposalBundleInvalidations
};
