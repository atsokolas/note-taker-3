const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { isProceduralShelf } = require('../lib/proceduralShelf');
const { stripTags } = require('./readableArticle');

/*
 * The reading room: the Library's front door.
 *
 * Every rule here is a sentence you could say to the reader, and every
 * section goes silent rather than reach for filler. Time is the reader's
 * wall clock, carried as a getTimezoneOffset()-style offset in minutes.
 */

const DAY = 24 * 60 * 60 * 1000;
const STARTED = 0.05;
const FINISHED = 0.9;
const READING_STATE_WINDOW = 21 * DAY;
const HIGHLIGHT_WINDOW = 14 * DAY;
const NEW_FROM_SOURCES_WINDOW = 7 * DAY;
const READABLE_LENGTH = 1200;
const PICK_SHELF = 7;
const PICK_SEASON = 90 * DAY;
const WEATHER_MIN_SOURCES = 3;
const QUOTE_MIN = 30;
const QUOTE_MAX = 320;

const time = (value) => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(at) ? at : 0;
};
const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const idOf = (row) => String(row?._id || row?.id || '');

/* The reader's wall clock: a Date whose UTC fields read as local time. */
const wallClock = (now, offset = 0) => new Date(now.getTime() - offset * 60000);

const offsetMinutesFor = (now = new Date(), timeZone = 'UTC') => {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(now).map(({ type, value }) => [type, value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((Math.floor(now.getTime() / 1000) * 1000 - asUtc) / 60000);
  } catch (_) {
    return 0;
  }
};

/** Monday midnight where the reader is, and the week before it. */
const weekBounds = (now = new Date(), offset = 0) => {
  const local = wallClock(now, offset);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday) + offset * 60000;
  return {
    thisWeek: { from: start, to: now.getTime() },
    lastWeek: { from: start - 7 * DAY, to: start }
  };
};

/** Friday afternoon through Sunday night, where the reader is. */
const isDinnerPartyTime = (now = new Date(), offset = 0) => {
  const local = wallClock(now, offset);
  const day = local.getUTCDay();
  return day === 6 || day === 0 || (day === 5 && local.getUTCHours() >= 12);
};

const highlightsIn = (article, { from, to }) => (article.highlights || [])
  .filter((highlight) => {
    const at = time(highlight.createdAt);
    return at >= from && at < to + 1;
  });

const finished = (article) => Number(article.readingState?.ratio) >= FINISHED;

/*
 * Partway: a reading place past the first screen and short of the end, from
 * the last three weeks, or a passage marked in the last two without the piece
 * being finished. The one place "partway" is decided, so a richer reading
 * position can replace it without touching the room.
 */
const partwaySince = (article, now = new Date()) => {
  if (finished(article)) return 0;
  const state = article.readingState;
  const visited = time(state?.visitedAt);
  const placed = state && Number(state.ratio) > STARTED && now.getTime() - visited <= READING_STATE_WINDOW ? visited : 0;
  const marked = Math.max(0, ...(article.highlights || []).map((highlight) => time(highlight.createdAt))
    .filter((at) => now.getTime() - at <= HIGHLIGHT_WINDOW));
  return Math.max(placed, marked);
};

const stillReading = (articles = [], now = new Date()) => articles
  .map((article) => ({ article, since: partwaySince(article, now) }))
  .filter(({ since }) => since > 0)
  .sort((left, right) => right.since - left.since)
  .slice(0, 3)
  .map(({ article }) => ({
    articleId: idOf(article),
    title: clean(article.title),
    siteName: clean(article.siteName),
    ratio: article.readingState ? Number(article.readingState.ratio) : null
  }));

const deliberate = (article) => (article.placement || 'stream') === 'stream' && article.folder?.asFeed !== true;
const unopened = (article) => !article.readingState && !(article.highlights || []).length;
const halfRead = (article) => Number(article.readingState?.ratio) > STARTED && !finished(article);

/* A piece left unopened for a season has had its moment (last winter's odds,
   last year's launch), unless you said it keeps. */
const inSeason = (article, now) => article.evergreen === true || now.getTime() - time(article.createdAt) <= PICK_SEASON;

