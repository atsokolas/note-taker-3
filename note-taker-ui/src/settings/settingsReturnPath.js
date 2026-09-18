const RETURN_KEY = 'noeis.settings.return.v1';

const safeInternalPath = (path = '') => {
  const candidate = String(path || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '';
  if (candidate.startsWith('/settings')) return '';
  return candidate;
};

export const captureSettingsReturnPath = (location, meta = {}) => {
  if (typeof window === 'undefined') return;
  const fromPath = safeInternalPath(meta.fromPath || document.referrer || '');
  const path = safeInternalPath(location?.pathname + (location?.search || '') + (location?.hash || ''))
    || fromPath;
  if (!path) return;
  const payload = {
    path,
    label: meta.label || '',
    capturedAt: Date.now()
  };
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(payload));
  } catch (_error) {
    // session-only metadata; ignore quota errors
  }
};

export const readSettingsReturnPath = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.path || !safeInternalPath(parsed.path)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
};

export const clearSettingsReturnPath = () => {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch (_error) {
    // ignore
  }
};

export const returnLinkLabel = (meta) => {
  if (!meta) return '';
  if (meta.label) return meta.label;
  if (meta.path?.includes('/articles/') || meta.path?.includes('articleId=')) {
    return 'Back to the passage you were reading';
  }
  if (meta.path?.includes('/think')) return 'Back to your sentence';
  if (meta.path?.includes('/judgment')) return 'Back to the case you were reviewing';
  if (meta.path?.includes('/library')) return 'Back to the library';
  return 'Back to where you were';
};
