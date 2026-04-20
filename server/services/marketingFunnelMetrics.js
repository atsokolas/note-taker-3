const fs = require('fs/promises');
const DAY_MS = 24 * 60 * 60 * 1000;

const clean = (value = '') => String(value || '').trim();

const readAnalyticsEntries = async (filePath = '') => {
  const safePath = clean(filePath);
  if (!safePath) return [];
  try {
    const raw = await fs.readFile(safePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => clean(line))
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};

const incrementCounter = (target, key) => {
  target[key] = Math.max(0, Number(target[key] || 0)) + 1;
};

const createTotals = () => ({
  signupViewed: 0,
  signupStarted: 0,
  signupsCompleted: 0,
  activatedUsers: 0
});

const ensureEntryBucket = (map, key) => {
  if (!map.has(key)) {
    map.set(key, {
      entry: key,
      signupViewed: 0,
      signupStarted: 0,
      signupsCompleted: 0,
      activatedUsers: 0
    });
  }
  return map.get(key);
};

const ensureSourceBucket = (map, sourceKey, utmSource, utmMedium) => {
  if (!map.has(sourceKey)) {
    map.set(sourceKey, {
      utmSource: utmSource || '(direct)',
      utmMedium: utmMedium || '(none)',
      signupViewed: 0,
      signupStarted: 0,
      signupsCompleted: 0,
      activatedUsers: 0
    });
  }
  return map.get(sourceKey);
};

const withinWindow = (timestamp, cutoffMs) => {
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return false;
  return value >= cutoffMs;
};

const buildDayKey = (timestamp) => {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
};

const buildWindowDayKeys = (windowDays) => {
  const today = new Date();
  const startUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: windowDays }, (_, index) => {
    const offset = windowDays - index - 1;
    return new Date(startUtc - (offset * DAY_MS)).toISOString().slice(0, 10);
  });
};

const ensureSeriesBucket = (map, dayKey) => {
  if (!map.has(dayKey)) {
    map.set(dayKey, {
      date: dayKey,
      totals: createTotals()
    });
  }
  return map.get(dayKey);
};

const marketingEventNameSet = new Set([
  'marketing_signup_viewed',
  'marketing_signup_started',
  'user_signup',
  'capture_completed',
  'concept_created',
  'revisit_scheduled'
]);

const activationEventSet = new Set([
  'capture_completed',
  'concept_created',
  'revisit_scheduled'
]);

const listMarketingEntries = async ({
  analyticsLogPath = process.env.ANALYTICS_LOG_PATH || 'server/logs/product-events.jsonl',
  days = 30
} = {}) => {
  const windowDays = Math.max(1, Number(days) || 30);
  const cutoffMs = Date.now() - (windowDays * DAY_MS);
  const entries = (await readAnalyticsEntries(analyticsLogPath))
    .filter((entry) => marketingEventNameSet.has(clean(entry?.event)))
    .filter((entry) => withinWindow(entry?.timestamp, cutoffMs));

  return {
    entries,
    windowDays
  };
};