/*
 * One piece for today: of the seven oldest pieces you saved yourself this
 * season or marked as keeping (not a feed, not parked), with a readable body,
 * unopened or half-read and not already in "Still reading", the one whose
 * turn it is. The turn moves one place a day, so the back of the shelf comes
 * round in a week.
 */
const pickForToday = (articles = [], { now = new Date(), offset = 0, exclude = [] } = {}) => {
  const skip = new Set(exclude);
  const shelf = articles
    .filter((article) => deliberate(article)
      && clean(article.title)
      && Number(article.contentLength) >= READABLE_LENGTH
      && (unopened(article) || halfRead(article))
      && inSeason(article, now)
      && !skip.has(idOf(article)))
    .sort((left, right) => time(left.createdAt) - time(right.createdAt) || idOf(left).localeCompare(idOf(right)))
    .slice(0, PICK_SHELF);
  if (!shelf.length) return null;
  const day = Math.floor(wallClock(now, offset).getTime() / DAY);
  const article = shelf[day % shelf.length];
  return {
    articleId: idOf(article),
    title: clean(article.title),
    siteName: clean(article.siteName),
    author: clean(article.author),
    savedAt: article.createdAt,
    ratio: article.readingState ? Number(article.readingState.ratio) : null
  };
};

/* Arrivals in the last week from folders you screened as feeds, not yet opened. */
const newFromSources = (articles = [], now = new Date()) => articles
  .filter((article) => article.folder?.asFeed === true
    && (article.placement || 'stream') === 'stream'
    && now.getTime() - time(article.createdAt) <= NEW_FROM_SOURCES_WINDOW
    && unopened(article))
  .sort((left, right) => time(right.createdAt) - time(left.createdAt))
  .slice(0, 5)
  .map((article) => ({
    articleId: idOf(article),
    title: clean(article.title),
    sourceName: clean(article.folder?.name)
  }));

