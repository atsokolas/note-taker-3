const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const {
  buildWikiBriefing,
  loadCachedWikiBriefing,
  persistWikiBriefingCache,
  DEFAULT_BRIEFING_CACHE_MAX_AGE_MS
} = require('./wikiBriefingService');
const { evaluateCheckInEligibility } = require('./checkInEligibility');
const { applyFalsifiability } = require('./claimFalsifiability');
const { appendVerdict, selectPaperVerdicts } = require('./claimVerdicts');
const { ensureHeldClaim, findHeldClaim } = require('./heldClaim');
const { buildReviewTriage, expireLowStakesReviews } = require('./reviewTriageService');
const { canonicalWikiTitle } = require('./wikiPresentationGuard');
const { loadConsequenceEvents, selectPaperConsequence } = require('./consequenceRoute');
const {
  activeClaim,
  claimImpactSummary,
  diffRevisionClaims
} = require('./wikiClaimImpactService');
const { WATCHER_PROVIDERS } = require('./watcherPolicy');
const { wordBoundaryTrim } = require('../lib/editorialText');
const { fireAskedBack, fireStickyNotes } = require('./kairosFireService');

// Paid transcript providers are intentionally excluded from the product while
// Noeis operates on free authoritative sources only. Historical rows can remain
// in storage without leaking a permanently misconfigured watcher into Watching.
const ENV_SHAPED_ERROR = /process\.env|[A-Z][A-Z0-9_]{3,}_(?:KEY|TOKEN|SECRET|API)/;
const MORNING_PAPER_OPEN_REUSE_MS = 2 * 60 * 1000;

const clean = (value = '', limit = 1000) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });

const id = (value) => String(value?._id || value || '');
const asPlain = (value) => value?.toObject ? value.toObject({ virtuals: false }) : value;

const execQuery = async (query) => {
  const lean = query?.lean?.() || query;
  return lean;
};

const watcherLabel = (provider = '') => ({
  'sec-edgar': 'EDGAR',
  'github-repo': 'GitHub',
  'reading-feed': 'Reading'
}[provider] || 'Watcher');

const buildWatcherLeads = async ({ userId, models = {}, since = null, limit = 12 } = {}) => {
  if (!models.WikiSourceEvent?.find || !models.WikiPage?.find) return [];
  const query = { userId, provider: { $in: WATCHER_PROVIDERS } };
  if (since) query.createdAt = { $gt: new Date(since) };
  let eventQuery = models.WikiSourceEvent.find(query);
  eventQuery = eventQuery.sort?.({ createdAt: -1 }) || eventQuery;
  eventQuery = eventQuery.limit?.(Math.max(1, Math.min(Number(limit) || 12, 50))) || eventQuery;
  const events = await execQuery(eventQuery) || [];
  if (!events.length) return [];
  const pageIds = Array.from(new Set(events.flatMap(event => (event.affectedPageIds || []).map(id))));
  let pageQuery = models.WikiPage.find({ userId, _id: { $in: pageIds } });
  if (pageQuery.select) pageQuery = pageQuery.select('_id title slug claims externalWatches');
  const pages = await execQuery(pageQuery) || [];
  const pagesById = new Map(pages.map(page => [id(page), asPlain(page)]));
  let revisionQuery = models.WikiRevision?.find
    ? models.WikiRevision.find({ userId, sourceEventId: { $in: events.map(event => event._id) } })
    : [];
  revisionQuery = revisionQuery?.sort?.({ createdAt: -1 }) || revisionQuery;
  const revisions = await execQuery(revisionQuery) || [];
  const revisionByEvent = new Map();
  revisions.forEach(revision => {
    const key = id(revision.sourceEventId);
    if (key && !revisionByEvent.has(key)) revisionByEvent.set(key, asPlain(revision));
  });
  let runQuery = models.WikiMaintenanceRun?.find
    ? models.WikiMaintenanceRun.find({ userId, sourceEventId: { $in: events.map(event => event._id) } })
    : [];
  runQuery = runQuery?.sort?.({ createdAt: -1 }) || runQuery;
  const runs = await execQuery(runQuery) || [];
  const runByEvent = new Map();
  runs.forEach(run => {
    const key = id(run.sourceEventId);
    if (key && !runByEvent.has(key)) runByEvent.set(key, asPlain(run));
  });
  return events.map(eventValue => {
    const event = asPlain(eventValue);
    const pageId = id(event.affectedPageIds?.[0]);
    const page = pagesById.get(pageId) || {};
    const revision = revisionByEvent.get(id(event));
    const run = runByEvent.get(id(event));
    const claimImpacts = revision ? diffRevisionClaims(revision) : [];
    const analyzed = Boolean(revision && claimImpacts.length);
    return {
      eventId: id(event),
      provider: String(event.provider || ''),
      watcherLabel: watcherLabel(event.provider),
      title: clean(event.title || event.summary || 'New watcher event', 280),
      summary: clean(event.summary || '', 500),
      url: String(event.url || ''),
      occurredAt: event.sourceUpdatedAt || event.createdAt || null,
      page: { id: pageId, title: clean(page.title || 'Affected wiki page', 180), slug: String(page.slug || '') },
      maintenanceStatus: String(run?.status || (event.status === 'processed' ? 'completed' : event.status || 'queued')),
      analyzed,
      claimImpacts,
      impactSummary: analyzed ? claimImpactSummary(claimImpacts) : 'not yet analyzed — queued',
      href: pageId ? `/wiki/workspace?page=${encodeURIComponent(pageId)}` : '/wiki'
    };
  });
};

