const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export const parseDisplayDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const formatSurfaceDate = (value, { now = new Date(), fallback = '', includeYear = true } = {}) => {
  const date = parseDisplayDate(value);
  if (!date) return fallback;
  const current = parseDisplayDate(now) || new Date();
  const deltaMs = current.getTime() - date.getTime();

  if (deltaMs >= 0 && deltaMs < MS_PER_MINUTE) return 'just now';
  if (deltaMs >= 0 && deltaMs < MS_PER_HOUR) {
    return `${Math.max(1, Math.floor(deltaMs / MS_PER_MINUTE))}m ago`;
  }
  if (deltaMs >= 0 && deltaMs < MS_PER_DAY) {
    return `${Math.max(1, Math.floor(deltaMs / MS_PER_HOUR))}h ago`;
  }
  if (deltaMs >= 0 && deltaMs < 7 * MS_PER_DAY) {
    return `${Math.max(1, Math.floor(deltaMs / MS_PER_DAY))}d ago`;
  }

  return date.toLocaleDateString(undefined, includeYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' });
};