const aggregateMarketingEntries = ({ entries = [], windowDays = 30 } = {}) => {
  const totals = createTotals();
  const byEntry = new Map();
  const bySource = new Map();
  const signupAttributionByUser = new Map();
  const activatedUsers = new Set();
  const series = new Map();

  buildWindowDayKeys(windowDays).forEach((dayKey) => {
    ensureSeriesBucket(series, dayKey);
  });

  entries.forEach((entry) => {
    const properties = entry?.properties && typeof entry.properties === 'object' ? entry.properties : {};
    const actor = entry?.actor && typeof entry.actor === 'object' ? entry.actor : {};
    const event = clean(entry.event);
    const dayKey = buildDayKey(entry.timestamp);
    if (!dayKey) return;

    const dayBucket = ensureSeriesBucket(series, dayKey).totals;
    const entryKey = clean(properties.entry) || '(unknown)';
    const utmSource = clean(properties.utmSource);
    const utmMedium = clean(properties.utmMedium);
    const sourceKey = `${utmSource || '(direct)'}::${utmMedium || '(none)'}`;

    if (event === 'marketing_signup_viewed') {
      incrementCounter(totals, 'signupViewed');
      incrementCounter(dayBucket, 'signupViewed');
      incrementCounter(ensureEntryBucket(byEntry, entryKey), 'signupViewed');
      incrementCounter(ensureSourceBucket(bySource, sourceKey, utmSource, utmMedium), 'signupViewed');
      return;
    }

    if (event === 'marketing_signup_started') {
      incrementCounter(totals, 'signupStarted');
      incrementCounter(dayBucket, 'signupStarted');
      incrementCounter(ensureEntryBucket(byEntry, entryKey), 'signupStarted');
      incrementCounter(ensureSourceBucket(bySource, sourceKey, utmSource, utmMedium), 'signupStarted');
      return;
    }

    if (event === 'user_signup') {
      const userIdHash = clean(actor.userIdHash);
      incrementCounter(totals, 'signupsCompleted');
      incrementCounter(dayBucket, 'signupsCompleted');
      incrementCounter(ensureEntryBucket(byEntry, entryKey), 'signupsCompleted');
      incrementCounter(ensureSourceBucket(bySource, sourceKey, utmSource, utmMedium), 'signupsCompleted');
      if (userIdHash) {
        signupAttributionByUser.set(userIdHash, {
          entry: entryKey,
          utmSource,
          utmMedium
        });
      }
      return;
    }

    if (activationEventSet.has(event)) {
      const userIdHash = clean(actor.userIdHash);
      if (!userIdHash || activatedUsers.has(userIdHash)) return;
      const attribution = signupAttributionByUser.get(userIdHash);
      if (!attribution) return;
      activatedUsers.add(userIdHash);
      incrementCounter(totals, 'activatedUsers');
      incrementCounter(dayBucket, 'activatedUsers');
      incrementCounter(ensureEntryBucket(byEntry, attribution.entry), 'activatedUsers');
      incrementCounter(
        ensureSourceBucket(
          bySource,
          `${attribution.utmSource || '(direct)'}::${attribution.utmMedium || '(none)'}`,
          attribution.utmSource,
          attribution.utmMedium
        ),
        'activatedUsers'
      );
    }
  });

  return {
    windowDays,
    totals,
    byEntry: Array.from(byEntry.values()).sort((a, b) => b.signupsCompleted - a.signupsCompleted || b.activatedUsers - a.activatedUsers),
    bySource: Array.from(bySource.values()).sort((a, b) => b.signupsCompleted - a.signupsCompleted || b.activatedUsers - a.activatedUsers),
    series: Array.from(series.values()).sort((a, b) => a.date.localeCompare(b.date))
  };
};

const buildMarketingFunnelSnapshot = async ({
  analyticsLogPath = process.env.ANALYTICS_LOG_PATH || 'server/logs/product-events.jsonl',
  days = 30
} = {}) => {
  const { entries, windowDays } = await listMarketingEntries({ analyticsLogPath, days });
  const aggregated = aggregateMarketingEntries({ entries, windowDays });
  return {
    windowDays: aggregated.windowDays,
    totals: aggregated.totals,
    byEntry: aggregated.byEntry,
    bySource: aggregated.bySource
  };
};

const buildMarketingFunnelSeries = async ({
  analyticsLogPath = process.env.ANALYTICS_LOG_PATH || 'server/logs/product-events.jsonl',
  days = 30
} = {}) => {
  const { entries, windowDays } = await listMarketingEntries({ analyticsLogPath, days });
  const aggregated = aggregateMarketingEntries({ entries, windowDays });
  return {
    windowDays: aggregated.windowDays,
    series: aggregated.series
  };
};

module.exports = {
  buildMarketingFunnelSnapshot,
  buildMarketingFunnelSeries
};
