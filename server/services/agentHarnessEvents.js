const clean = (value) => String(value || '').trim();

const normalizeRunLike = (run = {}) => (
  run && typeof run.toObject === 'function'
    ? run.toObject({ getters: false, virtuals: false })
    : (run && typeof run === 'object' ? run : {})
);

const trackHarnessEvent = ({
  trackEvent,
  event,
  userId = '',
  requestId = '',
  properties = {}
} = {}) => {
  if (typeof trackEvent !== 'function') return;
  const safeEvent = clean(event);
  const safeUserId = clean(userId);
  if (!safeEvent || !safeUserId) return;
  trackEvent({
    event: safeEvent,
    userId: safeUserId,
    requestId: clean(requestId),
    properties
  });
};

const buildRunProperties = ({
  run = {},
  threadId = '',
  bundleId = '',
  source = '',
  extra = {}
} = {}) => {
  const safeRun = normalizeRunLike(run);
  const steps = Array.isArray(safeRun.steps) ? safeRun.steps : [];
  return {
    threadId: clean(threadId || safeRun.threadId),
    runId: clean(safeRun.runId || safeRun._id),
    bundleId: clean(bundleId || safeRun.sourceBundleId),
    source: clean(source),
    status: clean(safeRun.status).toLowerCase(),
    completedStepCount: Number(safeRun.completedStepCount || 0),
    stepCount: steps.length,
    blockedOpId: clean(safeRun.blockedOpId),
    ...extra
  };
};

const trackRunLifecycleEvents = ({
  trackEvent,
  EVENT_NAMES,
  userId = '',
  requestId = '',
  threadId = '',
  run = {},
  source = '',
  includeStarted = false
} = {}) => {
  if (!EVENT_NAMES) return;
  const safeRun = normalizeRunLike(run);
  const properties = buildRunProperties({
    run: safeRun,
    threadId,
    source
  });

  if (includeStarted) {
    trackHarnessEvent({
      trackEvent,
      event: EVENT_NAMES.AGENT_RUN_STARTED,
      userId,
      requestId,
      properties
    });
  }

  const status = clean(safeRun.status).toLowerCase();
  const statusEventByValue = {
    completed: EVENT_NAMES.AGENT_RUN_COMPLETED,
    paused_for_approval: EVENT_NAMES.AGENT_RUN_PAUSED_FOR_APPROVAL,
    awaiting_review: EVENT_NAMES.AGENT_RUN_AWAITING_REVIEW,
    failed: EVENT_NAMES.AGENT_RUN_FAILED
  };
  const statusEvent = statusEventByValue[status];
  if (!statusEvent) return;

  trackHarnessEvent({
    trackEvent,
    event: statusEvent,
    userId,
    requestId,
    properties
  });
};

module.exports = {
  trackHarnessEvent,
  trackRunLifecycleEvents,
  buildRunProperties
};
