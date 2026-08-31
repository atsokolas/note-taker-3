const { diffRevisionClaims, impactRegister } = require('./wikiClaimImpactService');
const { contractEvent } = require('./consequenceEvent');
const { leaseStaleAfterMs } = require('./wikiSourceEventLease');

const HOUR = 60 * 60 * 1000;
const IMPACT_SLA_MS = 24 * HOUR;
const clean = value => String(value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const id = value => String(value?._id || value?.id || value || '').trim();
const time = value => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(parsed) ? null : parsed;
};
const exec = async query => query?.lean ? query.lean() : query;

const newestBy = (rows, keyFor) => {
  const index = new Map();
  list(rows).forEach(row => {
    const key = keyFor(row);
    if (!key) return;
    const current = index.get(key);
    if (!current || (time(row?.createdAt) || 0) > (time(current?.createdAt) || 0)) index.set(key, row);
  });
  return index;
};

const buildJudgmentAuditRows = ({ events = [], pages = [], revisions = [], runs = [], receipts = [], now = new Date() } = {}) => {
  const pageById = new Map(list(pages).map(page => [id(page), page]));
  const revisionByEvent = newestBy(revisions, row => id(row?.sourceEventId));
  const runByEvent = newestBy(runs, row => id(row?.sourceEventId));
  const receiptByEvent = newestBy(receipts, row => id(row?.provenance?.eventId));
  const nowMs = now.getTime();

  return list(events).flatMap(event => {
    const affectedPages = list(event?.affectedPageIds).map(pageId => pageById.get(id(pageId))).filter(Boolean);
    if (!affectedPages.length) return [];
    const eventId = id(event);
    const revision = revisionByEvent.get(eventId) || null;
    const run = runByEvent.get(eventId) || null;
    const receipt = receiptByEvent.get(eventId) || null;
    const impacts = revision ? diffRevisionClaims(revision) : [];
    const occurredAt = event?.sourceUpdatedAt || event?.createdAt || null;
    const occurredMs = time(occurredAt);
    const open = ['pending', 'processing', 'failed'].includes(clean(event?.status));
    const ignored = clean(event?.status) === 'ignored';
    const leaseExpired = clean(event?.status) === 'processing'
      && time(event?.lockedAt) !== null
      && nowMs - time(event.lockedAt) >= leaseStaleAfterMs();
    const disposition = clean(receipt?.provenance?.disposition);
    const settledWithoutRevision = ['preserve', 'reject'].includes(disposition);
    const deferredUntil = time(receipt?.provenance?.reviewAt);
    const deferred = disposition === 'defer' && deferredUntil !== null && deferredUntil > nowMs;
    const missingRequiredRevision = ['accept', 'narrow'].includes(disposition) && !revision;
    const assessment = revision ? impactRegister(impacts) : settledWithoutRevision ? 'neutral' : 'unassessed';
    const assessedAt = revision?.createdAt
      || (settledWithoutRevision ? receipt?.completedAt || receipt?.createdAt : null);
    const overdue = !revision
      && !ignored
      && !settledWithoutRevision
      && !deferred
      && occurredMs !== null
      && nowMs - occurredMs > IMPACT_SLA_MS;

    return [{
      eventId,
      provider: clean(event?.provider),
      title: clean(event?.title || event?.summary || 'Watcher event'),
      occurredAt,
      status: clean(event?.status || 'pending'),
      maintenanceStatus: clean(run?.status || ''),
      pageIds: affectedPages.map(page => id(page)),
      assessment,
      disposition,
      claimImpacts: impacts,
      assessedAt,
      overdue,
      stuck: Boolean(missingRequiredRevision || (open && (overdue || leaseExpired))),
      error: clean(event?.errorMessage || run?.errorMessage || '')
    }];
  });
};

const summarizeJudgmentAudit = rows => {
  const open = rows.filter(row => ['pending', 'processing', 'failed'].includes(row.status));
  const assessed = rows.filter(row => row.assessment !== 'unassessed');
  const oldestOpenAt = open.map(row => time(row.occurredAt)).filter(value => value !== null).sort((a, b) => a - b)[0];
  return {
    status: rows.some(row => row.stuck || row.error) ? 'attention' : open.length ? 'draining' : 'quiet',
    watcherEvents: rows.length,
    openEvents: open.length,
    assessedEvents: assessed.length,
    overdueAssessments: rows.filter(row => row.overdue).length,
    stuckEvents: rows.filter(row => row.stuck).length,
    oldestOpenAt: oldestOpenAt ? new Date(oldestOpenAt).toISOString() : null
  };
};

const buildJudgmentAudit = async ({
  WikiPage,
  WikiSourceEvent,
  WikiRevision,
  WikiMaintenanceRun,
  NoeisReceipt,
  userId,
  now = new Date(),
  lookbackDays = 90
} = {}) => {
  if (!WikiPage?.find || !WikiSourceEvent?.find) {
    return { generatedAt: now.toISOString(), summary: summarizeJudgmentAudit([]), events: [] };
  }
  const since = new Date(now.getTime() - Math.max(1, Number(lookbackDays) || 90) * 24 * HOUR);
  let pageQuery = WikiPage.find({
    userId,
    status: { $ne: 'archived' },
    'judgment.currentJudgment': { $type: 'string', $ne: '' }
  });
  pageQuery = pageQuery.select?.('_id') || pageQuery;
  const pages = list(await exec(pageQuery));
  const pageIds = pages.map(page => page._id);
  if (!pageIds.length) return { generatedAt: now.toISOString(), summary: summarizeJudgmentAudit([]), events: [] };

  let eventQuery = WikiSourceEvent.find({
    userId,
    affectedPageIds: { $in: pageIds },
    createdAt: { $gte: since }
  });
  eventQuery = eventQuery.sort?.({ createdAt: -1 }) || eventQuery;
  eventQuery = eventQuery.limit?.(500) || eventQuery;
  const events = list(await exec(eventQuery)).filter(event => contractEvent(event, { now }).accepted);
  if (!events.length) return { generatedAt: now.toISOString(), summary: summarizeJudgmentAudit([]), events: [] };

  const eventIds = events.map(event => event._id);
  let revisionQuery = WikiRevision?.find
    ? WikiRevision.find({ userId, sourceEventId: { $in: eventIds } })
    : [];
  revisionQuery = revisionQuery.select?.('sourceEventId createdAt before.claims after.claims') || revisionQuery;
  let runQuery = WikiMaintenanceRun?.find
    ? WikiMaintenanceRun.find({ userId, sourceEventId: { $in: eventIds } })
    : [];
  runQuery = runQuery.select?.('sourceEventId status createdAt errorMessage') || runQuery;
  let receiptQuery = NoeisReceipt?.find ? NoeisReceipt.find({
      userId,
      kind: 'consequence_disposition',
      'provenance.eventId': { $in: eventIds }
    }) : [];
  receiptQuery = receiptQuery.select?.('provenance completedAt createdAt') || receiptQuery;
  const [revisions, runs, receipts] = await Promise.all([
    exec(revisionQuery),
    exec(runQuery),
    exec(receiptQuery)
  ]);
  const rows = buildJudgmentAuditRows({ events, pages, revisions, runs, receipts, now });
  return { generatedAt: now.toISOString(), summary: summarizeJudgmentAudit(rows), events: rows };
};

module.exports = {
  IMPACT_SLA_MS,
  buildJudgmentAudit,
  buildJudgmentAuditRows,
  impactRegister,
  summarizeJudgmentAudit
};
