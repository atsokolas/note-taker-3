const crypto = require('crypto');
const { agentKeyOf, publicAgentName } = require('./agentRuntime');

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
  if (Number.isNaN(date.getTime())) {
    throw new EditionShapeError('That is not a date.', { field: 'now' });
  }
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

/* A word from a short list, or nothing. A word the reader would have to learn
   is refused by name, with the list, so the agent can pick again. */
const oneOf = (value, allowed, what, field) => {
  const word = clean(value, 40).toLowerCase().replace(/[\s-]+/g, '_');
  if (word && !allowed.includes(word)) {
    throw new EditionShapeError(`${what} is "${value}". Use one of: ${allowed.join(', ')}.`, { field });
  }
  return word;
};

/* What kind of thing the source is, and how sure the agent is: the two facts
   a reader weighs a finding by before reading a word of it. */
const SOURCE_KINDS = Object.freeze(['preprint', 'peer_reviewed', 'company', 'news', 'other']);
const CONFIDENCES = Object.freeze(['high', 'moderate', 'low']);
const MAX_FIGURES = 3;

const numberIn = text => String(text || '').replace(/(\d),(?=\d{3})/g, '$1');

/* The numbers a finding turns on. Each has to be one the agent wrote down in
   the finding, the passage or the note: a key figure is a quotation, and a
   number nobody quoted is how a paper starts making things up. */
const normalizeFigures = (raw, said, where) => {
  const figures = Array.isArray(raw) ? raw : [];
  if (figures.length > MAX_FIGURES) {
    throw new EditionShapeError(`${where} has ${figures.length} key figures; keep the ${MAX_FIGURES} it turns on.`, { field: 'figures' });
  }
  return figures.map((figure, index) => {
    const label = clean(figure?.label, 60);
    const value = clean(figure?.value, 24);
    if (!label || !value) {
      throw new EditionShapeError(`${where} key figure ${index + 1} needs a label and a value.`, { field: 'figures' });
    }
    const number = numberIn(value).match(/\d+(?:\.\d+)?/)?.[0];
    if (number && !numberIn(said).includes(number)) {
      throw new EditionShapeError(
        `${where} key figure "${label}" (${value}) is not in its finding, passage or note. Write the number where you quote it.`,
        { field: 'figures' }
      );
    }
    return { label, value };
  });
};

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

  const note = clean(raw.note, 4000);
  const passage = clean(raw.passage, 1200);

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
    note,
    /* The finding for someone outside the field, in one sentence. */
    plain: clean(raw.plain, 280),
    /* The source's own words the finding rests on. Checked against the source
       when the reader saves it, and never shown as a quotation until it holds. */
    passage,
    sourceKind: oneOf(raw.sourceKind, SOURCE_KINDS, `${where} ("${title}") source kind`, 'sourceKind'),
    confidence: oneOf(raw.confidence, CONFIDENCES, `${where} ("${title}") confidence`, 'confidence'),
    figures: normalizeFigures(raw.figures, [finding, passage, note].join(' '), `${where} ("${title}")`)
  };
};

/**
 * What became of last issue's watch list.
 *
 * A paper that says "watch for X" and never mentions X again has made a
 * promise it can forget. A follow-up names the line it answers and says
 * whether it happened, has not yet, or is no longer worth watching.
 */
const FOLLOW_UP_STATUSES = Object.freeze(['happened', 'not_yet', 'dropped']);

const normalizeFollowUps = (raw) => (Array.isArray(raw) ? raw : []).map((entry, index) => {
  const watch = clean(entry?.watch, 400);
  const where = `Follow-up ${index + 1}`;
  if (!watch) {
    throw new EditionShapeError(`${where} needs the watch line it answers, as the last issue printed it.`, { field: 'followUps' });
  }
  const status = oneOf(entry?.status, FOLLOW_UP_STATUSES, `${where} ("${watch}") status`, 'followUps');
  if (!status) {
    throw new EditionShapeError(`${where} ("${watch}") needs a status: ${FOLLOW_UP_STATUSES.join(', ')}.`, { field: 'followUps' });
  }
  return { watch, status, note: clean(entry?.note, 280) };
});

