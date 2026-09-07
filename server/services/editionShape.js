/**
 * What an edition has to contain.
 *
 * The newsroom is not ours. Any agent the reader already has — Claude, Codex,
 * Cursor, OpenClaw, Hermes — writes the paper, and Noeis is where it lands.
 * What Noeis contributes is not the words. It is the standard: an edition is
 * a claim about a window of time, and every claim in it has to say what would
 * limit it.
 *
 * That one rule is the whole difference between this and a newsletter. Every
 * AI weekly in existence is a list of announcements. An item here cannot be
 * accepted without its boundary, so an agent that hands over a press-release
 * summary is told which item is missing one and which section is empty.
 *
 * A section a profile names but nobody filled is reported, never hidden. An
 * empty counterevidence layer is the most useful sentence a week can contain,
 * and dropping it silently is exactly what a newsletter does.
 */

const { PROFILES: RESEARCH_PROFILES } = require('./researchEditionProfile');

/* Sections belong to the profile, because the shape of a week is not generic.
   AI reads in three layers; an investing week would read in different ones,
   and that difference is the argument against neutral sections. */
const SECTIONS = Object.freeze({
  this_week_in_ai: Object.freeze([
    Object.freeze({ key: 'models_methods', label: 'Models & methods' }),
    Object.freeze({ key: 'infrastructure_systems', label: 'Infrastructure & systems' }),
    Object.freeze({ key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence' })
  ]),
  weekend_readings: Object.freeze([
    Object.freeze({ key: 'thesis_evidence', label: 'Evidence for the thesis' }),
    Object.freeze({ key: 'counterevidence', label: 'Counterevidence' }),
    Object.freeze({ key: 'context', label: 'Context' }),
    Object.freeze({ key: 'intellectual_broadening', label: 'Broadening' })
  ])
});

const EDITION_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(RESEARCH_PROFILES).map(([key, profile]) => [key, Object.freeze({
    ...profile,
    sections: SECTIONS[key] || []
  })])
));

const EDITION_PROFILE_KEYS = Object.freeze(Object.keys(EDITION_PROFILES));

const normalizeProfileKey = (value = '') => String(value || '').trim().toLowerCase().replace(/-/g, '_');

/* The reader's own topics resolve first, then the two Noeis ships with. A
   reader who names a topic `this_week_in_ai` is describing the paper they
   want, not colliding with ours, so theirs wins. */
const resolveEditionProfile = (value = '', { profiles = null } = {}) => {
  const key = normalizeProfileKey(value);
  if (!key) return null;
  return (profiles && profiles[key]) || EDITION_PROFILES[key] || null;
};

const profileKeysFor = (profiles = null) => Array.from(new Set([
  ...Object.keys(profiles || {}),
  ...EDITION_PROFILE_KEYS
]));

const startOfUtcDay = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

/* Which issue today belongs to.

   The cadence is the reader's standing instruction; the window is a fact about
   one issue. Deriving the second from the first is what stops two agents filing
   on the same morning from opening two issues of the same paper. */
const windowFor = (cadence = 'weekly', now = new Date()) => {
  const day = startOfUtcDay(now);
  if (cadence === 'daily') return { windowStart: day, windowEnd: day };
  if (cadence === 'monthly') {
    return {
      windowStart: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)),
      windowEnd: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0))
    };
  }
  const windowStart = new Date(day);
  windowStart.setUTCDate(day.getUTCDate() - day.getUTCDay());
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowStart.getUTCDate() + 6);
  return { windowStart, windowEnd };
};

const sectionLabel = (profileKey, sectionKey, { profiles = null } = {}) => (
  (resolveEditionProfile(profileKey, { profiles })?.sections || [])
    .find(section => section.key === sectionKey)?.label || ''
);

const clean = (value = '', limit = 2000) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const cleanList = (value, limit = 12) => (Array.isArray(value) ? value : [])
  .map(entry => clean(entry, 400))
  .filter(Boolean)
  .slice(0, limit);

const dayKey = (value, field) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new EditionShapeError(`${field} must be a date.`);
  return date;
};

class EditionShapeError extends Error {
  constructor(message, { field = '' } = {}) {
    super(message);
    this.name = 'EditionShapeError';
    this.statusCode = 400;
    this.field = field;
  }
}

/* A URL the reader can actually open, and nothing that pretends to be one.
   The save door turns this into a library row, so a javascript: or data: URL
   here would become a saved "source" pointing at nothing. */
const canonicalUrl = (value, field) => {
  const raw = clean(value, 2000);
  if (!raw) throw new EditionShapeError(`${field} needs a link.`, { field });
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new EditionShapeError(`${field} has a link that is not a URL.`, { field });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EditionShapeError(`${field} must link to http or https.`, { field });
  }
  url.hash = '';
  return url.toString();
};

const itemId = (value, index) => clean(value, 120) || `item-${index + 1}`;

