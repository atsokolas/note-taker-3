const { maintainWikiPage } = require('./wikiMaintenanceService');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { syncWikiPageGraphConnections } = require('./wikiGraphConnectionService');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const duePageQuery = ({ cutoff = new Date(Date.now() - DEFAULT_MAX_AGE_MS) } = {}) => ({
  status: { $ne: 'archived' },
  $or: [
    { 'aiState.lastDraftedAt': null },
    { 'aiState.lastDraftedAt': { $exists: false } },
    { 'aiState.lastDraftedAt': { $lte: cutoff } },
    {
      'adoptedFrom.adoptedAt': { $ne: null },
      $or: [
        { 'aiState.draftStatus': null },
        { 'aiState.draftStatus': { $in: ['idle', 'error'] } }
      ]
    }
  ]
});

const createRun = async ({ WikiMaintenanceRun, page, trigger = 'scheduled' } = {}) => {
  if (!WikiMaintenanceRun || !page) return null;
  const run = new WikiMaintenanceRun({
    userId: page.userId,
    pageId: page._id,
    status: 'running',
    trigger,
    startedAt: new Date(),
    metadata: {
      kind: 'scheduled_page_refresh',
      pageTitle: page.title || ''
    }
  });
  await run.save();
  return run;
};

const finishRun = async ({ run, status = 'completed', summary = '', error = '' } = {}) => {
  if (!run) return null;
  run.status = status;
  run.completedAt = new Date();
  run.summary = summary;
  run.errorMessage = error;
  await run.save();
  return run;
};

const persistScheduledMaintenanceResult = async ({
  page,
  before,
  run,
  models = {},
  summary = ''
} = {}) => {
  if (!page) {
    return {
      saved: false,
      graphSynced: false,
      revisionCreated: false
    };
  }
  if (typeof page.save === 'function') {
    await page.save();
  }
  let graphResult = null;
  if (models.Connection) {
    graphResult = await syncWikiPageGraphConnections({
      Connection: models.Connection,
      userId: page.userId,
      page
    });
  }
  const revision = await createWikiRevision({
    WikiRevision: models.WikiRevision,
    userId: page.userId,
    page,
    before,
    reason: 'agent_maintenance',
    actorType: 'agent',
    maintenanceRunId: run?._id || null,
    summary: summary || page.aiState?.maintenanceSummary || `Scheduled refresh completed for ${page.title || 'wiki page'}.`
  });
  return {
    saved: typeof page.save === 'function',
    graphSynced: Boolean(graphResult?.synced),
    revisionCreated: Boolean(revision?._id || revision)
  };
};

const drainScheduledWikiMaintenance = async ({
  models = {},
  limit = 3,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  maintainWikiPageFn = maintainWikiPage,
  now = new Date()
} = {}) => {
  const {
    WikiPage,
    WikiRevision,
    WikiMaintenanceRun,
    Connection,
    Article,
    NotebookEntry,
    TagMeta,
    Question
  } = models;
  if (!WikiPage) return { processed: 0, failed: 0, skipped: true, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 3, 25));
  const cutoff = new Date(now.getTime() - Math.max(60 * 60 * 1000, Number(maxAgeMs) || DEFAULT_MAX_AGE_MS));
  const pages = await WikiPage.find(duePageQuery({ cutoff }))
    .sort({ 'aiState.lastDraftedAt': 1, updatedAt: 1 })
    .limit(max);
  const results = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    const run = await createRun({ WikiMaintenanceRun, page });
    try {
      const before = snapshotPage(page);
      const maintainedPage = await maintainWikiPageFn({
        page,
        userId: page.userId,
        trigger: 'scheduled',
        models: {
          WikiPage,
          WikiRevision,
          WikiMaintenanceRun,
          Connection,
          Article,
          NotebookEntry,
          TagMeta,
          Question
        }
      });
      const summary = maintainedPage?.aiState?.maintenanceSummary || `Scheduled refresh completed for ${page.title || 'wiki page'}.`;
      const persistence = await persistScheduledMaintenanceResult({
        page: maintainedPage || page,
        before,
        run,
        models: {
          WikiRevision,
          Connection
        },
        summary
      });
      await finishRun({
        run,
        status: 'completed',
        summary
      });
      results.push({ pageId: String(page._id), status: 'completed', ...persistence });
    } catch (error) {
      await finishRun({
        run,
        status: 'failed',
        summary: `Scheduled refresh failed for ${page.title || 'wiki page'}.`,
        error: error.message || 'Scheduled wiki maintenance failed.'
      });
      results.push({ pageId: String(page._id), status: 'failed', error: error.message || String(error) });
    }
  }
  return {
    processed: results.filter(result => result.status === 'completed').length,
    failed: results.filter(result => result.status === 'failed').length,
    results
  };
};

module.exports = {
  DEFAULT_MAX_AGE_MS,
  drainScheduledWikiMaintenance,
  duePageQuery,
  persistScheduledMaintenanceResult
};
