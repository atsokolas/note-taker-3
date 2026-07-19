const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const {
  buildWikiBriefing,
  loadCachedWikiBriefing,
  persistWikiBriefingCache,
  DEFAULT_BRIEFING_CACHE_MAX_AGE_MS
} = require('./wikiBriefingService');

const WATCHER_PROVIDERS = ['sec-edgar', 'fmp-transcripts', 'github-repo', 'reading-feed'];
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MORNING_PAPER_OPEN_REUSE_MS = 2 * 60 * 1000;

const clean = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const id = (value) => String(value?._id || value || '');
const asPlain = (value) => value?.toObject ? value.toObject({ virtuals: false }) : value;

const execQuery = async (query) => {
  const lean = query?.lean?.() || query;
  return lean;
};

const watcherLabel = (provider = '') => ({
  'sec-edgar': 'EDGAR',
  'fmp-transcripts': 'Transcript',
  'github-repo': 'GitHub',
  'reading-feed': 'Reading'
}[provider] || 'Watcher');

const activeClaim = (claim = {}) => claim.checkInStatus !== 'retired' && !claim.retiredAt;

const claimMap = (claims = []) => new Map((Array.isArray(claims) ? claims : [])
  .filter(claim => claim?.claimId)
  .map(claim => [String(claim.claimId), claim]));

const diffRevisionClaims = (revision = {}) => {
  const before = claimMap(revision.before?.claims);
  const after = claimMap(revision.after?.claims);
  const changed = [];
  for (const [claimId, next] of after.entries()) {
    const previous = before.get(claimId);
    if (!activeClaim(next)) continue;
    const beforeSupport = String(previous?.support || 'untracked');
    const afterSupport = String(next?.support || 'unsupported');
    const textChanged = previous && clean(previous.text) !== clean(next.text);
    const evidenceChanged = JSON.stringify((previous?.sourceRefIds || []).map(String).sort())
      !== JSON.stringify((next?.sourceRefIds || []).map(String).sort());
    if (!previous || beforeSupport !== afterSupport || textChanged || evidenceChanged) {
      changed.push({
        claimId,
        beforeSupport,
        afterSupport,
        textChanged: Boolean(textChanged),
        evidenceChanged,
        claimText: clean(next.text, 260)
      });
    }
  }
  return changed;
};

const claimImpactSummary = (claimImpacts = []) => {
  if (!claimImpacts.length) return 'not yet analyzed — queued';
  const supported = claimImpacts.filter(row => row.afterSupport === 'supported' && row.beforeSupport !== 'supported').length;
  const contradicted = claimImpacts.filter(row => row.afterSupport === 'conflicted' && row.beforeSupport !== 'conflicted').length;
  const changed = claimImpacts.length;
  return [
    `${changed} claim${changed === 1 ? '' : 's'} touched`,
    supported ? `${supported} gained support` : '',
    contradicted ? `${contradicted} contradicted` : ''
  ].filter(Boolean).join(' · ');
};

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

const selectDailyClaimCheckIn = ({ pages = [], watcherLeads = [], now = Date.now() } = {}) => {
  const impacted = new Map();
  watcherLeads.forEach((lead, leadIndex) => lead.claimImpacts.forEach(impact => {
    impacted.set(`${lead.page.id}:${impact.claimId}`, leadIndex);
  }));
  const candidates = [];
  pages.forEach(pageValue => {
    const page = asPlain(pageValue);
    (Array.isArray(page.claims) ? page.claims : []).forEach(claimValue => {
      const claim = asPlain(claimValue);
      if (!activeClaim(claim) || sourceCount(claim) < 2) return;
      const lastChecked = new Date(claim.lastCheckedAt || 0).getTime();
      if (lastChecked && now - lastChecked < FOURTEEN_DAYS_MS) return;
      const key = `${id(page)}:${claim.claimId}`;
      const watcherRank = impacted.has(key) ? impacted.get(key) : Number.MAX_SAFE_INTEGER;
      candidates.push({
        pageId: id(page),
        pageTitle: clean(page.title || 'Untitled wiki page', 180),
        claimId: String(claim.claimId),
        text: clean(claim.text, 500),
        support: String(claim.support || 'unsupported'),
        sourceCount: sourceCount(claim),
        lastCheckedAt: claim.lastCheckedAt || null,
        adoptedAt: claim.createdAt || page.createdAt || null,
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
    rows.push({
      id: `${id(page)}:${type}`,
      type,
      label,
      detail,
      status: watch.status || 'active',
      page: { id: id(page), title: clean(page.title || 'Untitled wiki page', 180), slug: String(page.slug || '') },
      lastCheckedAt: watch.lastCheckedAt || null,
      lastEventAt: lastEventAt || null,
      errorMessage: clean(watch.errorMessage || '', 300)
    });
  };
  push('sec_edgar', watches.edgar, `EDGAR · ${watches.edgar?.ticker || watches.edgar?.cik || ''}`, watches.edgar?.lastAccessionNumber || 'Awaiting filing', watches.edgar?.lastFilingAt);
  push('earnings_transcript', watches.transcripts, `Transcript · ${watches.transcripts?.ticker || ''}`, watches.transcripts?.lastTranscriptKey || 'Awaiting transcript', watches.transcripts?.lastTranscriptAt);
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
  const [baseBriefing, watcherLeads, pages, visits] = await Promise.all([
    buildWikiBriefing({ userId, models, now: now.getTime(), windowMs }),
    buildWatcherLeads({ userId, models, since: priorOpenedAt }),
    models.WikiPage.find({ userId, status: { $ne: 'archived' } }).select('_id title slug claims externalWatches createdAt').lean(),
    models.WikiPageVisit?.find
      ? models.WikiPageVisit.find({ userId }).select('pageId lastVisitedAt').lean()
      : Promise.resolve([])
  ]);
  const visitedAt = new Map((visits || []).map(visit => [String(visit.pageId), visit.lastVisitedAt]));
  const selectionPages = pages.map(page => ({ ...page, lastVisitedAt: visitedAt.get(String(page._id)) || null }));
  const briefing = {
    ...baseBriefing,
    window: { since: new Date(priorOpenedAt).toISOString(), through: now.toISOString(), cursorAdvancedBy: advanceCursor ? 'morning_paper_open' : null },
    watcherLeads,
    lead: watcherLeads[0] || null,
    claimCheckIn: selectDailyClaimCheckIn({ pages: selectionPages, watcherLeads, now: now.getTime() }),
    watching: listWatching(pages),
    checkInStreak: Number(user.morningPaper?.checkInStreak || 0)
  };
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

const recordClaimCheckIn = async ({ models = {}, userId, pageId, claimId, action, note = '', revisedText = '', now = new Date() } = {}) => {
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
  const heldDays = Math.max(0, Math.floor((now.getTime() - new Date(claim.createdAt || now).getTime()) / (24 * 60 * 60 * 1000)));
  const actionCount = claim.history.filter(row => ['reaffirmed', 'revised'].includes(String(row.action || row.event))).length;
  return {
    page,
    claim: asPlain(claim),
    revisionId: id(revision),
    acknowledgment: `${action} · ${Math.max(1, actionCount)}${actionCount === 1 ? 'st' : actionCount === 2 ? 'nd' : actionCount === 3 ? 'rd' : 'th'} time · held ${heldDays} days`,
    streak
  };
};

module.exports = {
  buildWatcherLeads,
  diffRevisionClaims,
  selectDailyClaimCheckIn,
  recordClaimCheckIn,
  listWatching,
  buildDailyLoopBriefing,
  localDateForTimezone,
  activeClaim,
  WATCHER_PROVIDERS
};
