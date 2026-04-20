const STORAGE_KEY = 'marketing.attribution.v1';
const DEFAULT_ORIGIN = 'https://www.noeis.io';
const VISITOR_KEY = 'marketing.visitor.v1';

const normalizeString = (value) => String(value || '').trim();

const getWindowUrl = (href = '/') => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(href, window.location.origin);
  }
  return new URL(href, DEFAULT_ORIGIN);
};

const createVisitorId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `visitor-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

const getSearchParams = () => {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search || '');
};

const getReferrerHost = () => {
  const referrer = normalizeString(typeof document !== 'undefined' ? document.referrer : '');
  if (!referrer) return '';
  try {
    return new URL(referrer).host;
  } catch (_error) {
    return '';
  }
};

const normalizeAttribution = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const capturedAt = normalizeString(value.capturedAt) || new Date().toISOString();
  return {
    visitorId: normalizeString(value.visitorId),
    via: normalizeString(value.via) || 'marketing',
    entry: normalizeString(value.entry),
    cta: normalizeString(value.cta),
    pageType: normalizeString(value.pageType) || 'marketing',
    target: normalizeString(value.target),
    utmSource: normalizeString(value.utmSource),
    utmMedium: normalizeString(value.utmMedium),
    utmCampaign: normalizeString(value.utmCampaign),
    utmTerm: normalizeString(value.utmTerm),
    utmContent: normalizeString(value.utmContent),
    referrerHost: normalizeString(value.referrerHost),
    landingPath: normalizeString(value.landingPath),
    capturedAt
  };
};

export const getMarketingVisitorId = () => {
  try {
    const existing = normalizeString(localStorage.getItem(VISITOR_KEY));
    if (existing) return existing;
    const next = createVisitorId();
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch (_error) {
    return createVisitorId();
  }
};

export const buildMarketingHref = (href, { entry = '', cta = '', pageType = 'marketing' } = {}) => {
  const normalizedHref = normalizeString(href);
  if (!normalizedHref.startsWith('/')) return normalizedHref;
  const url = getWindowUrl(normalizedHref);
  url.searchParams.set('via', 'marketing');
  if (entry) url.searchParams.set('entry', entry);
  if (cta) url.searchParams.set('cta', cta);
  if (pageType) url.searchParams.set('page_type', pageType);
  return `${url.pathname}${url.search}${url.hash}`;
};

export const readMarketingAttribution = () => {
  try {
    return normalizeAttribution(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch (_error) {
    return null;
  }
};

export const clearMarketingAttribution = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const captureMarketingAttribution = ({ entry = '', cta = '', pageType = '', target = '' } = {}) => {
  const existing = readMarketingAttribution();
  const params = getSearchParams();
  const landingPath = typeof window !== 'undefined' ? normalizeString(window.location.pathname) : '';
  const next = normalizeAttribution({
    visitorId: existing?.visitorId || getMarketingVisitorId(),
    via: params.get('via') || existing?.via || 'marketing',
    entry: entry || params.get('entry') || existing?.entry || landingPath.replace(/^\//, ''),
    cta: cta || params.get('cta') || existing?.cta,
    pageType: pageType || params.get('page_type') || existing?.pageType || 'marketing',
    target: target || existing?.target,
    utmSource: params.get('utm_source') || existing?.utmSource,
    utmMedium: params.get('utm_medium') || existing?.utmMedium,
    utmCampaign: params.get('utm_campaign') || existing?.utmCampaign,
    utmTerm: params.get('utm_term') || existing?.utmTerm,
    utmContent: params.get('utm_content') || existing?.utmContent,
    referrerHost: getReferrerHost() || existing?.referrerHost,
    landingPath: landingPath || existing?.landingPath,
    capturedAt: existing?.capturedAt || new Date().toISOString()
  });

  if (!next) return null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const buildMarketingPayload = (extra = {}) => ({
  ...(readMarketingAttribution() || {}),
  ...extra
});
