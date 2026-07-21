const { isGitHubRepoPage, maintainWikiPage } = require('./wikiMaintenanceService');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { runWikiMaintenanceCandidate } = require('./wikiMaintenancePublicationService');
const {
  acquireRepoBuildLease,
  releaseRepoBuildLease
} = require('./wikiRepoBuildLeaseService');
const { syncWikiPageGraphConnections } = require('./wikiGraphConnectionService');
const { HUMAN_ONLY_WIKI_LABEL_PATTERN, isHumanOnlyWikiArtifact } = require('./wikiProtectedArtifactService');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const duePageQuery = ({ cutoff = new Date(Date.now() - DEFAULT_MAX_AGE_MS) } = {}) => ({
  status: { $ne: 'archived' },
  'createdFrom.label': { $not: HUMAN_ONLY_WIKI_LABEL_PATTERN },
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
  const eligiblePages = (Array.isArray(pages) ? pages : []).filter(page => !isHumanOnlyWikiArtifact(page));
  for (const page of eligiblePages) {
    const run = await createRun({ WikiMaintenanceRun, page });
    let buildLease = null;
    let targetPage = page;
    const repoHeadSha = String(page.externalWatches?.githubRepo?.lastHeadSha || '').trim();
    try {
      if (isGitHubRepoPage({ page }) && repoHeadSha) {
        buildLease = await acquireRepoBuildLease({
          WikiPage,
          pageId: page._id,
          userId: page.userId,
          headSha: repoHeadSha,
          now
        });
        if (!buildLease.acquired) {
          const summary = `Skipped duplicate scheduled repo build for ${page.title || 'wiki page'}.`;
          await finishRun({ run, status: 'completed', summary });
          results.push({ pageId: String(page._id), status: 'skipped', reason: 'lease_active' });
          continue;
        }
        if (buildLease.page) targetPage = buildLease.page;
      }
      const before = snapshotPage(targetPage);
      const publication = await runWikiMaintenanceCandidate({
        page: targetPage,
        userId: targetPage.userId,
        WikiRevision,
        beforeSnapshot: before,
        maintenanceRunId: run?._id || null,
        maintainWikiPageFn,
        maintainArgs: {
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
        }
      });
      const maintainedPage = publication.page;
      if (!publication.promoted) {
        if (typeof maintainedPage.save === 'function') await maintainedPage.save();
        const summary = maintainedPage.aiState?.lastCandidateSummary || `Scheduled candidate needs review for ${targetPage.title || 'wiki page'}.`;
        if (buildLease?.acquired) {
          await releaseRepoBuildLease({
            WikiPage,
            pageId: targetPage._id,
            userId: targetPage.userId,
            token: buildLease.token,
            headSha: repoHeadSha,
            status: 'needs_review',
            error: publication.quality?.failures?.slice(0, 3).join(' ') || 'Candidate did not pass quality.',
            now
          });
          buildLease = null;
        }
        await finishRun({ run, status: 'needs_review', summary });
        results.push({
          pageId: String(page._id),
          status: 'needs_review',
          saved: typeof maintainedPage.save === 'function',
          graphSynced: false,
          revisionCreated: Boolean(publication.rejectedRevision?._id || publication.rejectedRevision)
        });
        continue;
      }
      const summary = maintainedPage?.aiState?.maintenanceSummary || `Scheduled refresh completed for ${page.title || 'wiki page'}.`;
      const persistence = await persistScheduledMaintenanceResult({
        page: maintainedPage || targetPage,
        before,
        run,
        models: {
          WikiRevision,
          Connection
        },
        summary
      });
      if (buildLease?.acquired) {
        await releaseRepoBuildLease({
          WikiPage,
          pageId: targetPage._id,
          userId: targetPage.userId,
          token: buildLease.token,
          headSha: repoHeadSha,
          status: 'ready',
          promoted: true,
          now
        });
        buildLease = null;
      }
      await finishRun({
        run,
        status: 'completed',
        summary
      });
      results.push({ pageId: String(page._id), status: 'completed', ...persistence });
    } catch (error) {
      if (buildLease?.acquired) {
        await releaseRepoBuildLease({
          WikiPage,
          pageId: targetPage._id,
          userId: targetPage.userId,
          token: buildLease.token,
          headSha: repoHeadSha,
          status: 'error',
          error: error.message || 'Scheduled wiki maintenance failed.',
          now
        }).catch(() => null);
      }
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
    needsReview: results.filter(result => result.status === 'needs_review').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    results
  };
};

module.exports = {
  DEFAULT_MAX_AGE_MS,
  drainScheduledWikiMaintenance,
  duePageQuery,
  persistScheduledMaintenanceResult
};
