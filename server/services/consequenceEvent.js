const crypto = require('crypto');

/**
 * AT-453 — Source/event contract.
 * Dedupe happens before routing. Unchanged state is not news.
 */

const ACCEPTED_CLASSES = Object.freeze({
  SEC_FILING: 'sec_filing',
  IR_RELEASE: 'ir_release',
  OWNER_DATED_PUBLIC: 'owner_dated_public_source',
  DATED_MARKET_PRICE: 'dated_market_price'
});

const ACCEPTED = new Set(Object.values(ACCEPTED_CLASSES));

const PROVIDER_CLASS = Object.freeze({
  'sec-edgar': ACCEPTED_CLASSES.SEC_FILING,
  'ir-release': ACCEPTED_CLASSES.IR_RELEASE,
  'investor-relations': ACCEPTED_CLASSES.IR_RELEASE,
  'market-price': ACCEPTED_CLASSES.DATED_MARKET_PRICE
});

const clean = (value = '', limit = 4000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const asTime = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

const sha = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const normalizeUrl = (value = '') => {
  const raw = clean(value, 1000);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    return `${url.host}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch (_error) {
    return raw.toLowerCase();
  }
};

const classifyEvent = (raw = {}) => {
  const named = clean(raw.eventClass || raw.class || raw.metadata?.eventClass, 80);
  if (ACCEPTED.has(named)) return named;
  const provider = clean(raw.provider || raw.metadata?.provider, 80).toLowerCase();
  if (PROVIDER_CLASS[provider]) return PROVIDER_CLASS[provider];
  if (raw.metadata?.ownerAdded && (raw.sourceUpdatedAt || raw.datedAt || raw.metadata?.datedAt)) {
    return ACCEPTED_CLASSES.OWNER_DATED_PUBLIC;
  }
  const url = clean(raw.url, 1000).toLowerCase();
  if (/sec\.gov|edgar/.test(url) || provider === 'sec-edgar') return ACCEPTED_CLASSES.SEC_FILING;
  if (/investor|ir\./.test(url)) return ACCEPTED_CLASSES.IR_RELEASE;
  return '';
};

const canonicalSourceId = (raw = {}) => {
  const provider = clean(raw.provider || raw.metadata?.provider, 80).toLowerCase();
  const external = clean(raw.externalId || raw.metadata?.externalId || raw.metadata?.rawExternalId, 240);
  if (provider && external) return `${provider}:${external}`.toLowerCase();
  const url = normalizeUrl(raw.url);
  if (url) return `url:${url}`;
  return '';
};

const eventPassage = (raw = {}) => clean(
  raw.passage || raw.metadata?.passage || raw.text || raw.summary,
  800
);

const contentHash = (raw = {}) => sha([
  classifyEvent(raw),
  canonicalSourceId(raw),
  eventPassage(raw).toLowerCase(),
  clean(raw.title, 240).toLowerCase()
].join('|'));

const eventIdentity = (raw = {}) => {
  const source = canonicalSourceId(raw);
  const hash = contentHash(raw);
  if (!source || !hash) return '';
  return `${source}#${hash.slice(0, 24)}`;
};

const datedAtOf = (raw = {}) => {
  const value = raw.datedAt || raw.sourceUpdatedAt || raw.metadata?.datedAt || raw.filedAt;
  const time = asTime(value);
  return Number.isNaN(time) ? null : new Date(time);
};

const lastAcceptedClock = (claim = {}, page = {}) => {
  const stamps = [
    claim.lastAcceptedEvidenceAt,
    claim.lastCheckedAt,
    page?.freshness?.lastReviewedAt,
    page?.judgment?.lastReviewedAt
  ].map(asTime).filter(Number.isFinite);
  if (!stamps.length) return null;
  return new Date(Math.max(...stamps));
};

const ageLabel = (datedAt, now = new Date()) => {
  const start = asTime(datedAt);
  const end = asTime(now);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';
  const days = Math.floor((end - start) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const isMalformed = (raw = {}) => {
  if (!classifyEvent(raw)) return true;
  if (!canonicalSourceId(raw)) return true;
  if (!datedAtOf(raw)) return true;
  if (!eventPassage(raw)) return true;
  return false;
};

const isCorrection = (raw = {}) => Boolean(clean(raw.correctsEventId || raw.metadata?.correctsEventId, 80));

const correctionOf = (raw = {}) => clean(raw.correctsEventId || raw.metadata?.correctsEventId, 80);

/**
 * Shape a source row into the contract, or quarantine it.
 * Dedupe keys are computed here so routing never invents a second identity.
 */
const contractEvent = (raw = {}, { now = new Date() } = {}) => {
  const eventClass = classifyEvent(raw);
  const datedAt = datedAtOf(raw);
  const passage = eventPassage(raw);
  const sourceId = canonicalSourceId(raw);
  const hash = contentHash(raw);
  const identity = eventIdentity(raw);
  const malformed = isMalformed(raw);
  const id = String(raw._id || raw.id || identity || '');
  return {
    id,
    class: eventClass,
    title: clean(raw.title, 240),
    passage,
    url: clean(raw.url, 1000),
    datedAt,
    age: ageLabel(datedAt, now),
    provider: clean(raw.provider, 80),
    canonicalSourceId: sourceId,
    contentHash: hash,
    eventIdentity: identity,
    correctsEventId: correctionOf(raw),
    affectedPageIds: (Array.isArray(raw.affectedPageIds) ? raw.affectedPageIds : []).map(String).filter(Boolean),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    quarantine: malformed,
    accepted: ACCEPTED.has(eventClass) && !malformed
  };
};

const freshness = ({ event, lastAcceptedAt, now = new Date() } = {}) => {
  const dated = asTime(event?.datedAt);
  const accepted = asTime(lastAcceptedAt);
  if (Number.isNaN(dated)) return { kind: 'malformed' };
  if (!Number.isNaN(accepted) && dated <= accepted) {
    return {
      kind: 'stale',
      age: ageLabel(event.datedAt, now),
      lastAcceptedAt
    };
  }
  return { kind: 'fresh', age: ageLabel(event.datedAt, now) };
};

const dedupeEvents = (events = []) => {
  const byIdentity = new Map();
  (Array.isArray(events) ? events : []).forEach((event) => {
    if (!event?.eventIdentity) return;
    const existing = byIdentity.get(event.eventIdentity);
    if (!existing) {
      byIdentity.set(event.eventIdentity, event);
      return;
    }
    const existingTime = asTime(existing.datedAt);
    const nextTime = asTime(event.datedAt);
    if (!Number.isNaN(nextTime) && (Number.isNaN(existingTime) || nextTime < existingTime)) {
      byIdentity.set(event.eventIdentity, event);
    }
  });
  return Array.from(byIdentity.values());
};

const MATERIAL_FIELDS = Object.freeze(['assumption', 'falsifier', 'valuation', 'decision']);

module.exports = {
  ACCEPTED_CLASSES,
  ACCEPTED,
  MATERIAL_FIELDS,
  ageLabel,
  canonicalSourceId,
  classifyEvent,
  contentHash,
  contractEvent,
  correctionOf,
  dedupeEvents,
  eventIdentity,
  eventPassage,
  freshness,
  isCorrection,
  isMalformed,
  lastAcceptedClock
};