const subjectsOf = (article, highlights) => {
  const tags = new Map();
  highlights.forEach((highlight) => (highlight.tags || []).forEach((tag) => {
    const name = clean(tag).replace(/^#/, '');
    if (name && !tags.has(name.toLowerCase())) tags.set(name.toLowerCase(), name);
  }));
  if (tags.size) return [...tags.entries()];
  const folder = clean(article.folder?.name);
  return folder && !isProceduralShelf(folder) ? [[folder.toLowerCase(), folder]] : [];
};

/*
 * Reading weather: what last week's saving and marking was about. Each source
 * saved or marked last week votes once for each of its subjects (the tags on
 * last week's passages, else its folder). Silent below three sources with a
 * subject, and silent unless one subject leads outright on at least two.
 */
const readingWeather = (articles = [], window) => {
  const tally = new Map();
  let sources = 0;
  articles.forEach((article) => {
    const marked = highlightsIn(article, window);
    const saved = deliberate(article) && time(article.createdAt) >= window.from && time(article.createdAt) < window.to;
    if (!marked.length && !saved) return;
    const subjects = subjectsOf(article, marked);
    if (!subjects.length) return;
    sources += 1;
    subjects.forEach(([key, name]) => {
      const row = tally.get(key) || { name, count: 0 };
      row.count += 1;
      tally.set(key, row);
    });
  });
  if (sources < WEATHER_MIN_SOURCES) return null;
  const [top, chance] = [...tally.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  if (!top || top.count < 2 || (chance && chance.count === top.count)) return null;
  return {
    top: top.name,
    chance: chance ? chance.name : '',
    line: chance ? `Mostly ${top.name}, with a chance of ${chance.name}.` : `Mostly ${top.name}.`
  };
};

const quotable = (highlight) => {
  const length = clean(highlight.text).length;
  return length >= QUOTE_MIN && length <= QUOTE_MAX;
};

/* The line worth quoting: one you wrote a thought beside, else the one
   nearest a sentence's natural length, else the latest. */
const lineWorthQuoting = (highlights) => [...highlights].filter(quotable).sort((left, right) => (
  Number(Boolean(clean(right.note))) - Number(Boolean(clean(left.note)))
  || Math.abs(clean(left.text).length - 140) - Math.abs(clean(right.text).length - 140)
  || time(right.createdAt) - time(left.createdAt)
))[0] || null;

/*
 * Three things worth saying: of the sources you marked this week with a
 * quotable passage, the three you marked most (a written thought counts
 * double, a keeper adds two). Silent with fewer than three.
 */
const worthSaying = (articles = [], window) => {
  const ranked = articles
    .map((article) => {
      const marked = highlightsIn(article, window);
      const quote = lineWorthQuoting(marked);
      if (!quote) return null;
      const score = marked.length + 2 * marked.filter((highlight) => clean(highlight.note)).length + (article.evergreen ? 2 : 0);
      const latest = Math.max(...marked.map((highlight) => time(highlight.createdAt)));
      return { article, quote, score, latest };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.latest - left.latest);
  if (ranked.length < 3) return null;
  return ranked.slice(0, 3).map(({ article, quote }) => ({
    articleId: idOf(article),
    title: clean(article.title),
    highlightId: idOf(quote),
    quote: clean(quote.text),
    note: clean(quote.note)
  }));
};

const parseJson = (raw = '') => {
  const text = String(raw || '').trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    try {
      return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
    } catch (__) {
      return null;
    }
  }
};

const plainSentence = (value, max = 220) => {
  const text = clean(value);
  return text.length >= 8 && text.length <= max && !text.includes('!') ? text : '';
};

const saidCache = new Map();
const rememberSaid = (key, value) => {
  saidCache.set(key, value);
  if (saidCache.size > 500) saidCache.delete(saidCache.keys().next().value);
  return value;
};

/*
 * One sentence per piece, the way you'd say it across a table. All three or
 * none: a half-phrased list reads as a broken one, so any refusal, failure or
 * gate miss returns null and the room shows the quoted lines alone.
 */
const phraseWorthSaying = async (lines = [], { userId = '', chat = chatComplete, configured = isTextGenerationConfigured } = {}) => {
  if (!lines.length || !configured()) return null;
  const key = `${userId}:${lines.map((line) => `${line.articleId}.${line.highlightId}`).join('|')}`;
  if (saidCache.has(key)) return saidCache.get(key);
  try {
    const completion = await chat({
      route: 'artifact_draft',
      maxTokens: 400,
      temperature: 0.4,
      responseFormat: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You help a reader say out loud, at dinner, one thing from each piece they read this week. Plain spoken English, first person where natural, under thirty words, no exclamation marks, no hype. Only claims the quoted passage supports.'
        },
        {
          role: 'user',
          content: `Return JSON {"said":[...]} with exactly ${lines.length} sentences, in order.\n\n${lines.map((line, index) => (
            `${index + 1}. "${line.title}"\nPassage: ${line.quote}${line.note ? `\nTheir note: ${line.note}` : ''}`
          )).join('\n\n')}`
        }
      ]
    });
    const said = parseJson(typeof completion === 'string' ? completion : completion?.text)?.said;
    const sentences = Array.isArray(said) ? said.map((value) => plainSentence(value)) : [];
    return rememberSaid(key, sentences.length === lines.length && sentences.every(Boolean) ? sentences : null);
  } catch (_) {
    return null;
  }
};

const normalizeForMatch = (value = '') => clean(value)
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .toLowerCase();

/*
 * Explain it back: the reader's two sentences against the piece and their own
 * marks. A point survives only if its quote is in the article or a highlight,
 * word for word, so the model cannot hand back something the source never said.
 */
const explainItBack = async ({ article, text, chat = chatComplete } = {}) => {
  const body = clean(stripTags(article?.content || '')).slice(0, 14000);
  const highlights = (article?.highlights || []).map((highlight) => clean(highlight.text)).filter(Boolean).slice(0, 30);
  const completion = await chat({
    route: 'critique',
    maxTokens: 700,
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'A reader explains an article back in two sentences. Name at most three important things they left out, each with a short exact quote copied verbatim from the article or their highlights. If nothing central is missing, return an empty list. Never invent a quote. No exclamation marks.'
      },
      {
        role: 'user',
        content: `Return JSON {"missed":[{"point":"...","quote":"..."}]}.\n\nTheir explanation:\n${clean(text)}\n\nTheir highlights:\n${highlights.map((line) => `- ${line}`).join('\n') || '(none)'}\n\nArticle "${clean(article?.title)}":\n${body}`
      }
    ]
  });
  const parsed = parseJson(typeof completion === 'string' ? completion : completion?.text);
  if (!parsed || !Array.isArray(parsed.missed)) throw new Error('The comparison came back unreadable.');
  const sourceText = normalizeForMatch([body, ...highlights].join('\n'));
  const missed = parsed.missed
    .map((row) => ({ point: plainSentence(row?.point, 240), quote: clean(row?.quote).replace(/^["“]|["”]$/g, '') }))
    .filter((row) => row.point && row.quote.length >= 12 && sourceText.includes(normalizeForMatch(row.quote)))
    .slice(0, 3);
  if (parsed.missed.length && !missed.length) throw new Error('The comparison quoted lines the source does not contain.');
  return { missed };
};