/* A follow-up answers a line the last issue actually printed, so the reader
   sees the promise and what became of it side by side. Matched without regard
   to case, and stored as printed. A newer answer to the same line wins. */
const answerWatchList = (followUps = [], watchNext = [], held = []) => {
  const printed = new Map((watchNext || []).map(line => [clean(line, 400).toLowerCase(), clean(line, 400)]));
  const answered = new Map((held || []).map(entry => [entry.watch, entry.toObject ? entry.toObject() : entry]));
  followUps.forEach((entry) => {
    const watch = printed.get(entry.watch.toLowerCase());
    if (!watch) {
      throw new EditionShapeError(
        printed.size
          ? `"${entry.watch}" was not on the last issue's watch list. It printed: ${[...printed.values()].join(' / ')}.`
          : `"${entry.watch}" answers nothing: the last issue printed no watch list.`,
        { field: 'followUps' }
      );
    }
    answered.set(watch, { ...entry, watch });
  });
  return [...answered.values()];
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
    /* What the week comes to, in words the reader would use. */
    headline: clean(raw.headline, 200),
    standfirst: clean(raw.standfirst, 2400),
    throughLine: clean(raw.throughLine, 2400),
    watchNext: cleanList(raw.watchNext),
    followUps: normalizeFollowUps(raw.followUps),
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

/**
 * "I looked here and nothing met my bar."
 *
 * The receipt that makes an empty section mean something once more than one
 * agent keeps a paper: without it, silence cannot tell a quiet week from an
 * agent that never ran. A check names a section of the paper, like an item
 * does, and is refused the same way when it names one that is not there.
 */
const CHECK_NOTE_LIMIT = 280;

const normalizeChecks = (raw, profile) => {
  const entries = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  return entries.reduce((checks, entry, index) => {
    const given = typeof entry === 'string' ? entry : entry?.section;
    const section = clean(given, 120).toLowerCase().replace(/-/g, '_');
    if (!profile.sections.some(known => known.key === section)) {
      throw new EditionShapeError(
        `Check ${index + 1} names "${given || ''}", which is not a section of ${profile.titleLabel}.${profile.sections.length ? ` Use one of: ${profile.sections.map(known => known.key).join(', ')}.` : ' It has no sections to check.'}`,
        { field: 'checked' }
      );
    }
    if (seen.has(section)) return checks;
    seen.add(section);
    checks.push({ section, note: typeof entry === 'string' ? '' : clean(entry?.note, CHECK_NOTE_LIMIT) });
    return checks;
  }, []);
};

/* A filer may say a section came up empty once per issue; saying it again
   changes nothing. Keyed on the token, so two agents each leave their own. */
const checkKey = (check = {}) => `${check.section}\u0000${check.by?.agentTokenId || ''}`;

const mergeChecks = (held = [], incoming = []) => {
  const kept = (held || []).map(check => (check?.toObject ? check.toObject() : check));
  const keys = new Set(kept.map(checkKey));
  return [...kept, ...(incoming || []).filter(check => !keys.has(checkKey(check)))];
};

/* A paper still taking filings, or only just closed, has not missed anything
   yet: the Codex job files about two days after its window ends. */
const REPORT_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const reportsAreDue = (windowEnd, now = new Date()) => {
  const end = new Date(windowEnd).getTime();
  if (!Number.isFinite(end)) return false;
  /* The window includes its last day, so it closes when that day does. */
  return new Date(now).getTime() > end + DAY_MS + REPORT_GRACE_DAYS * DAY_MS;
};

/**
 * Which silence an empty section is.
 *
 * `checked`: an agent looked and nothing met its bar. `unreported`: nobody
 * said anything, on a paper that was already taking receipts when the issue
 * opened, and the issue is past its grace. `unknown`: anything else, which
 * prints today's sentence — an issue from before receipts is not accused of
 * anything it was never asked to say.
 */
const sectionSilences = ({
  profile, items = [], checks = [], receiptsSince = null, windowStart, windowEnd, now = new Date(), profiles = null
} = {}) => {
  const since = receiptsSince ? new Date(receiptsSince).getTime() : NaN;
  const takingReceipts = Number.isFinite(since) && new Date(windowStart).getTime() >= since;
  const due = takingReceipts && reportsAreDue(windowEnd, now);
  return emptySections({ profile, items, profiles }).map((section) => {
    const filers = new Map();
    (checks || []).filter(check => check.section === section.key).forEach((check) => {
      const key = check.by?.agentTokenId || check.by?.label || '';
      if (!filers.has(key)) filers.set(key, { label: check.by?.label || '', runtime: check.by?.runtime || '' });
    });
    const state = filers.size ? 'checked' : (due ? 'unreported' : 'unknown');
    return { key: section.key, label: section.label, state, by: [...filers.values()] };
  });
};

const dayIso = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

/* A source link a stranger may follow. javascript: and data: look like URLs
   and are not; they never become hrefs on a public paper. */
const publicHttpUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString();
  } catch (_error) {
    return '';
  }
};

