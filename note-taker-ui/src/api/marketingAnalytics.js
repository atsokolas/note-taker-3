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
    activatedUsers: 0
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
      activatedUsers: clampCount(totals.activatedUsers)
    },
    byEntry: Array.isArray(snapshot?.byEntry) ? snapshot.byEntry.map((row) => ({
      entry: String(row?.entry || '(unknown)').trim() || '(unknown)',
      signupViewed: clampCount(row?.signupViewed),
      signupStarted: clampCount(row?.signupStarted),
      signupsCompleted: clampCount(row?.signupsCompleted),
      activatedUsers: clampCount(row?.activatedUsers)
    })) : [],
    bySource: Array.isArray(snapshot?.bySource) ? snapshot.bySource.map((row) => ({
      utmSource: String(row?.utmSource || '(direct)').trim() || '(direct)',
      utmMedium: String(row?.utmMedium || '(none)').trim() || '(none)',
      signupViewed: clampCount(row?.signupViewed),
      signupStarted: clampCount(row?.signupStarted),
      signupsCompleted: clampCount(row?.signupsCompleted),
      activatedUsers: clampCount(row?.activatedUsers)
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
          activatedUsers: clampCount(bucket?.totals?.activatedUsers)
        }
      })).filter((bucket) => bucket.date)
    : []
});

const buildBreakdownRow = (row, label) => ({
  ...row,
  label,
  viewToStartRate: toRate(row.signupStarted, row.signupViewed),
  signupCompletionRate: toRate(row.signupsCompleted, row.signupStarted),
  signupToActivationRate: toRate(row.activatedUsers, row.signupsCompleted),
  viewToActivationRate: toRate(row.activatedUsers, row.signupViewed)
});

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

  const byEfficiency = (a, b) => (
    b.viewToActivationRate - a.viewToActivationRate
    || b.activatedUsers - a.activatedUsers
    || b.signupsCompleted - a.signupsCompleted
  );

  const topEntry = [...entryRows].sort(byEfficiency)[0] || null;
  const topSource = [...sourceRows].sort(byEfficiency)[0] || null;

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
    entryRows,
    sourceRows
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
