export const perfEnabled = process.env.NODE_ENV !== 'production';

const now = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

export const logPerf = (label, payload = {}) => {
  if (!perfEnabled) return;
  if (payload && Object.keys(payload).length > 0) {
    console.info(`[perf] ${label}`, payload);
    return;
  }
  console.info(`[perf] ${label}`);
};

export const createProfilerLogger = (label) => (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  if (!perfEnabled) return;
  if (phase !== 'mount' && actualDuration < 8) return;
  logPerf(`${label}:${phase}`, {
    id,
    actualDurationMs: round(actualDuration),
    baseDurationMs: round(baseDuration),
    startTimeMs: round(startTime),
    commitTimeMs: round(commitTime)
  });
};

export const startPerfTimer = () => now();

export const endPerfTimer = (startedAt) => round(now() - Number(startedAt || 0));
