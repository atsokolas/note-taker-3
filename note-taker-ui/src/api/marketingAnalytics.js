const getMarketingAnalyticsApi = () => require('../api').default;

export const MARKETING_FUNNEL_WINDOW_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' }
];

export const MARKETING_FUNNEL_EMPTY_SNAPSHOT = {
  windowDays: 30,
  totals: {
    signupViewed: 0,
    signupStarted: 0,
    signupsCompleted: 0,
    activatedUsers: 0,
    captureCompleted: 0,
    conceptCreated: 0,
    revisitScheduled: 0,
    wikiPageCreated: 0,
    wikiSourceAttached: 0,
    wikiDraftGenerated: 0,
    wikiSharedAdopted: 0
  },
  byEntry: [],
  bySource: []
};

export const MARKETING_FUNNEL_EMPTY_SERIES = {
  windowDays: 30,
  series: []
};

const clampCount = (value) => Math.max(0, Number(value) || 0);

const toRate = (numerator, denominator) => {
  const safeDenominator = clampCount(denominator);
  if (safeDenominator <= 0) return 0;
  return clampCount(numerator) / safeDenominator;
};

const normalizeMilestones = (row = {}) => ({
  captureCompleted: clampCount(row.captureCompleted),
  conceptCreated: clampCount(row.conceptCreated),
  revisitScheduled: clampCount(row.revisitScheduled),
  wikiPageCreated: clampCount(row.wikiPageCreated),
  wikiSourceAttached: clampCount(row.wikiSourceAttached),
  wikiDraftGenerated: clampCount(row.wikiDraftGenerated),
  wikiSharedAdopted: clampCount(row.wikiSharedAdopted)
});

