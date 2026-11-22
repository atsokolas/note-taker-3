// Background work the server does on timers while it is awake.
const mongoose = require('mongoose');
const models = require('./models');
const { drainEmbeddingJobQueue } = require('./ai/embeddingJobs');
const { isEmbeddingConfigured } = require('./ai/embed');
const { drainWikiSourceEventQueue } = require('./services/wikiSourceEventWorker');
const { drainScheduledWikiMaintenance } = require('./services/wikiScheduledMaintenanceWorker');
const { drainDueEdgarWatches } = require('./services/edgarWatcherService');
const { drainDueTranscriptWatches } = require('./services/earningsTranscriptWatcherService');
const { drainDueGitHubRepoWatches } = require('./services/githubRepoWatcherService');
const { drainDueReadingWatches } = require('./services/readingWatcherService');
const { drainDueMorningPaperEmails } = require('./services/morningPaperEmailService');
const { drainDueReadwiseSyncs } = require('./services/readwiseSyncWorker');
const { runDailyWikiRetention } = require('./services/wikiAutomaticRetentionService');
const { recoverInterruptedDossierBuilds } = require('./services/wikiDossierBuildReliabilityService');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const env = process.env;
const number = (name, fallback) => Number(env[name] || fallback);
const isOn = name => env[name] === 'true';

// Now if Mongo is open, otherwise the moment it opens.
const whenConnected = start => (
  mongoose.connection.readyState === 1 ? start() : mongoose.connection.once('open', start)
);

// One run at a time, only with Mongo open, and a failure is logged rather than thrown.
const job = (name, work) => {
  let running = false;
  return async () => {
    if (running || mongoose.connection.readyState !== 1) return;
    running = true;
    try {
      await work();
    } catch (error) {
      console.error(`[${name}] failed:`, error);
    } finally {
      running = false;
    }
  };
};

const sourceEventsOf = result => result.results.reduce((sum, row) => sum + (Number(row.sourceEvents) || 0), 0);

// A watcher reads the world's clock (filings, transcripts, repos, reading) into source events.
const watcher = (name, drain, prefix, { limit, maxAgeMs, floorMs, everyMs, runOnStart }) => ({
  name,
  off: isOn(`${prefix}_WORKER_DISABLED`),
  everyMs: Math.max(floorMs, number(`${prefix}_WORKER_INTERVAL_MS`, everyMs)),
  runOnStart,
  work: async () => {
    const result = await drain({
      models: { WikiPage: models.WikiPage, WikiSourceEvent: models.WikiSourceEvent },
      limit: number(`${prefix}_WORKER_BATCH_SIZE`, limit),
      maxAgeMs: number(`${prefix}_MAX_AGE_MS`, maxAgeMs)
    });
    if (result.processed || result.failed) {
      console.log(`[${name}] processed=${result.processed} failed=${result.failed} sourceEvents=${sourceEventsOf(result)}`);
    } else if (result.skipped && result.reason === 'paid_sources_disabled' && isOn(`${prefix}_LOG_MISSING_KEY`)) {
      console.log(`[${name}] skipped: paid data sources disabled`);
    }
  }
});