const sourceCount = (claim = {}) => Math.max(
  Array.isArray(claim.sourceRefIds) ? claim.sourceRefIds.length : 0,
  Array.isArray(claim.citationIds) ? claim.citationIds.length : 0
);

const selectDailyClaimCheckIn = ({ pages = [], watcherLeads = [], now = Date.now(), skipKeys = new Set() } = {}) => {
  const impacted = new Map();
  watcherLeads.forEach((lead, leadIndex) => lead.claimImpacts.forEach(impact => {
    impacted.set(`${lead.page.id}:${impact.claimId}`, leadIndex);
  }));
  const candidates = [];
  pages.forEach(pageValue => {
    const page = asPlain(pageValue);
    (Array.isArray(page.claims) ? page.claims : []).forEach(claimValue => {
      const claim = asPlain(claimValue);
      const eligibility = evaluateCheckInEligibility({ page, claim, now });
      if (!eligibility.eligible) return;
      const key = `${id(page)}:${claim.claimId}`;
      if (skipKeys.has(key)) return;
      const watcherRank = impacted.has(key) ? impacted.get(key) : Number.MAX_SAFE_INTEGER;
      candidates.push({
        pageId: id(page),
        pageTitle: clean(canonicalWikiTitle(page, 'Untitled wiki page'), 180),
        claimId: String(claim.claimId),
        text: eligibility.text,
        support: String(claim.support || 'unsupported'),
        sourceCount: sourceCount(claim),
        lastCheckedAt: claim.lastCheckedAt || null,
        adoptedAt: claim.bornAt || claim.createdAt || page.createdAt || null,
        resolutionCriteria: clean(claim.resolutionCriteria, 800),
        horizon: claim.horizon || null,
        changedSinceLastCheck: watcherRank !== Number.MAX_SAFE_INTEGER,
        href: `/wiki/workspace?page=${encodeURIComponent(id(page))}&claimId=${encodeURIComponent(claim.claimId)}`,
        _watcherRank: watcherRank,
        _visited: page.lastVisitedAt ? 0 : 1,
        _unreviewed: claim.checkInStatus === 'unreviewed' ? 0 : 1
      });
    });
  });
  candidates.sort((a, b) => (
    a._watcherRank - b._watcherRank
    || a._visited - b._visited
    || a._unreviewed - b._unreviewed
    || new Date(a.lastCheckedAt || a.adoptedAt || 0).getTime() - new Date(b.lastCheckedAt || b.adoptedAt || 0).getTime()
  ));
  if (!candidates.length) return null;
  const { _watcherRank, _visited, _unreviewed, ...selected } = candidates[0];
  return selected;
};