export const formatMarketingEntryLabel = (value = '') => {
  const cleaned = String(value || '').trim();
  if (!cleaned || cleaned === '(unknown)') return 'Unknown entry';
  return cleaned
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

export const formatMarketingSourceLabel = (utmSource = '', utmMedium = '') => {
  const source = String(utmSource || '').trim() || '(direct)';
  const medium = String(utmMedium || '').trim() || '(none)';
  return `${source} / ${medium}`;
};

export const normalizeMarketingFunnelSnapshot = (snapshot = {}) => {
  const totals = snapshot?.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
  return {
    windowDays: Math.max(1, Number(snapshot?.windowDays) || MARKETING_FUNNEL_EMPTY_SNAPSHOT.windowDays),
    totals: {
      signupViewed: clampCount(totals.signupViewed),
      signupStarted: clampCount(totals.signupStarted),
      signupsCompleted: clampCount(totals.signupsCompleted),
      activatedUsers: clampCount(totals.activatedUsers),
      ...normalizeMilestones(totals)
    },
    byEntry: Array.isArray(snapshot?.byEntry) ? snapshot.byEntry.map((row) => ({
      entry: String(row?.entry || '(unknown)').trim() || '(unknown)',
      signupViewed: clampCount(row?.signupViewed),
      signupStarted: clampCount(row?.signupStarted),
      signupsCompleted: clampCount(row?.signupsCompleted),
      activatedUsers: clampCount(row?.activatedUsers),
      ...normalizeMilestones(row)
    })) : [],
    bySource: Array.isArray(snapshot?.bySource) ? snapshot.bySource.map((row) => ({
      utmSource: String(row?.utmSource || '(direct)').trim() || '(direct)',
      utmMedium: String(row?.utmMedium || '(none)').trim() || '(none)',
      signupViewed: clampCount(row?.signupViewed),
      signupStarted: clampCount(row?.signupStarted),
      signupsCompleted: clampCount(row?.signupsCompleted),
      activatedUsers: clampCount(row?.activatedUsers),
      ...normalizeMilestones(row)
    })) : []
  };
};

export const normalizeMarketingFunnelSeries = (payload = {}) => ({
  windowDays: Math.max(1, Number(payload?.windowDays) || MARKETING_FUNNEL_EMPTY_SERIES.windowDays),
  series: Array.isArray(payload?.series)
    ? payload.series.map((bucket) => ({
        date: String(bucket?.date || '').trim(),
        totals: {
          signupViewed: clampCount(bucket?.totals?.signupViewed),
          signupStarted: clampCount(bucket?.totals?.signupStarted),
          signupsCompleted: clampCount(bucket?.totals?.signupsCompleted),
          activatedUsers: clampCount(bucket?.totals?.activatedUsers),
          ...normalizeMilestones(bucket?.totals)
        }
      })).filter((bucket) => bucket.date)
    : []
});

const activationDepthScore = (row = {}) => (
  clampCount(row.wikiSharedAdopted) * 4
  + clampCount(row.wikiDraftGenerated) * 3
  + clampCount(row.wikiSourceAttached) * 2
  + clampCount(row.wikiPageCreated) * 2
  + clampCount(row.conceptCreated)
  + clampCount(row.captureCompleted)
  + clampCount(row.revisitScheduled)
);

const buildBreakdownRow = (row, label) => {
  const depthScore = activationDepthScore(row);
  return {
    ...row,
    label,
    activationDepthScore: depthScore,
    activationDepthPerSignup: toRate(depthScore, row.signupsCompleted),
    viewToStartRate: toRate(row.signupStarted, row.signupViewed),
    signupCompletionRate: toRate(row.signupsCompleted, row.signupStarted),
    signupToActivationRate: toRate(row.activatedUsers, row.signupsCompleted),
    viewToActivationRate: toRate(row.activatedUsers, row.signupViewed)
  };
};

export const buildMarketingFunnelViewModel = (snapshot = {}) => {
  const normalized = normalizeMarketingFunnelSnapshot(snapshot);
  const { totals } = normalized;

  const stageRates = [
    {
      key: 'view_to_start',
      label: 'Viewed → Started',
      numerator: totals.signupStarted,
      denominator: totals.signupViewed,
      rate: toRate(totals.signupStarted, totals.signupViewed)
    },
    {
      key: 'start_to_signup',
      label: 'Started → Signed up',
      numerator: totals.signupsCompleted,
      denominator: totals.signupStarted,
      rate: toRate(totals.signupsCompleted, totals.signupStarted)
    },
    {
      key: 'signup_to_activation',
      label: 'Signed up → Activated',
      numerator: totals.activatedUsers,
      denominator: totals.signupsCompleted,
      rate: toRate(totals.activatedUsers, totals.signupsCompleted)
    },
    {
      key: 'view_to_activation',
      label: 'Viewed → Activated',
      numerator: totals.activatedUsers,
      denominator: totals.signupViewed,
      rate: toRate(totals.activatedUsers, totals.signupViewed)
    }
  ];

  const leakCandidates = stageRates.filter((stage) => stage.key !== 'view_to_activation');
  const primaryLeak = leakCandidates.reduce((lowest, stage) => (
    !lowest || stage.rate < lowest.rate ? stage : lowest
  ), null);

  const entryRows = normalized.byEntry
    .map((row) => buildBreakdownRow(row, formatMarketingEntryLabel(row.entry)));

  const sourceRows = normalized.bySource
    .map((row) => buildBreakdownRow(row, formatMarketingSourceLabel(row.utmSource, row.utmMedium)));

  const activationMilestones = [
    {
      key: 'wiki_shared_adopted',
      label: 'Shared wikis adopted',
      value: totals.wikiSharedAdopted,
      context: 'Public proof copied into workspace'
    },
    {
      key: 'wiki_page_created',
      label: 'Wiki pages created',
      value: totals.wikiPageCreated,
      context: 'Source-backed wiki activation'
    },
    {
      key: 'wiki_source_attached',
      label: 'Sources attached',
      value: totals.wikiSourceAttached,
      context: 'Evidence provenance added'
    },
    {
      key: 'wiki_draft_generated',
      label: 'Drafts generated',
      value: totals.wikiDraftGenerated,
      context: 'Reading-to-draft activation'
    },
    {
      key: 'concept_created',
      label: 'Concepts created',
      value: totals.conceptCreated,
      context: 'Legacy concept activation'
    },
    {
      key: 'capture_completed',
      label: 'Captures completed',
      value: totals.captureCompleted,
      context: 'Imported or saved first material'
    },
    {
      key: 'revisit_scheduled',
      label: 'Revisits scheduled',
      value: totals.revisitScheduled,
      context: 'Return behavior'
    }
  ];

  const byEfficiency = (a, b) => (
    b.viewToActivationRate - a.viewToActivationRate
    || b.activatedUsers - a.activatedUsers
    || b.signupsCompleted - a.signupsCompleted
  );

  const byActivationQuality = (a, b) => (
    b.activationDepthPerSignup - a.activationDepthPerSignup
    || b.activationDepthScore - a.activationDepthScore
    || b.activatedUsers - a.activatedUsers
    || b.signupsCompleted - a.signupsCompleted
  );

  const topEntry = [...entryRows].sort(byEfficiency)[0] || null;
  const topSource = [...sourceRows].sort(byEfficiency)[0] || null;
  const topQualityEntry = [...entryRows].filter(row => row.signupsCompleted > 0).sort(byActivationQuality)[0] || null;
  const topQualitySource = [...sourceRows].filter(row => row.signupsCompleted > 0).sort(byActivationQuality)[0] || null;
  const seoOperatorRecommendation = topQualityEntry ? {
    title: `Double down on ${topQualityEntry.label}`,
    action: 'Use this entry page as the first candidate for the next GSC refresh, internal-link push, or proof-page expansion.',
    evidence: `${topQualityEntry.activationDepthScore} weighted activation-depth points from ${topQualityEntry.signupsCompleted} signups.`,
    cta: topQualityEntry.wikiSharedAdopted > 0
      ? 'Lean into shared wiki adoption proof.'
      : topQualityEntry.wikiDraftGenerated > 0
        ? 'Lean into reading-to-draft proof.'
        : 'Lean into source-backed wiki activation proof.'
  } : {
    title: 'Wait for activation-quality data',
    action: 'Do not create another content page from clicks alone. Paste GSC data, then compare it against activated-user quality here.',
    evidence: 'No entry page has attributed completed signups in this window.',
    cta: 'Prioritize instrumentation and Search Console exports.'
  };

  return {
    snapshot: normalized,
    totals,
    windowDays: normalized.windowDays,
    summaryCards: [
      {
        key: 'signup_viewed',
        label: 'Viewed',
        value: totals.signupViewed,
        context: 'Top of funnel'
      },
      {
        key: 'signup_started',
        label: 'Started',
        value: totals.signupStarted,
        context: `${Math.round(toRate(totals.signupStarted, totals.signupViewed) * 1000) / 10}% of views`
      },
      {
        key: 'signups_completed',
        label: 'Signed up',
        value: totals.signupsCompleted,
        context: `${Math.round(toRate(totals.signupsCompleted, totals.signupStarted) * 1000) / 10}% of starts`
      },
      {
        key: 'activated_users',
        label: 'Activated',
        value: totals.activatedUsers,
        context: `${Math.round(toRate(totals.activatedUsers, totals.signupsCompleted) * 1000) / 10}% of signups`
      }
    ],
    stageRates,
    primaryLeak,
    topEntry,
    topSource,
    topQualityEntry,
    topQualitySource,
    seoOperatorRecommendation,
    entryRows,
    sourceRows,
    activationMilestones
  };
};

export const getMarketingFunnelSnapshot = async ({ days = 30 } = {}) => {
  const safeDays = Math.max(1, Math.min(180, Number(days) || 30));
  const response = await getMarketingAnalyticsApi().get(`/api/analytics/marketing/funnel?days=${safeDays}`);
  return normalizeMarketingFunnelSnapshot(response.data || {
    ...MARKETING_FUNNEL_EMPTY_SNAPSHOT,
    windowDays: safeDays
  });
};

export const getMarketingFunnelSeries = async ({ days = 30 } = {}) => {
  const safeDays = Math.max(1, Math.min(180, Number(days) || 30));
  const response = await getMarketingAnalyticsApi().get(`/api/analytics/marketing/funnel/timeseries?days=${safeDays}`);
  return normalizeMarketingFunnelSeries(response.data || {
    ...MARKETING_FUNNEL_EMPTY_SERIES,
    windowDays: safeDays
  });
};