const publicText = (value = '', limit = 2000) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

/* The reader's layer of a finding, each part present only when an agent
   wrote it, so a share published before it existed keeps its hash. A passage
   goes out only once it was found in the source. */
const plainLayerOf = (item = {}) => {
  const figures = (item.figures || []).map(figure => ({
    label: publicText(figure.label, 60),
    value: publicText(figure.value, 24)
  }));
  return Object.fromEntries(Object.entries({
    plain: publicText(item.plain, 280),
    passage: item.passageCheck === 'found' ? publicText(item.passage, 1200) : '',
    sourceKind: publicText(item.sourceKind, 40),
    confidence: publicText(item.confidence, 40),
    figures: figures.length ? figures : ''
  }).filter(([, value]) => value));
};

const projectPublicItem = (item = {}) => ({
  itemId: publicText(item.itemId, 120),
  title: publicText(item.title, 400),
  url: publicHttpUrl(item.url),
  sourceLabel: publicText(item.sourceLabel, 200),
  sourceDate: publicText(item.sourceDate, 40),
  section: publicText(item.section, 120),
  finding: publicText(item.finding, 2000),
  boundary: publicText(item.boundary, 2000),
  note: publicText(item.note, 4000),
  ...plainLayerOf(item),
  /* A second agent's reading is editorial, like the first, and both hands are
     named by what the agent is, never by the label typed for its token.
     Absent when there is none, so an older share keeps its hash. */
  ...(item.readings?.length ? {
    filedBy: publicAgentName(item.filedBy),
    filedByRuntime: publicText(item.filedBy?.runtime, 40),
    readings: item.readings.map(reading => ({
      filedBy: publicAgentName(reading.filedBy),
      filedByRuntime: publicText(reading.filedBy?.runtime, 40),
      finding: publicText(reading.finding, 2000),
      boundary: publicText(reading.boundary, 2000),
      note: publicText(reading.note, 4000)
    }))
  } : {})
});

/**
 * The published paper: an allowlist, not the owner's payload minus a few keys.
 *
 * A share is a version, not a live pointer. What a stranger may see is only
 * what this function named. Saved article ids, placements, highlights, and
 * the rest of the private house stay out even if they were sitting on the
 * document that was projected.
 */
