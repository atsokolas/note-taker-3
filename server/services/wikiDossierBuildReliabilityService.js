const BUILD_KIND = 'company_dossier_build';
const MAX_STAGE_RECEIPTS = 80;

const plain = value => (
  value?.toObject ? value.toObject({ virtuals: false }) : { ...(value || {}) }
);

const clean = (value = '', limit = 500) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const isCompanyDossier = page => /^company-dossier:/i.test(String(page?.createdFrom?.label || ''));

const createDossierBuildRun = async ({
  WikiMaintenanceRun,
  page,
  userId,
  resume = false,
  now = new Date()
} = {}) => {
  if (!WikiMaintenanceRun || !page || !isCompanyDossier(page)) return null;
  const priorStage = clean(page.aiState?.build?.lastCompletedStage || page.aiState?.build?.lastStage || '', 80);
  const run = new WikiMaintenanceRun({
    userId,
    pageId: page._id,
    status: 'running',
    trigger: 'manual',
    summary: resume ? 'Resuming an interrupted company dossier build.' : 'Building a company dossier.',
    startedAt: now,
    metadata: {
      kind: BUILD_KIND,
      resume,
      resumedFromStage: resume ? priorStage : '',
      lastStage: 'starting',
      lastHeartbeatAt: now,
      stages: [{
        stage: 'starting',
        summary: resume ? 'Resuming from saved SEC evidence.' : 'Company dossier build started.',
        attempt: 1,
        at: now,
        elapsedMs: 0
      }]
    }
  });
  await run.save();
  return run;
};

const recordDossierBuildStage = async ({
  run,
  stage = '',
  summary = '',
  attempt = 1,
  details = {},
  now = new Date()
} = {}) => {
  if (!run) return null;
  const metadata = plain(run.metadata);
  const stages = Array.isArray(metadata.stages) ? metadata.stages.slice() : [];
  const startedAt = new Date(run.startedAt || now).getTime();
  const previousAt = stages.length ? new Date(stages.at(-1)?.at || run.startedAt || now).getTime() : startedAt;
  const safeStage = clean(stage || 'working', 80);
  stages.push({
    stage: safeStage,
    summary: clean(summary || 'Build stage updated.'),
    attempt: Math.max(1, Number(attempt) || 1),
    at: now,
    elapsedMs: Math.max(0, now.getTime() - startedAt),
    durationMs: Math.max(0, now.getTime() - previousAt),
    ...details
  });
  run.metadata = {
    ...metadata,
    lastStage: safeStage,
    lastHeartbeatAt: now,
    stages: stages.slice(-MAX_STAGE_RECEIPTS)
  };
  run.markModified?.('metadata');
  await run.save();
  return run;
};

const finishDossierBuildRun = async ({
  run,
  status = 'completed',
  summary = '',
  errorMessage = '',
  now = new Date()
} = {}) => {
  if (!run) return null;
  run.status = status;
  run.summary = clean(summary || (status === 'completed' ? 'Company dossier build completed.' : 'Company dossier build stopped.'));
  run.errorMessage = clean(errorMessage);
  run.completedAt = now;
  const metadata = plain(run.metadata);
  run.metadata = { ...metadata, lastHeartbeatAt: now };
  run.markModified?.('metadata');
  await run.save();
  return run;
};

const touchDossierBuildRun = async ({ run, now = new Date() } = {}) => {
  if (!run || run.status !== 'running') return run || null;
  if (typeof run.updateOne === 'function') {
    await run.updateOne({ $set: { 'metadata.lastHeartbeatAt': now, updatedAt: now } });
    return run;
  }
  const metadata = plain(run.metadata);
  run.metadata = { ...metadata, lastHeartbeatAt: now };
  run.markModified?.('metadata');
  await run.save();
  return run;
};

const recoverInterruptedDossierBuilds = async ({
  WikiMaintenanceRun,
  WikiPage,
  now = new Date(),
  graceMs = 30 * 1000
} = {}) => {
  if (!WikiMaintenanceRun?.find || !WikiPage?.updateOne) return { recovered: 0 };
  const cutoff = new Date(now.getTime() - Math.max(0, Number(graceMs) || 0));
  const query = WikiMaintenanceRun.find({
    status: 'running',
    trigger: 'manual',
    'metadata.kind': BUILD_KIND,
    updatedAt: { $lte: cutoff }
  });
  const runs = await (query.lean?.() || query);
  let recovered = 0;
  for (const raw of (Array.isArray(runs) ? runs : [])) {
    const claimed = await WikiMaintenanceRun.updateOne(
      { _id: raw._id, status: 'running' },
      {
        $set: {
          status: 'failed',
          summary: 'The company dossier build was interrupted and can be resumed.',
          errorMessage: 'The server restarted before the build completed.',
          completedAt: now,
          'metadata.interrupted': true,
          'metadata.interruptedAt': now,
          'metadata.lastHeartbeatAt': now
        }
      }
    );
    if (claimed && Number(claimed.matchedCount ?? claimed.n ?? 1) === 0) continue;
    await WikiPage.updateOne(
      { _id: raw.pageId, userId: raw.userId, 'aiState.draftStatus': 'maintaining' },
      {
        $set: {
          'aiState.draftStatus': 'error',
          'aiState.errorCode': 'WIKI_BUILD_INTERRUPTED',
          'aiState.lastError': 'The build was interrupted partway. Resume it to continue from saved SEC evidence.',
          'aiState.build': {
            resumable: true,
            interruptedAt: now,
            lastStage: raw.metadata?.lastStage || '',
            runId: String(raw._id || '')
          }
        }
      }
    );
    recovered += 1;
  }
  return { recovered };
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const isTransientDossierError = (error = {}) => {
  const status = Number(error.statusCode || error.status || error.response?.status || 0);
  if (status) return [408, 425, 429].includes(status) || status >= 500;
  const code = clean(error.code, 80).toUpperCase();
  if (['ABORT_ERR', 'ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return true;
  }
  return true;
};

const withTransientRetries = async ({
  operation,
  attempts = 3,
  delaysMs = [750, 2000],
  onAttempt = null,
  shouldRetry = isTransientDossierError
} = {}) => {
  let lastError;
  const total = Math.max(1, Number(attempts) || 1);
  for (let attempt = 1; attempt <= total; attempt += 1) {
    try {
      await onAttempt?.({ attempt, total });
      return await operation({ attempt, total });
    } catch (error) {
      lastError = error;
      if (attempt >= total || !shouldRetry(error)) break;
      await wait(delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] || 0);
    }
  }
  throw lastError;
};

module.exports = {
  BUILD_KIND,
  createDossierBuildRun,
  finishDossierBuildRun,
  isTransientDossierError,
  isCompanyDossier,
  recordDossierBuildStage,
  recoverInterruptedDossierBuilds,
  touchDossierBuildRun,
  withTransientRetries
};