const listWatching = (pages = []) => (Array.isArray(pages) ? pages : []).flatMap(pageValue => {
  const page = asPlain(pageValue);
  const watches = page.externalWatches || {};
  const rows = [];
  const push = (type, watch, label, detail, lastEventAt) => {
    if (!watch || watch.status === 'idle' || (!watch.status && !detail)) return;
    if (type === 'earnings_transcript' || /transcript/i.test(label)) return;
    if (watch.status === 'unconfigured' || watch.configured === false) return;
    const errorMessage = ENV_SHAPED_ERROR.test(watch.errorMessage || '')
      ? ''
      : clean(watch.errorMessage || '', 300);
    rows.push({
      id: `${id(page)}:${type}`,
      type,
      label,
      detail,
      status: watch.status || 'active',
      page: { id: id(page), title: clean(canonicalWikiTitle(page, 'Untitled wiki page'), 180), slug: String(page.slug || '') },
      lastCheckedAt: watch.lastCheckedAt || null,
      lastEventAt: lastEventAt || null,
      errorMessage
    });
  };
  push('sec_edgar', watches.edgar, `EDGAR · ${watches.edgar?.ticker || watches.edgar?.cik || ''}`, watches.edgar?.lastAccessionNumber || 'Awaiting filing', watches.edgar?.lastFilingAt);
  push('github', watches.githubRepo, `GitHub · ${[watches.githubRepo?.owner, watches.githubRepo?.repo].filter(Boolean).join('/')}`, watches.githubRepo?.lastHeadSha ? `head ${String(watches.githubRepo.lastHeadSha).slice(0, 7)}` : 'Awaiting repository head', watches.githubRepo?.lastPublishedAt);
  push('reading', watches.reading, `Reading · ${watches.reading?.label || ''}`, watches.reading?.lastItemTitle || watches.reading?.canonicalFeedUrl || watches.reading?.feedUrl || 'Awaiting feed item', watches.reading?.lastItemAt);
  return rows;
});

const buildDailyLoopBriefing = async ({ userId, models = {}, now = new Date(), advanceCursor = false, maxAgeMs = DEFAULT_BRIEFING_CACHE_MAX_AGE_MS } = {}) => {
  const user = await models.User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }
  if (advanceCursor && models.WikiBriefingCache) {
    const cached = await loadCachedWikiBriefing({
      userId,
      WikiBriefingCache: models.WikiBriefingCache,
      now: now.getTime(),
      maxAgeMs
    });
    const generatedAt = new Date(cached?.generatedAt || 0).getTime();
    if (cached?.window?.cursorAdvancedBy === 'morning_paper_open'
      && generatedAt
      && now.getTime() - generatedAt <= MORNING_PAPER_OPEN_REUSE_MS) {
      return { briefing: cached, user };
    }
  }
  const priorOpenedAt = user.morningPaper?.lastOpenedAt || new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowMs = Math.max(60 * 1000, Math.min(now.getTime() - new Date(priorOpenedAt).getTime(), 90 * 24 * 60 * 60 * 1000));
  const [baseBriefing, watcherLeads, pages, visits, consequenceEvents] = await Promise.all([
    buildWikiBriefing({ userId, models, now: now.getTime(), windowMs }),
    buildWatcherLeads({ userId, models, since: priorOpenedAt }),
    models.WikiPage.find({ userId, status: { $ne: 'archived' } }).select('_id title slug pageType claims externalWatches createdAt updatedAt createdFrom aiState.candidateStatus freshness.status freshness.pendingSourceEventIds freshness.lastSourceEventAt freshness.lastReviewedAt judgment.kind judgment.currentJudgment judgment.falsifiers judgment.why judgment.decisions judgment.dependsOn judgment.resolutionCriteria judgment.resolutionHorizonAt judgment.lastReviewedAt activeCompanyDossierKey investmentDossier.version').lean(),
    models.WikiPageVisit?.find
      ? models.WikiPageVisit.find({ userId }).select('pageId lastVisitedAt').lean()
      : Promise.resolve([]),
    loadConsequenceEvents({ userId, models, since: priorOpenedAt })
  ]);
  const visitedAt = new Map((visits || []).map(visit => [String(visit.pageId), visit.lastVisitedAt]));
  const selectionPages = pages.map(page => ({ ...page, lastVisitedAt: visitedAt.get(String(page._id)) || null }));
  const consequence = selectPaperConsequence({
    events: consequenceEvents,
    pages: selectionPages,
    now
  });
  const claimVerdicts = selectPaperVerdicts({ pages: selectionPages, watcherLeads, now });
  const verdictKeys = new Set(claimVerdicts.map(row => `${row.pageId}:${row.claimId}`));
  const timezone = user.morningPaper?.timezone || 'UTC';
  const askedBack = await fireAskedBack({
    userId,
    models,
    now,
    timezone
  });
  const stickyNotes = await fireStickyNotes({
    userId,
    models,
    now,
    timezone
  });
  const briefing = {
    ...baseBriefing,
    window: { since: new Date(priorOpenedAt).toISOString(), through: now.toISOString(), cursorAdvancedBy: advanceCursor ? 'morning_paper_open' : null },
    watcherLeads,
    lead: watcherLeads[0] || null,
    consequence,
    claimCheckIn: consequence
      ? null
      : selectDailyClaimCheckIn({ pages: selectionPages, watcherLeads, now: now.getTime(), skipKeys: verdictKeys }),
    claimVerdicts: consequence ? [] : claimVerdicts,
    reviewTriage: buildReviewTriage({ pages: selectionPages, now: now.getTime() }),
    watching: listWatching(pages),
    checkInStreak: Number(user.morningPaper?.checkInStreak || 0),
    askedBack,
    stickyNotes
  };
  await expireLowStakesReviews({
    WikiPage: models.WikiPage,
    pages: selectionPages,
    userId,
    now: now.getTime()
  }).catch(() => 0);
  await persistWikiBriefingCache({ userId, WikiBriefingCache: models.WikiBriefingCache, briefing, now: now.getTime(), maxAgeMs });
  if (advanceCursor) {
    await models.User.updateOne({ _id: userId }, { $set: { 'morningPaper.lastOpenedAt': now } }, { timestamps: false });
  }
  return { briefing, user };
};