const projectPublicEdition = (
  edition = {},
  ownerDisplayName = '',
  { profiles = null, receiptsSince = null, now = new Date() } = {}
) => {
  const profile = resolveEditionProfile(edition.profile, { profiles });
  const sections = (profile?.sections || edition.sections || []).map(section => ({
    key: publicText(section.key, 120),
    label: publicText(section.label, 200)
  }));
  const writtenBy = typeof edition.writtenBy === 'string'
    ? publicText(edition.writtenBy, 200)
    : publicText(edition.writtenBy?.label, 200);
  /* The runtime names the agent on a public page; the label someone typed for
     their token is not a stranger's business. Absent when unknown, so a share
     published before runtimes were recorded keeps its hash. */
  const writtenByRuntime = publicText(edition.writtenBy?.runtime, 40);
  /* An unknown silence prints what the paper always printed, so it is left
     out: a share published before receipts keeps its hash. */
  const silences = sectionSilences({
    profile: edition.profile,
    items: edition.items,
    checks: edition.checks,
    receiptsSince,
    windowStart: edition.windowStart,
    windowEnd: edition.windowEnd,
    now,
    profiles
  })
    .filter(silence => silence.state !== 'unknown')
    .map(silence => ({
      key: publicText(silence.key, 120),
      label: publicText(silence.label, 200),
      state: silence.state,
      by: silence.by.map(by => ({ label: publicText(by.label, 200), runtime: publicText(by.runtime, 40) }))
    }));

  return {
    title: publicText(edition.title, 300) || publicText(profile?.titleLabel, 300),
    issueLabel: publicText(profile?.issueLabel || edition.issueLabel, 80) || 'Issue',
    number: Number.isFinite(Number(edition.number)) && Number(edition.number) > 0
      ? Math.floor(Number(edition.number))
      : null,
    windowStart: dayIso(edition.windowStart),
    windowEnd: dayIso(edition.windowEnd),
    ...(publicText(edition.headline, 200) ? { headline: publicText(edition.headline, 200) } : {}),
    standfirst: publicText(edition.standfirst, 2400),
    throughLine: publicText(edition.throughLine, 2400),
    ...(edition.followUps?.length ? {
      followUps: edition.followUps.map(entry => ({
        watch: publicText(entry.watch, 400),
        status: publicText(entry.status, 20),
        note: publicText(entry.note, 280)
      }))
    } : {}),
    watchNext: (Array.isArray(edition.watchNext) ? edition.watchNext : [])
      .map(line => publicText(line, 400))
      .filter(Boolean)
      .slice(0, 12),
    writtenBy,
    ...(writtenByRuntime ? { writtenByRuntime } : {}),
    ownerDisplayName: publicText(ownerDisplayName, 200),
    sections,
    items: (edition.items || []).map(projectPublicItem),
    ...(silences.length ? { silences } : {})
  };
};

const hashPublicEdition = (snapshot) => crypto
  .createHash('sha256')
  .update(JSON.stringify(snapshot || {}))
  .digest('hex');

const READER_STATUSES = Object.freeze(['opened', 'later', 'dismissed']);

const readerStateOf = (item) => {
  const status = String(item?.readerState?.status || '').trim();
  if (!READER_STATUSES.includes(status)) return undefined;
  return { status, at: item.readerState.at || null };
};

const itemIsNew = (item = {}) => !READER_STATUSES.includes(item?.readerState?.status);
const itemIsReady = (item = {}) => Boolean(
  publicText(item.title, 400)
  && publicText(item.finding, 2000)
  && publicText(item.boundary, 2000)
  && publicHttpUrl(item.url)
);

/**
 * Keep the reader's work when an agent rewrites the week.
 *
 * Identity follows the source URL, not the position in the payload. The
 * itemId, the save, and the reading choice all survive a reorder. An agent
 * cannot name or reset those fields.
 */
const retainHeldItems = (incoming = [], existingItems = [], writtenBy = {}, now = new Date()) => {
  const held = new Map((existingItems || []).map((item) => [item.url, item]));
  const used = new Set();
  return (incoming || []).map((item) => {
    const before = held.get(item.url);
    const next = {
      ...item,
      itemId: before?.itemId || item.itemId,
      filedBy: before?.filedBy?.label ? before.filedBy : writtenBy,
      filedAt: before?.filedAt || now,
      ...(before?.readings?.length ? { readings: before.readings } : {}),
      savedArticleId: before?.savedArticleId || null,
      /* A check holds for the words it checked, not for whatever replaces them. */
      passageCheck: before?.passage === item.passage ? before?.passageCheck || '' : '',
      readerState: readerStateOf(before)
    };
    if (used.has(next.itemId)) {
      throw new EditionShapeError(`Two items share the id "${next.itemId}".`, { field: 'itemId' });
    }
    used.add(next.itemId);
    return next;
  });
};

/* What the owner's own pages print of the reader's layer. A passage nobody
   has checked yet is still sent, with the check, so the page can say so. */
const PASSAGE_CHECKS = Object.freeze(['found', 'missing']);