const workers = () => {
  const {
    WikiSourceEvent, WikiPage, WikiProposal, WikiRevision, WikiMaintenanceRun, NoeisReceipt, WikiBriefingCache,
    Connection, Article, NotebookEntry, TagMeta, Question, User, WikiPageVisit, MorningPaperDelivery,
    ImportSession, Folder, ReturnQueueEntry, EmbeddingJob
  } = models;
  const reading = { Connection, Article, NotebookEntry, TagMeta, Question };
  return [
    {
      name: 'wiki-worker',
      off: isOn('WIKI_SOURCE_EVENT_WORKER_DISABLED'),
      everyMs: Math.max(15000, number('WIKI_SOURCE_EVENT_WORKER_INTERVAL_MS', MINUTE)),
      runOnStart: true,
      work: async () => {
        const result = await drainWikiSourceEventQueue({
          models: { WikiSourceEvent, WikiPage, WikiProposal, WikiRevision, WikiMaintenanceRun, NoeisReceipt, WikiBriefingCache, ...reading },
          limit: number('WIKI_SOURCE_EVENT_WORKER_BATCH_SIZE', 10),
          perUserLimit: number('WIKI_SOURCE_EVENT_WORKER_PER_USER', 3)
        });
        if (result.processed || result.failed) console.log(`[wiki-worker] processed=${result.processed} failed=${result.failed}`);
      }
    },
    watcher('edgar-watch-worker', drainDueEdgarWatches, 'EDGAR_WATCH', {
      limit: 10, maxAgeMs: 6 * HOUR, floorMs: 15 * MINUTE, everyMs: 6 * HOUR, runOnStart: isOn('EDGAR_WATCH_RUN_ON_START')
    }),
    watcher('transcript-watch-worker', drainDueTranscriptWatches, 'TRANSCRIPT_WATCH', {
      limit: 5, maxAgeMs: 24 * HOUR, floorMs: HOUR, everyMs: 24 * HOUR, runOnStart: isOn('TRANSCRIPT_WATCH_RUN_ON_START')
    }),
    watcher('github-repo-watch-worker', drainDueGitHubRepoWatches, 'GITHUB_REPO_WATCH', {
      limit: 5, maxAgeMs: 6 * HOUR, floorMs: HOUR, everyMs: 6 * HOUR, runOnStart: env.GITHUB_REPO_WATCH_RUN_ON_START !== 'false'
    }),
    watcher('reading-watch-worker', drainDueReadingWatches, 'READING_WATCH', {
      limit: 10, maxAgeMs: 6 * HOUR, floorMs: 15 * MINUTE, everyMs: 6 * HOUR, runOnStart: isOn('READING_WATCH_RUN_ON_START')
    }),
    {
      name: 'morning-paper-email-worker',
      off: isOn('MORNING_PAPER_EMAIL_WORKER_DISABLED'),
      everyMs: Math.max(15 * MINUTE, number('MORNING_PAPER_EMAIL_WORKER_INTERVAL_MS', 15 * MINUTE)),
      runOnStart: isOn('MORNING_PAPER_EMAIL_RUN_ON_START'),
      work: async () => {
        const result = await drainDueMorningPaperEmails({
          models: {
            User, WikiPage, WikiRevision, WikiSourceEvent, WikiMaintenanceRun, WikiBriefingCache, WikiPageVisit,
            MorningPaperDelivery, NoeisReceipt, ImportSession, Folder, ReturnQueueEntry, ...reading
          },
          limit: number('MORNING_PAPER_EMAIL_BATCH_SIZE', 50)
        });
        if (result.due || result.failed) {
          console.log(`[morning-paper-email-worker] due=${result.due} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
        }
      }
    },
    {
      name: 'embedding-worker',
      off: !isEmbeddingConfigured() || isOn('EMBEDDING_JOB_WORKER_DISABLED'),
      everyMs: Math.max(15000, number('EMBEDDING_JOB_WORKER_INTERVAL_MS', MINUTE)),
      runOnStart: true,
      work: async () => {
        const result = await drainEmbeddingJobQueue({ model: EmbeddingJob, limit: number('EMBEDDING_JOB_WORKER_BATCH_SIZE', 5) });
        if (result.processed || result.failed) console.log(`[embedding-worker] processed=${result.processed} failed=${result.failed}`);
      }
    },
    {
      name: 'wiki-scheduled-maintenance',
      off: isOn('WIKI_SCHEDULED_MAINTENANCE_DISABLED'),
      everyMs: Math.max(15 * MINUTE, number('WIKI_SCHEDULED_MAINTENANCE_INTERVAL_MS', 6 * HOUR)),
      runOnStart: isOn('WIKI_SCHEDULED_MAINTENANCE_RUN_ON_START'),
      work: async () => {
        const result = await drainScheduledWikiMaintenance({
          models: { WikiPage, WikiRevision, WikiMaintenanceRun, ...reading },
          limit: number('WIKI_SCHEDULED_MAINTENANCE_BATCH_SIZE', 3),
          maxAgeMs: number('WIKI_SCHEDULED_MAINTENANCE_MAX_AGE_MS', 24 * HOUR)
        });
        if (result.processed || result.failed) console.log(`[wiki-scheduled-maintenance] processed=${result.processed} failed=${result.failed}`);
      }
    },
    {
      // The durable nextRunAt enforces one daily pass across restarts and instances.
      name: 'wiki-storage-governor',
      off: isOn('WIKI_STORAGE_GOVERNOR_DISABLED'),
      everyMs: 15 * MINUTE,
      runOnStart: env.WIKI_STORAGE_GOVERNOR_RUN_ON_START !== 'false',
      work: async () => {
        const result = await runDailyWikiRetention({ db: mongoose.connection.db });
        if (!result.skipped) console.log('[wiki-storage] Daily cleanup completed', {
          expired: result.expired, payloadBytesReclaimed: result.payloadBytesReclaimed, netBytesReclaimed: result.netBytesReclaimed
        });
      }
    }
  ];
};

// Interrupted dossier builds are picked up again a minute and a half after they stall.
const recoverDossierBuilds = () => recoverInterruptedDossierBuilds({ WikiMaintenanceRun: models.WikiMaintenanceRun, WikiPage: models.WikiPage, graceMs: 90 * 1000 })
  .then(result => { if (result.recovered) console.log(`[dossier-build-recovery] recovered=${result.recovered}`); })
  .catch(error => console.error('[dossier-build-recovery] failed:', error));

const startWorkers = () => whenConnected(() => {
  models.dropLegacyConnectionIndex();
  recoverDossierBuilds();
  setInterval(recoverDossierBuilds, MINUTE).unref?.();
  for (const { name, off, everyMs, runOnStart, work } of workers()) {
    if (off) continue;
    const run = job(name, work);
    setInterval(run, everyMs);
    if (runOnStart) run();
  }
});

// Readwise on a timer: whoever connected keeps getting new highlights without
// pressing anything. Same import as the Sync button; on only with
// READWISE_SYNC_WORKER_ENABLED=true.
const startReadwiseSync = syncConnection => {
  if (!isOn('READWISE_SYNC_WORKER_ENABLED')) return;
  const run = job('readwise-sync-worker', async () => {
    const result = await drainDueReadwiseSyncs({
      IntegrationConnection: models.IntegrationConnection,
      syncConnection,
      maxAgeMs: number('READWISE_SYNC_MAX_AGE_MS', 4 * HOUR)
    });
    if (result.processed || result.failed) {
      console.log(`[readwise-sync-worker] processed=${result.processed} failed=${result.failed} highlights=${result.importedHighlights}`);
    }
  });
  setInterval(run, Math.max(5 * MINUTE, number('READWISE_SYNC_WORKER_INTERVAL_MS', 30 * MINUTE))).unref?.();
};

module.exports = { startWorkers, startReadwiseSync, whenConnected };
