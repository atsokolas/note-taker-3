const readDebugFlag = () => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__NT_PERF_DEBUG__ === true) return true;
    const qs = new URLSearchParams(window.location.search);
    const query = String(qs.get('perf') || '').toLowerCase();
    if (query === '1' || query === 'true' || query === 'on') return true;
    const stored = String(window.localStorage.getItem('debug.perf') || '').toLowerCase();
    return stored === '1' || stored === 'true' || stored === 'on';
  } catch (error) {
    return false;
  }
};

export const perfEnabled = () => process.env.NODE_ENV !== 'production' && readDebugFlag();

const now = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

export const logPerf = (label, payload = {}) => {
  if (!perfEnabled()) return;
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
  if (!perfEnabled()) return;
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