const EXPLAIN_MIN_LENGTH = 1200;
const canExplainBack = (article, configured = isTextGenerationConfigured) => Boolean(
  configured() && clean(stripTags(article?.content || '')).length >= EXPLAIN_MIN_LENGTH
);

const SUPPRESSED = { archived: { $ne: true }, debugOnly: { $ne: true }, hiddenFromHome: { $ne: true } };

/** Owned, visible articles in the shape the rules read, with reading places attached. */
const loadRoomArticles = async ({ Article, ArticleReadingState = null, userId, match = {} }) => {
  const rows = await Article.aggregate([
    { $match: { userId, ...SUPPRESSED, ...match } },
    {
      $project: {
        title: 1, siteName: 1, author: 1, createdAt: 1, placement: 1, folder: 1, evergreen: 1,
        contentLength: { $strLenCP: { $ifNull: ['$content', ''] } },
        highlights: {
          $map: {
            input: { $ifNull: ['$highlights', []] },
            as: 'h',
            in: { _id: '$$h._id', text: '$$h.text', note: '$$h.note', tags: '$$h.tags', createdAt: '$$h.createdAt' }
          }
        }
      }
    },
    { $lookup: { from: 'folders', localField: 'folder', foreignField: '_id', as: 'folder' } },
    { $set: { folder: { $let: { vars: { f: { $first: '$folder' } }, in: { $cond: ['$$f', { name: '$$f.name', asFeed: '$$f.asFeed' }, null] } } } } }
  ]).option({ maxTimeMS: 10000 });
  if (!ArticleReadingState || !rows.length) return rows;
  const places = await ArticleReadingState.find({ userId, articleId: { $in: rows.map((row) => row._id) } })
    .select('articleId ratio visitedAt').lean();
  const byId = new Map(places.map((place) => [String(place.articleId), place]));
  return rows.map((row) => ({ ...row, readingState: byId.get(String(row._id)) || null }));
};

const buildReadingRoom = async ({ models, userId, now = new Date(), offset = 0, configured = isTextGenerationConfigured }) => {
  const articles = await loadRoomArticles({ ...models, userId });
  const weeks = weekBounds(now, offset);
  const reading = stillReading(articles, now);
  return {
    pick: pickForToday(articles, { now, offset, exclude: reading.map((row) => row.articleId) }),
    stillReading: reading,
    newFromSources: newFromSources(articles, now),
    weather: readingWeather(articles, weeks.lastWeek),
    worthSaying: isDinnerPartyTime(now, offset)
      ? (worthSaying(articles, weeks.thisWeek) || []).map(({ note, ...line }) => line)
      : [],
    modelAvailable: Boolean(configured())
  };
};

/** The same three lines for this week, read straight from the marks (no model). */
const loadWorthSaying = async ({ models, userId, now = new Date(), offset = 0 }) => {
  const window = weekBounds(now, offset).thisWeek;
  const articles = await loadRoomArticles({
    Article: models.Article,
    userId,
    match: { 'highlights.createdAt': { $gte: new Date(window.from) } }
  });
  return worthSaying(articles, window);
};

module.exports = {
  FINISHED,
  STARTED,
  weekBounds,
  offsetMinutesFor,
  isDinnerPartyTime,
  partwaySince,
  stillReading,
  pickForToday,
  newFromSources,
  readingWeather,
  worthSaying,
  phraseWorthSaying,
  explainItBack,
  canExplainBack,
  loadRoomArticles,
  buildReadingRoom,
  loadWorthSaying
};
