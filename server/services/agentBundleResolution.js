const { normalizeProposalBundle } = require('./agentProposalBundles');

const clean = (value) => String(value || '').trim();

const STALE_AFTER_DAYS = 14;

// A pending bundle goes stale after two weeks, or once the reader has moved to
// a different object of the same kind: approving it then would act on a page
// they are no longer looking at.
const isBundleStale = ({
  bundle = {},
  context = {},
  now = new Date()
} = {}) => {
  const safeBundle = normalizeProposalBundle(bundle);
  if (!safeBundle) return false;
  if (!['pending', 'partially_applied'].includes(clean(safeBundle.status).toLowerCase())) return false;

  const createdAt = safeBundle.createdAt ? new Date(safeBundle.createdAt) : null;
  if (createdAt && Number.isFinite(createdAt.getTime())) {
    const ageDays = Math.max(0, new Date(now).getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > STALE_AFTER_DAYS) return true;
  }

  const contextType = clean(context?.type).toLowerCase();
  const contextId = clean(context?.id);
  const bundleId = clean(safeBundle.target?.id);
  return Boolean(
    contextType && contextId && bundleId
    && clean(safeBundle.target?.type).toLowerCase() === contextType
    && bundleId !== contextId
  );
};

const applyProposalBundleInvalidations = ({
  thread = null,
  bundleIds = []
} = {}) => {
  if (!thread) return thread;
  const invalidatedIds = new Set((Array.isArray(bundleIds) ? bundleIds : []).map(clean).filter(Boolean));
  if (invalidatedIds.size === 0) return thread;

  const invalidateBundle = (bundle = null) => {
    const safeBundle = normalizeProposalBundle(bundle);
    if (!safeBundle || !invalidatedIds.has(clean(safeBundle.bundleId))) return bundle;
    return { ...safeBundle, status: 'invalidated' };
  };

  if (Array.isArray(thread.proposalBundles)) {
    thread.proposalBundles = thread.proposalBundles.map(invalidateBundle);
  }
  if (Array.isArray(thread.messages)) {
    thread.messages = thread.messages.map((message) => {
      const safeMessage = message && typeof message === 'object' ? message : {};
      if (!safeMessage.proposalBundle) return safeMessage;
      return { ...safeMessage, proposalBundle: invalidateBundle(safeMessage.proposalBundle) };
    });
  }
  return thread;
};

// Approval names the bundle it approves. Nothing is inferred from chat text, so
// a sentence that happens to contain "do it" can never run a plan.
const resolveRequestedProposalBundle = ({
  thread = null,
  bundleId = '',
  context = {},
  now = new Date()
} = {}) => {
  const bundles = (Array.isArray(thread?.proposalBundles) ? thread.proposalBundles : [])
    .map((bundle) => normalizeProposalBundle(bundle))
    .filter(Boolean);
  const invalidatedBundleIds = bundles
    .filter((bundle) => isBundleStale({ bundle, context, now }))
    .map((bundle) => clean(bundle.bundleId));
  const requested = bundles.find((bundle) => clean(bundle.bundleId) === clean(bundleId)) || null;
  const executable = requested
    && clean(requested.status).toLowerCase() === 'pending'
    && !invalidatedBundleIds.includes(clean(requested.bundleId));

  return {
    status: executable ? 'matched' : 'none',
    bundle: executable ? requested : null,
    invalidatedBundleIds
  };
};

module.exports = {
  resolveRequestedProposalBundle,
  applyProposalBundleInvalidations
};
