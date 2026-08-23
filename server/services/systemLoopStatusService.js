const { serializeStoredReceipt } = require('./noeisReceiptService');

const LOOP_IDS = Object.freeze([
  'loop.morning-paper',
  'loop.wiki-maintenance',
  'loop.weekly-ai',
  'loop.outcome-review'
]);

const WEEKLY_RECEIPT_KINDS = Object.freeze([
  'weekend_readings_review_requested',
  'weekend_readings_revision_approved',
  'weekend_readings_revision_published'
]);

const clean = (value = '', limit = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const idOf = value => clean(value?._id || value?.id || value, 160);

const iso = value => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const resolveQuery = async (query, { sort = null, select = '' } = {}) => {
  if (!query) return null;
  if (sort && typeof query.sort === 'function') query = query.sort(sort);
  if (select && typeof query.select === 'function') query = query.select(select);
  if (typeof query.lean === 'function') query = query.lean();
  return query;
};

const findLatest = async (Model, query, options = {}) => {
  if (!Model?.findOne) return null;
  return plain(await resolveQuery(Model.findOne(query), {
    sort: options.sort || { updatedAt: -1, createdAt: -1 },
    select: options.select || ''
  }));
};

const countRows = async (Model, query) => {
  if (!Model?.countDocuments) return 0;
  return Number(await Model.countDocuments(query)) || 0;
};

const findLatestReceipt = async ({ NoeisReceipt, userId, kinds, query: binding = {} }) => {
  const row = await findLatest(NoeisReceipt, {
    userId,
    kind: { $in: kinds },
    ...binding
  }, {
    sort: { completedAt: -1, updatedAt: -1 },
    select: 'receiptId kind source sourceLabel status title summary nextAction completedAt createdAt updatedAt'
  });
  if (!row) return null;
  const receipt = serializeStoredReceipt(row);
  return {
    id: receipt.id,
    kind: receipt.kind,
    source: receipt.source,
    sourceLabel: receipt.sourceLabel,
    status: receipt.status,
    title: receipt.title,
    summary: receipt.summary,
    nextAction: receipt.nextAction,
    completedAt: receipt.completedAt,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt
  };
};

const loopState = ({ id, status, reason, updatedAt = null, href = '', receipt = null, metrics = {} }) => ({
  id,
  status,
  reason: clean(reason),
  updatedAt: iso(updatedAt),
  href: clean(href, 1000),
  receipt: receipt || null,
  metrics: metrics && typeof metrics === 'object' ? metrics : {}
});

const buildMaintenanceState = ({ run, receipt }) => {
  if (!run) return loopState({
    id: 'loop.wiki-maintenance',
    status: 'idle',
    reason: 'No durable Wiki maintenance run has been recorded yet.',
    href: '/wiki'
  });
  const status = clean(run.status, 40);
  const pageId = idOf(run.pageId);
  const href = receipt?.nextAction?.href || (pageId ? `/wiki/workspace?page=${encodeURIComponent(pageId)}` : '/wiki');
  const updatedAt = run.completedAt || run.startedAt || run.updatedAt || run.createdAt;
  if (status === 'queued' || status === 'running') return loopState({
    id: 'loop.wiki-maintenance', status: 'running',
    reason: status === 'queued' ? 'A Wiki maintenance run is queued.' : 'Wiki maintenance is running.',
    updatedAt, href, receipt
  });
  if (status === 'failed') return loopState({
    id: 'loop.wiki-maintenance', status: 'error',
    reason: 'The latest Wiki maintenance run failed and can be reviewed safely.',
    updatedAt, href, receipt
  });
  if (status === 'needs_review') return loopState({
    id: 'loop.wiki-maintenance', status: 'needs_review',
    reason: 'Wiki maintenance produced a candidate that needs human review.',
    updatedAt, href, receipt
  });
  if (status !== 'completed') return loopState({
    id: 'loop.wiki-maintenance', status: 'error',
    reason: 'The latest Wiki maintenance run has an unreadable state and needs review.',
    updatedAt, href, receipt
  });
  return loopState({
    id: 'loop.wiki-maintenance', status: 'ready',
    reason: 'The latest Wiki maintenance run completed.',
    updatedAt, href, receipt
  });
};

const buildMorningPaperState = ({ cache, delivery, receipt }) => {
  const deliveryStatus = clean(delivery?.status, 40);
  const href = receipt?.nextAction?.href || '/wiki';
  const updatedAt = delivery?.sentAt || delivery?.failedAt || delivery?.attemptedAt || cache?.generatedAt || cache?.updatedAt;
  if (deliveryStatus === 'attempting') return loopState({
    id: 'loop.morning-paper', status: 'running', reason: 'Morning Paper delivery is in progress.',
    updatedAt, href, receipt
  });
  if (deliveryStatus === 'failed') return loopState({
    id: 'loop.morning-paper', status: 'error', reason: 'The latest Morning Paper delivery failed; the in-app paper remains available.',
    updatedAt, href, receipt
  });
  if (cache?.generatedAt || deliveryStatus === 'sent') return loopState({
    id: 'loop.morning-paper', status: 'ready', reason: 'The latest Morning Paper is available from durable briefing state.',
    updatedAt, href, receipt
  });
  if (deliveryStatus === 'skipped') return loopState({
    id: 'loop.morning-paper', status: 'idle', reason: 'The latest email delivery was intentionally skipped; no-news days stay quiet.',
    updatedAt, href, receipt
  });
  return loopState({
    id: 'loop.morning-paper', status: 'idle', reason: 'Morning Paper has no durable edition yet.', href
  });
};

const buildWeeklyState = ({ page, receipt }) => {
  if (!page) return loopState({
    id: 'loop.weekly-ai', status: 'idle', reason: 'No This Week in AI edition has been created yet.', href: '/wiki'
  });
  const pageId = idOf(page);
  const href = pageId ? `/wiki/workspace?page=${encodeURIComponent(pageId)}` : '/wiki';
  const updatedAt = receipt?.completedAt || page.updatedAt || page.createdAt;
  if (receipt?.kind === 'weekend_readings_revision_published' && receipt.status === 'published') return loopState({
    id: 'loop.weekly-ai', status: 'ready', reason: 'The latest This Week in AI edition is published.',
    updatedAt, href: receipt?.nextAction?.href || href, receipt
  });
  if (receipt?.kind === 'weekend_readings_revision_approved') return loopState({
    id: 'loop.weekly-ai', status: 'needs_review', reason: 'The latest This Week in AI edition is approved and awaits publication.',
    updatedAt, href, receipt
  });
  if (receipt?.kind === 'weekend_readings_review_requested') return loopState({
    id: 'loop.weekly-ai', status: 'needs_review', reason: 'The latest This Week in AI edition is waiting for human review.',
    updatedAt, href, receipt
  });
  return loopState({
    id: 'loop.weekly-ai', status: 'needs_review', reason: 'A private This Week in AI draft is waiting for editorial review.',
    updatedAt, href, receipt
  });
};

const buildOutcomeState = ({ dueCount, receipt, now = new Date() }) => {
  if (dueCount > 0) return loopState({
    id: 'loop.outcome-review', status: 'needs_review',
    reason: `${dueCount} decision outcome${dueCount === 1 ? ' is' : 's are'} due for human review.`,
    updatedAt: now, href: '/judgment', receipt, metrics: { dueCount }
  });
  if (receipt) return loopState({
    id: 'loop.outcome-review', status: 'ready', reason: 'The latest recorded outcome is durably receipt-bound.',
    updatedAt: receipt.completedAt || receipt.createdAt, href: receipt?.nextAction?.href || '/judgment', receipt,
    metrics: { dueCount: 0 }
  });
  return loopState({
    id: 'loop.outcome-review', status: 'idle', reason: 'No decision outcomes are currently due.', href: '/judgment',
    metrics: { dueCount: 0 }
  });
};

const buildSystemLoopStatus = async ({ userId, models = {}, now = new Date() } = {}) => {
  if (!userId) throw new Error('userId is required.');
  const {
    WikiMaintenanceRun, WikiBriefingCache, MorningPaperDelivery, WikiPage, NoeisReceipt
  } = models;

  const [
    maintenanceRun,
    briefingCache,
    morningDelivery,
    weeklyPage,
    outcomeDueCount
  ] = await Promise.all([
    findLatest(WikiMaintenanceRun, { userId }),
    findLatest(WikiBriefingCache, { userId }, { sort: { generatedAt: -1, updatedAt: -1 } }),
    findLatest(MorningPaperDelivery, { userId }, { sort: { attemptedAt: -1, updatedAt: -1 } }),
    findLatest(WikiPage, {
      userId,
      archived: { $ne: true },
      'createdFrom.label': /^this-week-in-ai:/i
    }, { sort: { 'createdFrom.label': -1, createdAt: -1 } }),
    countRows(WikiPage, {
      userId,
      archived: { $ne: true },
      'judgment.decisions': {
        $elemMatch: {
          status: 'taken',
          outcomeDueAt: { $ne: null, $lte: now },
          'outcome.reviewedAt': null
        }
      }
    })
  ]);

  const [maintenanceReceipt, morningReceipt, weeklyReceipt, outcomeReceipt] = await Promise.all([
    findLatestReceipt({
      NoeisReceipt,
      userId,
      kinds: ['wiki_maintenance'],
      query: maintenanceRun?._id ? { 'provenance.maintenanceRunId': idOf(maintenanceRun._id) } : {}
    }),
    findLatestReceipt({ NoeisReceipt, userId, kinds: ['morning_paper_email'] }),
    findLatestReceipt({
      NoeisReceipt,
      userId,
      kinds: WEEKLY_RECEIPT_KINDS,
      query: weeklyPage?._id ? { 'provenance.pageId': idOf(weeklyPage._id) } : {}
    }),
    findLatestReceipt({ NoeisReceipt, userId, kinds: ['wiki_decision_outcome_recorded'] })
  ]);

  const loops = [
    buildMorningPaperState({ cache: briefingCache, delivery: morningDelivery, receipt: morningReceipt }),
    buildMaintenanceState({ run: maintenanceRun, receipt: maintenanceReceipt }),
    buildWeeklyState({ page: weeklyPage, receipt: weeklyReceipt }),
    buildOutcomeState({ dueCount: outcomeDueCount, receipt: outcomeReceipt, now })
  ];

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    loops: Object.fromEntries(loops.map(loop => [loop.id, loop]))
  };
};

module.exports = {
  LOOP_IDS,
  WEEKLY_RECEIPT_KINDS,
  buildSystemLoopStatus,
  buildMaintenanceState,
  buildMorningPaperState,
  buildOutcomeState,
  buildWeeklyState
};