const localDateForTimezone = (date = new Date(), timezone = 'UTC') => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch (_error) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
};

const previousLocalDate = (localDate) => {
  const value = new Date(`${localDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

const recordClaimCheckIn = async ({
  models = {},
  userId,
  pageId,
  claimId,
  action,
  note = '',
  revisedText = '',
  resolutionCriteria,
  horizon,
  now = new Date()
} = {}) => {
  const allowed = new Set(['reaffirmed', 'revised', 'retired', 'restored']);
  if (!allowed.has(action)) {
    const error = new Error('action must be reaffirmed, revised, retired, or restored.');
    error.statusCode = 400;
    throw error;
  }
  const page = await models.WikiPage.findOne({ _id: pageId, userId });
  if (!page) {
    const error = new Error('Wiki page not found.');
    error.statusCode = 404;
    throw error;
  }
  const claim = page.claims.find(row => String(row.claimId) === String(claimId));
  if (!claim) {
    const error = new Error('Claim not found.');
    error.statusCode = 404;
    throw error;
  }
  const retired = claim.checkInStatus === 'retired' || Boolean(claim.retiredAt);
  if (retired && action !== 'restored') {
    const error = new Error('Retired claims must be explicitly restored before another check-in.');
    error.statusCode = 409;
    throw error;
  }
  if (!retired && action === 'restored') {
    const error = new Error('Only a retired claim can be restored.');
    error.statusCode = 409;
    throw error;
  }
  const before = snapshotPage(page);
  if (action === 'revised' && clean(revisedText)) claim.text = clean(revisedText, 800);
  applyFalsifiability(claim, { resolutionCriteria, horizon });
  claim.checkInStatus = action === 'restored' ? 'unreviewed' : action;
  claim.lastCheckedAt = now;
  if (action === 'retired') claim.retiredAt = now;
  if (action === 'restored') {
    claim.retiredAt = null;
    claim.restoredAt = now;
  }
  claim.history.push({
    at: now,
    event: action,
    action,
    actorType: 'user',
    note: clean(note, 500),
    support: claim.support || 'unsupported',
    text: claim.text,
    section: claim.section || '',
    citationIds: claim.citationIds || [],
    sourceRefIds: claim.sourceRefIds || [],
    contradictedByCitationIds: claim.contradictedByCitationIds || [],
    summary: action === 'restored' ? 'Claim explicitly restored by the owner.' : `Claim ${action} by the owner.`
  });
  if (typeof page.markModified === 'function') page.markModified('claims');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision: models.WikiRevision,
    userId,
    page,
    before,
    reason: 'user_edit',
    actorType: 'user',
    summary: `Claim ${claim.claimId} ${action}.`
  });
  let streak = 0;
  if (models.User?.findById) {
    const user = await models.User.findById(userId);
    if (user) {
      const timezone = user.morningPaper?.timezone || 'UTC';
      const today = localDateForTimezone(now, timezone);
      const prior = user.morningPaper?.lastCheckInLocalDate || '';
      streak = prior === today
        ? Number(user.morningPaper?.checkInStreak || 0)
        : prior === previousLocalDate(today)
          ? Number(user.morningPaper?.checkInStreak || 0) + 1
          : 1;
      user.morningPaper = { ...(asPlain(user.morningPaper) || {}), lastCheckInLocalDate: today, checkInStreak: streak };
      await user.save({ timestamps: false });
    }
  }
  const bornAt = claim.bornAt || claim.createdAt || now;
  const heldDays = Math.max(0, Math.floor((now.getTime() - new Date(bornAt).getTime()) / (24 * 60 * 60 * 1000)));
  const actionCount = claim.history.filter(row => ['reaffirmed', 'revised'].includes(String(row.action || row.event))).length;
  return {
    page,
    claim: asPlain(claim),
    revisionId: id(revision),
    acknowledgment: `${action} · ${Math.max(1, actionCount)}${actionCount === 1 ? 'st' : actionCount === 2 ? 'nd' : actionCount === 3 ? 'rd' : 'th'} time · held ${heldDays} days`,
    streak
  };
};

const loadOwnedPage = async ({ models, userId, pageId }) => {
  const page = await models.WikiPage.findOne({ _id: pageId, userId });
  if (!page) {
    const error = new Error('Wiki page not found.');
    error.statusCode = 404;
    throw error;
  }
  return page;
};

const recordClaimFalsifiability = async ({
  models = {},
  userId,
  pageId,
  claimId = '',
  resolutionCriteria,
  horizon,
  now = new Date()
} = {}) => {
  const page = await loadOwnedPage({ models, userId, pageId });
  const before = snapshotPage(page);
  const claim = findHeldClaim(page, claimId) || ensureHeldClaim(page, { now, actorType: 'user', claimId });
  if (!claim) {
    const error = new Error('Claim not found.');
    error.statusCode = 404;
    throw error;
  }
  applyFalsifiability(claim, { resolutionCriteria, horizon });
  if (typeof page.markModified === 'function') page.markModified('claims');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision: models.WikiRevision,
    userId,
    page,
    before,
    reason: 'user_edit',
    actorType: 'user',
    summary: `Claim ${claim.claimId} falsifiability updated.`
  });
  return { page, claim: asPlain(claim), revisionId: id(revision) };
};

const recordClaimVerdict = async ({
  models = {},
  userId,
  pageId,
  claimId,
  verdict,
  trigger,
  sourceEventId = '',
  note = '',
  now = new Date()
} = {}) => {
  const page = await loadOwnedPage({ models, userId, pageId });
  const claim = page.claims.find((row) => String(row.claimId) === String(claimId));
  if (!claim) {
    const error = new Error('Claim not found.');
    error.statusCode = 404;
    throw error;
  }
  const before = snapshotPage(page);
  const entry = appendVerdict(claim, {
    verdict,
    trigger,
    sourceEventId,
    horizon: claim.horizon,
    note,
    now
  });
  if (typeof page.markModified === 'function') page.markModified('claims');
  await page.save();
  const revision = await createWikiRevision({
    WikiRevision: models.WikiRevision,
    userId,
    page,
    before,
    reason: 'user_edit',
    actorType: 'user',
    summary: `Claim ${claim.claimId} verdict ${entry.verdict}.`
  });
  return { page, claim: asPlain(claim), verdict: entry, revisionId: id(revision) };
};

module.exports = {
  buildWatcherLeads,
  diffRevisionClaims,
  selectDailyClaimCheckIn,
  recordClaimCheckIn,
  recordClaimFalsifiability,
  recordClaimVerdict,
  listWatching,
  buildDailyLoopBriefing,
  localDateForTimezone,
  activeClaim,
  WATCHER_PROVIDERS
};