/**
 * One item, held to the standard.
 *
 * `finding` is what the source says. `boundary` is what would limit it. Both
 * are required, and the second is the one that does the work — an agent that
 * cannot say what would limit a finding has not read the piece, it has
 * summarised the announcement.
 */
const normalizeItem = (raw = {}, index = 0, profile) => {
  const where = `Item ${index + 1}`;
  const title = clean(raw.title, 400);
  if (!title) throw new EditionShapeError(`${where} needs a title.`, { field: 'title' });

  const finding = clean(raw.finding, 2000);
  if (!finding) throw new EditionShapeError(`${where} ("${title}") needs a finding — what the source actually says.`, { field: 'finding' });

  const boundary = clean(raw.boundary, 2000);
  if (!boundary) {
    throw new EditionShapeError(
      `${where} ("${title}") needs a boundary — what would limit this finding. An item without one is an announcement, not evidence.`,
      { field: 'boundary' }
    );
  }

  const section = clean(raw.section, 120).toLowerCase().replace(/-/g, '_');
  const known = profile.sections.some(entry => entry.key === section);
  if (profile.sections.length && !known) {
    throw new EditionShapeError(
      `${where} ("${title}") is in "${raw.section || ''}", which is not a section of ${profile.titleLabel}. Use one of: ${profile.sections.map(entry => entry.key).join(', ')}.`,
      { field: 'section' }
    );
  }

  return {
    itemId: itemId(raw.itemId || raw.id, index),
    title,
    url: canonicalUrl(raw.url || raw.canonicalUrl, `${where} ("${title}")`),
    sourceLabel: clean(raw.sourceLabel, 200),
    sourceDate: clean(raw.sourceDate, 40),
    section,
    finding,
    boundary,
    /* Everything else the agent wanted to say, kept as written. The standard
       is a floor, not a form. */
    note: clean(raw.note, 4000)
  };
};

/**
 * A whole edition, or the reason it was refused.
 *
 * Refusals name the item and say what is missing, because the caller is an
 * agent that can fix it and try again — an error that says "invalid payload"
 * makes it guess.
 */
const normalizeEdition = (raw = {}, { profiles = null } = {}) => {
  const profile = resolveEditionProfile(raw.profile, { profiles });
  if (!profile) {
    throw new EditionShapeError(
      `Unknown edition profile "${raw?.profile || ''}". Known profiles: ${profileKeysFor(profiles).join(', ')}. Configure a new one before filing into it.`,
      { field: 'profile' }
    );
  }

  const windowStart = dayKey(raw.windowStart, 'windowStart');
  const windowEnd = dayKey(raw.windowEnd, 'windowEnd');
  if (windowEnd < windowStart) {
    throw new EditionShapeError('windowEnd falls before windowStart.', { field: 'windowEnd' });
  }

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (rawItems.length < profile.minItems) {
    throw new EditionShapeError(
      `${profile.titleLabel} needs at least ${profile.minItems} item${profile.minItems === 1 ? '' : 's'}; this one has ${rawItems.length}.`,
      { field: 'items' }
    );
  }
  if (rawItems.length > profile.maxItems) {
    throw new EditionShapeError(
      `${profile.titleLabel} holds at most ${profile.maxItems} items; this one has ${rawItems.length}. An edition that lists everything has chosen nothing.`,
      { field: 'items' }
    );
  }

  const items = rawItems.map((item, index) => normalizeItem(item, index, profile));

  const seen = new Set();
  items.forEach((item) => {
    if (seen.has(item.itemId)) {
      throw new EditionShapeError(`Two items share the id "${item.itemId}".`, { field: 'itemId' });
    }
    seen.add(item.itemId);
  });

  return {
    profile: profile.key,
    title: clean(raw.title, 300) || profile.titleLabel,
    number: Number.isFinite(Number(raw.number)) && Number(raw.number) > 0 ? Math.floor(Number(raw.number)) : null,
    windowStart,
    windowEnd,
    standfirst: clean(raw.standfirst, 2400),
    throughLine: clean(raw.throughLine, 2400),
    watchNext: cleanList(raw.watchNext),
    items
  };
};

/**
 * What the week did not cover.
 *
 * Not a validation failure — an edition with an empty section is publishable
 * and often the most honest one there is. It is a sentence the paper prints
 * about itself.
 */
const emptySections = ({ profile, items = [], profiles = null } = {}) => {
  const resolved = resolveEditionProfile(profile, { profiles });
  if (!resolved) return [];
  const filled = new Set((items || []).map(item => item.section));
  return resolved.sections.filter(section => !filled.has(section.key));
};

module.exports = {
  EDITION_PROFILES,
  EDITION_PROFILE_KEYS,
  profileKeysFor,
  windowFor,
  EditionShapeError,
  emptySections,
  normalizeEdition,
  normalizeItem,
  resolveEditionProfile,
  sectionLabel
};