const readerLayerOf = (item = {}) => ({
  plain: item.plain || '',
  passage: item.passage || '',
  passageCheck: PASSAGE_CHECKS.includes(item.passageCheck) ? item.passageCheck : (item.passage ? 'unchecked' : ''),
  sourceKind: item.sourceKind || '',
  confidence: item.confidence || '',
  figures: (item.figures || []).map(({ label, value }) => ({ label, value }))
});

const inboxSortAt = (item = {}, edition = {}) => {
  const filed = Date.parse(item.filedAt || 0);
  if (Number.isFinite(filed)) return filed;
  const created = Date.parse(edition.createdAt || 0);
  return Number.isFinite(created) ? created : 0;
};

const inboxCursorOf = (row) => `${row.sortAt}:${row.editionId}:${row.itemId}`;

/* What the inbox and the stand both call an arrival: unread, and complete
   enough to read. */
const isArrival = item => itemIsNew(item) && itemIsReady(item);

/* Whether a hand is on this item: the agent that filed it, or one that read
   the same source on its own. */
const handOn = (item = {}, by = '') => [item.filedBy, ...(item.readings || []).map(reading => reading.filedBy)]
  .some(hand => agentKeyOf(hand || {}) === by);

const collectInbox = (
  editions = [],
  { cursor = '', limit = 20, profiles = null, withContent = false, profile = '', by = '' } = {}
) => {
  const rows = [];
  (editions || []).forEach((edition) => {
    if (profile && edition.profile !== profile) return;
    const paper = resolveEditionProfile(edition.profile, { profiles });
    (edition.items || []).forEach((item) => {
      if (!isArrival(item) || (by && !handOn(item, by))) return;
      const sortAt = inboxSortAt(item, edition);
      rows.push({
        editionId: String(edition._id),
        itemId: item.itemId,
        title: item.title,
        url: publicHttpUrl(item.url),
        sourceLabel: item.sourceLabel || '',
        sourceDate: item.sourceDate || '',
        profile: edition.profile,
        profileLabel: paper?.titleLabel || edition.profile,
        issueTitle: edition.title,
        issueLabel: paper?.issueLabel || edition.issueLabel || 'Issue',
        number: edition.number ?? null,
        filedAt: item.filedAt || null,
        ...(withContent ? {
          finding: item.finding,
          boundary: item.boundary,
          note: item.note || '',
          ...readerLayerOf(item),
          filedBy: item.filedBy?.label || '',
          filedByRuntime: item.filedBy?.runtime || '',
          savedArticleId: item.savedArticleId ? String(item.savedArticleId) : null
        } : {}),
        sortAt
      });
    });
  });

  rows.sort((left, right) => (
    right.sortAt - left.sortAt
    || String(right.editionId).localeCompare(String(left.editionId))
    || String(right.itemId).localeCompare(String(left.itemId))
  ));

  let start = 0;
  if (cursor) {
    const index = rows.findIndex(row => inboxCursorOf(row) === cursor);
    start = index === -1 ? 0 : index + 1;
  }
  const size = Math.min(Math.max(Number(limit) || 20, 1), 40);
  const page = rows.slice(start, start + size);
  const last = page[page.length - 1];
  return {
    items: page.map(({ sortAt, ...item }) => item),
    hasMore: start + page.length < rows.length,
    nextCursor: last ? inboxCursorOf({ ...last, sortAt: last.sortAt }) : '',
    remaining: Math.max(0, rows.length - start - page.length)
  };
};

module.exports = {
  answerWatchList,
  EDITION_PROFILES,
  EDITION_PROFILE_KEYS,
  profileKeysFor,
  windowFor,
  EditionShapeError,
  emptySections,
  mergeChecks,
  normalizeChecks,
  REPORT_GRACE_DAYS,
  sectionSilences,
  collectInbox,
  hashPublicEdition,
  isArrival,
  itemIsNew,
  itemIsReady,
  normalizeEdition,
  normalizeFollowUps,
  normalizeItem,
  projectPublicEdition,
  publicHttpUrl,
  READER_STATUSES,
  readerLayerOf,
  resolveEditionProfile,
  retainHeldItems,
  sectionLabel
};
