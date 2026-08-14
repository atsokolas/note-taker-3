const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { embedText } = require('../ai/embed');
const { searchVectorItems, rawCosineToAtlasScore } = require('../ai/vectorStore');

/**
 * readingLoopService — the Reading Loop.
 *
 * The daily loop borrows the world's clock (watchers, filings, releases).
 * This borrows the corpus's: what the user read this week, paired against the
 * part of their library they have forgotten, with the agent naming what the
 * two things do to each other.
 *
 * Five mechanics — connection, collision, resolution, convergence, thread —
 * are one retrieval engine with different selection and different framing.
 * Everything runs through `runRelationPass`, whose gates are the product:
 *
 *   1. The relation must come from a fixed enum. "Related" is not a member
 *      and must never become one — a card that can only say "these are
 *      related" is a horoscope and does not render.
 *   2. Both quotes must string-match into their source text. A hallucinated
 *      quote costs an indexOf to catch and would cost all of the product's
 *      credibility to ship.
 *   3. A pair that fails any gate is dropped, never repaired.
 *
 * Silence is a supported outcome. Filler is how this dies.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Windows are measured against *engagement*, not against when a row was
// written. See `lastEngagementAt` — a corpus that arrived in one bulk import
// has hundreds of rows created on the same day and nothing to learn from it.
const RECENT_WINDOW_MS = 30 * DAY_MS;
const THREAD_WINDOW_MS = 45 * DAY_MS;
const DORMANT_MIN_AGE_MS = 120 * DAY_MS;
const NO_REPEAT_MS = 60 * DAY_MS;
const SUPPRESSION_MS = 60 * DAY_MS;

// Similarity is a band, not a floor. Below the floor the two things are not
// about the same subject; above the ceiling they are the same document
// restated, which reads as a bug rather than a discovery.
//
// Tuned 2026-08-13 against the founder corpus (242 highlighted articles, 840
// real recent×dormant pairs, 384-dim embeddings): observed max 0.638, p99
// 0.490, p95 0.375, median 0.150. The floor sits just above p95, so a pair has
// to be in roughly the top 2% to be worth a model call. The ceiling never
// fires on real pairs — it exists to catch the same article saved twice, which
// scores ~0.99. Re-measure these if the embedding model changes; they are
// model-specific, not universal.
//
// These are RAW COSINE. Atlas reports `(1 + cosine) / 2`, so the band is
// converted at the point of comparison rather than stored pre-converted —
// storing the converted numbers would leave two conventions in the file and
// no way to tell which one a given constant is in.
const DEFAULT_SIMILARITY_MIN = 0.45;
const DEFAULT_SIMILARITY_MAX = 0.90;

const RECENT_SET_LIMIT = 40;
const CANDIDATES_PER_RECENT = 8;
const MAX_RELATION_PASSES = 6;
const CONVERGENCE_MIN_ITEMS = 3;
const THREAD_MIN_ITEMS = 4;
const DEFAULT_DAILY_RUN_CAP = 4;

// Every relation here is asymmetric — one text does something *to* the other.
// That is the whole point: "both texts emphasize X" is an association, and an
// association is a horoscope. A symmetric option is the escape hatch a model
// reaches for when there is no real relation, so no symmetric option exists.
// (Observed 2026-08-13: a `shared_mechanism` option produced exactly the mush
// this design is meant to exclude. It was removed rather than tuned.)
const RELATIONS = Object.freeze([
  'fills_gap',
  'contradicts',
  'generalizes',
  'supersedes'
]);

const RELATION_LABELS = Object.freeze({
  fills_gap: 'fills a gap in',
  contradicts: 'contradicts',
  generalizes: 'is the general case of',
  supersedes: 'supersedes',
  // Retired, kept so cards stored before it was removed still render.
  shared_mechanism: 'shares a mechanism with'
});

// Openers that announce an association rather than state a relation. A line
// beginning this way is describing symmetry — "both", "they share" — which is
// precisely what this feature is not. Cheaper and more reliable to reject the
// phrasing than to hope a prompt prevents it.
const SYMMETRIC_LINE_RE = /^(both|they|these|the two|each)\b/i;

// Placeholder text a model emits when it copies the shape of an instruction
// instead of writing about the texts. Observed live: "The older piece could not
// do X. This one does Y." — a card that says literally nothing, produced by an
// over-specified prompt. The prompt now shows an example instead of a template,
// and this catches the case anyway.
const PLACEHOLDER_LINE_RE = /\b(do(es)? (x|y)|<[^>]{1,30}>|\[[^\]]{1,30}\]|lorem ipsum)\b/i;

// A collision needs a conviction the user has actually been holding. A claim
// written from this week's reading, challenged by that same reading, is
// circular — observed live on 2026-07-27, where a claim generated from an
// article was "superseded" by the article it came from.
const CLAIM_MIN_AGE_MS = 30 * DAY_MS;

// Claims the maintenance process writes *about* a page rather than about its
// subject. They are process artifacts, not positions, and reading one back as
// something the user believes is nonsense.
const META_CLAIM_RE = /\b(the recurring pattern across|the page should|this page|the useful claim is narrower|topic label|source ledger|maintenance run)\b/i;

const MECHANICS = Object.freeze(['connection', 'collision', 'resolution', 'convergence', 'thread']);

const clean = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};

const stripHtml = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ');

const idString = (value) => String(value?._id || value || '');

const asPlain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Quote verification. Normalizes the cosmetic differences a model reliably
 * introduces — smart quotes, dash width, case, whitespace, a trailing ellipsis
 * — and nothing else. If the quote is not literally in the source after that,
 * the model invented it and the card is dropped.
 */
const normalizeForQuoteMatch = (value = '') => stripHtml(value)
  .replace(/[‘’‚‛]/g, "'")
  .replace(/[“”„‟]/g, '"')
  .replace(/[‐-―]/g, '-')
  .replace(/[…]/g, '...')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const quoteAppearsInSource = (quote = '', sourceText = '') => {
  // Strip the wrapping a model adds around a quote — surrounding quotation
  // marks, a leading or trailing ellipsis, trailing sentence punctuation.
  // What remains must be in the source verbatim.
  const needle = normalizeForQuoteMatch(quote)
    .replace(/^\.{3}\s*/, '')
    .replace(/\s*\.{3}$/, '')
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .replace(/[.,;:!?]+$/, '')
    .trim();
  if (needle.length < 12) return false;
  const haystack = normalizeForQuoteMatch(sourceText);
  if (!haystack) return false;
  return haystack.includes(needle);
};

/**
 * A relation line that repeats a quote back is not saying anything — the quote
 * is already on the card directly above it. Observed live: "The older piece
 * dreads a bull market, since it makes stocks more costly to buy" as the
 * *relation* for a card whose dormant quote was that exact sentence.
 */
const ECHO_WINDOW = 40;

const echoesQuote = (line = '', quote = '') => {
  const haystack = normalizeForQuoteMatch(line);
  const needle = normalizeForQuoteMatch(quote);
  if (!haystack || needle.length < ECHO_WINDOW) return false;
  for (let i = 0; i + ECHO_WINDOW <= needle.length; i += 8) {
    if (haystack.includes(needle.slice(i, i + ECHO_WINDOW))) return true;
  }
  return false;
};

const similarityBand = (env = process.env) => ({
  min: Number(env.READING_LOOP_SIMILARITY_MIN || DEFAULT_SIMILARITY_MIN),
  max: Number(env.READING_LOOP_SIMILARITY_MAX || DEFAULT_SIMILARITY_MAX)
});

/**
 * The band in the score space Atlas actually returns. Getting this wrong is
 * silent in the worst direction: a raw-cosine floor of 0.45 admits nearly every
 * pair in the corpus once scores are normalized, and the ceiling admits none of
 * the good ones — so the loop would return either noise or nothing, with no
 * error either way.
 */
const atlasSimilarityBand = (env = process.env) => {
  const raw = similarityBand(env);
  return { min: rawCosineToAtlasScore(raw.min), max: rawCosineToAtlasScore(raw.max) };
};

const pairKey = (recent = {}, dormant = {}) => [
  `${recent.type}:${recent.id}`,
  `${dormant.type}:${dormant.id}`
].sort().join('|');

const articleHref = (articleId) => `/articles/${encodeURIComponent(String(articleId || ''))}`;

const notebookHref = (entryId) => `/think?tab=notebook&entryId=${encodeURIComponent(String(entryId || ''))}`;

const questionHref = (questionId) => `/think?tab=questions&questionId=${encodeURIComponent(String(questionId || ''))}`;

const wikiClaimHref = (pageId, claimId) => `/wiki/workspace?page=${encodeURIComponent(String(pageId || ''))}&claimId=${encodeURIComponent(String(claimId || ''))}`;

const notebookText = (entry = {}) => {
  if (Array.isArray(entry.blocks) && entry.blocks.length) {
    return [entry.title || '', ...entry.blocks.map(block => block?.text || '')].filter(Boolean).join('\n');
  }
  return [entry.title || '', stripHtml(entry.content || '')].filter(Boolean).join('\n');
};

/**
 * When the user last actually engaged with this article — not when the row was
 * written. `createdAt` is the import date, and a Readwise or Notion import
 * stamps hundreds of articles with one timestamp, collapsing years of reading
 * into a single day. Highlight dates survive the import and are the honest
 * signal: a highlight is someone stopping to mark something.
 *
 * `lastOpenedAt` exists on the schema but nothing in the product writes it, so
 * it is deliberately not consulted here.
 */
const lastEngagementAt = (article = {}) => {
  const marked = (article.highlights || [])
    .map(highlight => asDate(highlight?.createdAt)?.getTime() || 0)
    .reduce((max, at) => Math.max(max, at), 0);
  // Opening counts. Highlighting is the stronger signal, but reading without
  // marking anything is still reading, and before `lastOpenedAt` was written
  // those sessions were invisible to this loop entirely.
  const opened = asDate(article.lastOpenedAt)?.getTime() || 0;
  const engaged = Math.max(marked, opened);
  if (engaged) return new Date(engaged);
  // Never opened, never marked: saving is the only act on record.
  return asDate(article.createdAt);
};

/**
 * What the model should read. Highlights are the user's attention; body text is
 * the publisher's. Quoting back what someone chose to mark is both a stronger
 * signal for pairing and a more meaningful quote to show them. Falls back to the
 * body only when there is nothing marked.
 */
const engagementText = (article = {}, budget = 3000) => {
  const marked = (article.highlights || [])
    .map(highlight => clean(highlight?.text, 400))
    .filter(Boolean)
    .slice(0, 12)
    .join(' ');
  const body = marked || stripHtml(article.content || '');
  return clean([article.title || '', body].filter(Boolean).join('. '), budget);
};

/**
 * The recent set — what the user actually touched in the last week.
 * Opened articles, highlights they made, notes they worked on. Not what was
 * ingested on their behalf: a watcher filing nobody read is not "your reading."
 */
const collectRecentSet = async ({ userId, models = {}, now = new Date(), windowMs = RECENT_WINDOW_MS, limit = RECENT_SET_LIMIT } = {}) => {
  const since = new Date(now.getTime() - windowMs);
  const items = [];

  if (models.Article?.find) {
    // Anything marked or opened inside the window. The article is the unit — an
    // article read across three sittings is one thing the user engaged with,
    // not three.
    const articles = await models.Article.find({
      userId,
      $or: [
        { 'highlights.createdAt': { $gte: since } },
        { lastOpenedAt: { $gte: since } }
      ]
    })
      .limit(limit)
      .select('_id title content createdAt lastOpenedAt highlights')
      .lean();
    (articles || []).forEach(article => {
      items.push({
        type: 'article',
        id: idString(article),
        title: clean(article.title || 'Untitled article', 200),
        text: engagementText(article),
        at: lastEngagementAt(article),
        savedAt: asDate(article.createdAt),
        href: articleHref(idString(article))
      });
    });
  }

  if (models.NotebookEntry?.find) {
    const entries = await models.NotebookEntry.find({ userId, updatedAt: { $gte: since } })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('_id title content blocks createdAt updatedAt')
      .lean();
    (entries || []).forEach(entry => {
      items.push({
        type: 'notebook_entry',
        id: idString(entry),
        title: clean(entry.title || 'Untitled note', 200),
        text: notebookText(entry),
        at: asDate(entry.updatedAt),
        savedAt: asDate(entry.createdAt),
        href: notebookHref(idString(entry))
      });
    });
  }

  return items
    .filter(item => clean(item.text).length >= 40)
    .sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))
    .slice(0, limit);
};

/**
 * Dormant, not merely old. The test is on last engagement, so something saved
 * two years ago but highlighted last Tuesday is correctly excluded — the user
 * is actively holding it, and being shown it is not a discovery.
 */
const isDormant = ({ engagedAt, now = new Date() } = {}) => {
  const engaged = asDate(engagedAt);
  if (!engaged) return false;
  return now.getTime() - engaged.getTime() >= DORMANT_MIN_AGE_MS;
};

const hydrateCandidate = async ({ userId, models = {}, type, objectId, now = new Date() } = {}) => {
  // A dormant highlight resolves to the article that holds it — the article is
  // the readable unit, and its other highlights are the context that makes the
  // pairing legible.
  if ((type === 'article' || type === 'highlight') && models.Article?.findOne) {
    const query = type === 'article'
      ? { _id: objectId, userId }
      : { userId, 'highlights._id': objectId };
    const article = await models.Article.findOne(query)
      .select('_id title content createdAt lastOpenedAt highlights')
      .lean();
    if (!article) return null;
    const engagedAt = lastEngagementAt(article);
    if (!isDormant({ engagedAt, now })) return null;
    return {
      type: 'article',
      id: idString(article),
      title: clean(article.title || 'Untitled article', 200),
      text: engagementText(article),
      at: engagedAt,
      savedAt: asDate(article.createdAt),
      href: articleHref(idString(article))
    };
  }

  if (type === 'notebook_entry' && models.NotebookEntry?.findOne) {
    const entry = await models.NotebookEntry.findOne({ _id: objectId, userId })
      .select('_id title content blocks createdAt updatedAt')
      .lean();
    if (!entry) return null;
    if (!isDormant({ engagedAt: entry.updatedAt || entry.createdAt, now })) return null;
    return {
      type: 'notebook_entry',
      id: idString(entry),
      title: clean(entry.title || 'Untitled note', 200),
      text: notebookText(entry),
      at: asDate(entry.updatedAt) || asDate(entry.createdAt),
      savedAt: asDate(entry.createdAt),
      href: notebookHref(idString(entry))
    };
  }

  return null;
};

/**
 * For one recent item, find dormant library items about the same subject.
 * Vector search gives us subject proximity; Mongo gives us the timestamps that
 * decide dormancy. Doing it in that order keeps the Qdrant payload contract
 * untouched — the dormancy filter is ours, not the index's.
 */
const findDormantMatches = async ({
  userId,
  models = {},
  recentItem,
  now = new Date(),
  env = process.env,
  limit = CANDIDATES_PER_RECENT,
  deps = {}
} = {}) => {
  const embed = deps.embedText || embedText;
  const vectorSearch = deps.searchVectorItems || searchVectorItems;
  const band = atlasSimilarityBand(env);
  const probe = clean(recentItem?.text, 3000);
  if (!probe) return [];

  let vector = null;
  try {
    vector = await embed(probe);
  } catch (_error) {
    return [];
  }
  if (!Array.isArray(vector) || !vector.length) return [];

  let hits = [];
  try {
    hits = await vectorSearch({
      VectorItem: models.VectorItem,
      userId,
      vector,
      limit: limit * 3,
      objectTypes: ['article', 'highlight', 'notebook_entry']
    });
  } catch (_error) {
    return [];
  }

  const seen = new Set();
  const scored = (hits || [])
    .map(row => ({ score: Number(row?.score || 0), payload: row || {} }))
    .filter(row => row.score >= band.min && row.score <= band.max)
    .filter(row => {
      const type = String(row.payload.objectType || '');
      const objectId = String(row.payload.objectId || '');
      if (!type || !objectId) return false;
      // Never pair an item with itself. A highlight hit resolves to its parent
      // article at hydration, so a highlight belonging to the recent article is
      // the recent article and must be excluded here too.
      if (objectId === String(recentItem.id)) return false;
      if (String(row.payload.metadata?.articleId || '') === String(recentItem.id)) return false;
      const key = `${type}:${objectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);

  const hydrated = [];
  const resolved = new Set([`article:${recentItem.id}`]);
  for (const row of scored) {
    if (hydrated.length >= limit) break;
    const candidate = await hydrateCandidate({
      userId,
      models,
      type: String(row.payload.objectType),
      objectId: String(row.payload.objectId),
      now
    });
    if (!candidate || clean(candidate.text).length < 40) continue;
    // Several highlight hits can resolve to one article; show it once.
    const resolvedKey = `${candidate.type}:${candidate.id}`;
    if (resolved.has(resolvedKey)) continue;
    resolved.add(resolvedKey);
    hydrated.push({ ...candidate, score: row.score });
  }
  return hydrated;
};

const excerptForPrompt = (item = {}, budget = 1600) => clean(item.text, budget);

/**
 * Slot-filling, not prose.
 *
 * Asking a small model to "write what one text does to the other" reliably
 * produces one of two non-answers: symmetric mush ("both texts emphasize…") or
 * two independent summaries ("the recent text emphasizes… the dormant text
 * highlights…"). Four rounds of prompt tightening each moved it to the next
 * failure rather than fixing it.
 *
 * So the model never writes the sentence. It fills two slots — what the older
 * text holds, and what the newer text *does to that* — and this module composes
 * the sentence around them. The connective is ours, which makes "two unrelated
 * summaries" structurally impossible: `newerDoes` has nowhere to be a standalone
 * sentence, because it is grammatically a predicate hanging off the older claim.
 */
const buildRelationPrompt = ({ recent, dormant, allowedRelations = RELATIONS }) => [
  'Two things from one person\'s library. The first they read recently. The second they read months ago and have not opened since.',
  '',
  `RECENT — "${recent.title}"`,
  excerptForPrompt(recent),
  '',
  `OLDER — "${dormant.title}"`,
  excerptForPrompt(dormant),
  '',
  'Fill in the blanks of this sentence about these two texts:',
  '',
  '  "The older piece ___(A)___. The newer one ___(B)___."',
  '',
  'A = what the older text holds or assumes. A verb phrase. No subject — the sentence already has one.',
  'B = what the newer text DOES TO THAT. It must act on A: contradict it, narrow it, supply what it lacked, replace it.',
  '',
  'Worked examples:',
  '  A: "treats a strong edge as reason enough to act"',
  '  B: "starts instead from what a bad year would cost, which the edge argument never prices in"',
  '',
  '  A: "says grading rubrics decay without saying why"',
  '  B: "names the cause: judge models drift toward their own priors"',
  '',
  'B must start with a verb that ACTS on A — adds, names, replaces, narrows, corrects, contradicts, supplies, qualifies, prices in.',
  'B must NOT start with a verb that merely describes — emphasizes, highlights, discusses, describes, mentions, focuses on, explores.',
  'Test for B: if it would read the same when the older text does not exist, it is wrong. Rewrite it so it refers back to A.',
  'Never begin A or B with "the", "this", "it", "they", "both" — they are verb phrases, not sentences.',
  'Never use placeholders like X or Y. Write about these two texts specifically.',
  '',
  'Return strict JSON:',
  '{',
  `  "relation": one of ${JSON.stringify(allowedRelations)},`,
  '  "recentQuote": a sentence copied VERBATIM from RECENT,',
  '  "olderQuote": a sentence copied VERBATIM from OLDER,',
  '  "olderHolds": the A phrase, under 140 characters,',
  '  "newerDoes": the B phrase, under 180 characters',
  '}',
  '',
  'Both quotes must be copied exactly, character for character. Do not paraphrase, do not trim mid-word, do not add ellipses.',
  'If the newer text does not actually act on the older one, return {"relation": null}. Returning null is correct and expected; a forced connection is worse than none.'
].join('\n');

// A slot is a verb phrase. Anything opening with a determiner or pronoun is a
// sentence in disguise — which is how "two independent summaries" gets back in.
const SLOT_BAD_OPENER_RE = /^(the|this|that|these|those|it|they|both|each|there|here|a|an)\b/i;

// Verbs that describe a text rather than act on a claim. "emphasizes the need
// to consider losses" is a summary wearing a verb phrase's clothes — it would
// read identically if the older text did not exist. The B slot has to do
// something *to* A: add, name, replace, narrow, correct, price in.
const DESCRIBING_VERB_RE = /^(emphasi[sz]es|highlights|discusses|describes|mentions|focuses|talks|explores|presents|covers|addresses|examines|considers|suggests that|notes that|states that)\b/i;

const cleanSlot = (value = '', limit = 180) => clean(value, limit)
  .replace(/^["'\u201c\u2018]+/, '')
  .replace(/["'\u201d\u2019]+$/, '')
  .replace(/\.+$/, '')
  .trim();

const isUsableSlot = (value = '', { mustAct = false } = {}) => {
  const slot = cleanSlot(value);
  if (slot.length < 12) return false;
  if (SLOT_BAD_OPENER_RE.test(slot)) return false;
  if (PLACEHOLDER_LINE_RE.test(slot)) return false;
  if (mustAct && DESCRIBING_VERB_RE.test(slot)) return false;
  return true;
};

/**
 * Compose the sentence from the slots. The model contributes only the two
 * clauses; the frame — and therefore the relation — is ours.
 */
const composeRelationLines = ({ olderHolds, newerDoes, dormant, recent }) => {
  const olderYear = dormant?.at ? new Date(dormant.at).getFullYear() : null;
  const recentYear = recent?.at ? new Date(recent.at).getFullYear() : null;
  const olderLabel = olderYear && recentYear && olderYear !== recentYear
    ? `The ${olderYear} piece`
    : 'The older piece';
  return [clean(`${olderLabel} ${cleanSlot(olderHolds, 140)}. The newer one ${cleanSlot(newerDoes, 180)}.`, 320)];
};

const safeJsonParse = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_secondError) {
      return null;
    }
  }
};

/**
 * The gates. Everything the model returns is treated as a proposal; this
 * function is what decides whether a card is allowed to exist.
 */
const applyRelationGates = ({ parsed, recent, dormant, allowedRelations = RELATIONS }) => {
  if (!parsed || typeof parsed !== 'object') return null;

  const relation = String(parsed.relation || '').trim();
  if (!relation || !allowedRelations.includes(relation)) return null;

  const recentQuote = clean(parsed.recentQuote, 400);
  // `dormantQuote` is the legacy field name; the prompt now asks for
  // `olderQuote` because "dormant" is our word, not a reader's.
  const dormantQuote = clean(parsed.olderQuote || parsed.dormantQuote, 400);
  if (!recentQuote || !dormantQuote) return null;
  if (!quoteAppearsInSource(recentQuote, recent.text)) return null;
  if (!quoteAppearsInSource(dormantQuote, dormant.text)) return null;

  // Slot form: the model fills two clauses and we build the sentence. Both
  // slots must be usable — half a relation is not a relation.
  if (!isUsableSlot(parsed.olderHolds)) return null;
  if (!isUsableSlot(parsed.newerDoes, { mustAct: true })) return null;
  const lines = composeRelationLines({
    olderHolds: parsed.olderHolds,
    newerDoes: parsed.newerDoes,
    dormant,
    recent
  }).filter(line => !echoesQuote(line, recentQuote) && !echoesQuote(line, dormantQuote));
  if (!lines.length) return null;

  return { relation, relationLabel: RELATION_LABELS[relation], recentQuote, dormantQuote, lines };
};

/**
 * A tally of why pairs did not become cards.
 *
 * "Nothing worth connecting this week" and "the model never answered" produce
 * an identical empty page, and for a while they did here: every failure path
 * returned null and the surface reported calm silence either way. That is the
 * same defect that let two vector stores die unnoticed — an empty result and a
 * broken backend must never be indistinguishable.
 *
 * Callers pass one of these into the relation pass and read it afterwards to
 * decide whether the emptiness is honest or a fault worth reporting.
 */
const newRelationDiagnostics = () => ({
  attempted: 0,
  declined: 0,
  gated: 0,
  upstreamErrors: 0,
  unconfigured: false,
  lastError: ''
});

const runRelationPass = async ({ recent, dormant, allowedRelations = RELATIONS, deps = {}, diagnostics = null } = {}) => {
  const diag = diagnostics || newRelationDiagnostics();
  const chat = deps.chatComplete || chatComplete;
  const configured = deps.isTextGenerationConfigured || isTextGenerationConfigured;
  if (!configured()) {
    diag.unconfigured = true;
    return null;
  }
  diag.attempted += 1;

  let completion = null;
  try {
    completion = await chat({
      // A judgment, not a draft. Naming what one text does to another is the
      // hardest reasoning in this feature and the quality of the prose tracks
      // the model closely — a small model reliably produces either symmetric
      // mush or two unrelated summaries. Route it with the critique profile
      // (`HF_AGENT_CRITIQUE_ROUTES` / `OPENROUTER_AGENT_CRITIQUE_ROUTES`) and
      // point that at the strongest model you are willing to pay for.
      route: 'critique',
      maxTokens: 600,
      temperature: 0.2,
      reasoningEffort: 'high',
      responseFormat: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You find real relations between two texts and quote them verbatim. You return null rather than manufacture a connection. You never paraphrase a quote.'
        },
        { role: 'user', content: buildRelationPrompt({ recent, dormant, allowedRelations }) }
      ]
    });
  } catch (error) {
    // The upstream refused or timed out. This is a fault, not an answer.
    diag.upstreamErrors += 1;
    diag.lastError = String(error?.message || error).slice(0, 200);
    return null;
  }

  const raw = typeof completion === 'string' ? completion : completion?.text || '';
  const parsed = safeJsonParse(raw);
  const gated = applyRelationGates({ parsed, recent, dormant, allowedRelations });
  if (!gated) {
    // The model declining ("relation": null) is a real answer and the design
    // expects it. Failing a gate — an unverifiable quote, symmetric phrasing —
    // is the model answering badly. Worth telling apart.
    if (parsed && parsed.relation === null) diag.declined += 1;
    else diag.gated += 1;
    return null;
  }
  return { ...gated, model: (typeof completion === 'object' && completion?.model) || 'hf' };
};

/**
 * Turn the tally into an outcome. A run that never reached the model, or whose
 * every attempt failed upstream, is `error` — the reader is told the results
 * are unknown rather than zero. A run where the model answered and simply found
 * nothing is `empty`, and says how much it looked at.
 */
const outcomeFromDiagnostics = (diag, emptyReason) => {
  if (diag.unconfigured) {
    return {
      status: 'error',
      reason: 'The model that reads your pairs is not configured, so nothing could be checked. This is not "nothing to connect" — it is unknown.'
    };
  }
  if (diag.attempted > 0 && diag.upstreamErrors === diag.attempted) {
    return {
      status: 'error',
      reason: `The model did not answer${diag.attempted > 1 ? ` on any of ${diag.attempted} attempts` : ''}. This is not "nothing to connect" — it is unknown.${diag.lastError ? ` (${diag.lastError})` : ''}`
    };
  }
  if (diag.attempted > 0) {
    const parts = [];
    if (diag.declined) parts.push(`${diag.declined} found no real relation`);
    if (diag.gated) parts.push(`${diag.gated} did not survive the quality gates`);
    if (diag.upstreamErrors) parts.push(`${diag.upstreamErrors} went unanswered`);
    const detail = parts.length ? ` — ${parts.join(', ')}` : '';
    return {
      status: 'empty',
      reason: `${emptyReason} Examined ${diag.attempted} pair${diag.attempted === 1 ? '' : 's'}${detail}.`
    };
  }
  return { status: 'empty', reason: emptyReason };
};

const cardFromRelation = ({ kind, recent, dormant, relation, now = new Date() }) => ({
  kind,
  relation: relation.relation,
  relationLabel: relation.relationLabel,
  lines: relation.lines,
  recent: {
    type: recent.type,
    id: recent.id,
    title: recent.title,
    at: recent.at ? recent.at.toISOString() : null,
    href: recent.href,
    quote: relation.recentQuote
  },
  dormant: {
    type: dormant.type,
    id: dormant.id,
    title: dormant.title,
    at: dormant.at ? dormant.at.toISOString() : null,
    href: dormant.href,
    quote: relation.dormantQuote
  },
  pairKey: pairKey(recent, dormant),
  generatedAt: now.toISOString()
});

const loadEdition = async ({ userId, models = {} }) => {
  if (!models.ReadingLoopEdition?.findOneAndUpdate) return null;
  return models.ReadingLoopEdition.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const isRecentlyShown = (edition, key, now = new Date()) => (edition?.history || [])
  .some(row => String(row.key) === String(key) && (now.getTime() - new Date(row.shownAt || 0).getTime()) < NO_REPEAT_MS);

const isSuppressed = (edition, kind, key, now = new Date()) => (edition?.suppressed || [])
  .some(row => String(row.kind) === String(kind)
    && String(row.key) === String(key)
    && (!row.until || new Date(row.until).getTime() > now.getTime()));

const pruneLedgers = (edition, now = new Date()) => {
  edition.history = (edition.history || [])
    .filter(row => (now.getTime() - new Date(row.shownAt || 0).getTime()) < NO_REPEAT_MS);
  edition.suppressed = (edition.suppressed || [])
    .filter(row => !row.until || new Date(row.until).getTime() > now.getTime());
};

const localDateKey = (now = new Date()) => now.toISOString().slice(0, 10);

const runCapFor = (env = process.env) => Math.max(1, Number(env.READING_LOOP_DAILY_RUN_CAP || DEFAULT_DAILY_RUN_CAP));

const runsUsedToday = (edition, kind, now = new Date()) => {
  const today = localDateKey(now);
  const row = (edition?.runCounts || []).find(entry => String(entry.kind) === String(kind) && String(entry.localDate) === today);
  return Number(row?.count || 0);
};

const noteRun = (edition, kind, now = new Date()) => {
  const today = localDateKey(now);
  edition.runCounts = (edition.runCounts || []).filter(row => String(row.localDate) === today);
  const row = edition.runCounts.find(entry => String(entry.kind) === String(kind));
  if (row) row.count = Number(row.count || 0) + 1;
  else edition.runCounts.push({ kind, localDate: today, count: 1 });
};

const recordMechanic = (edition, kind, { card = null, status, reason = '', model = '', now = new Date() }) => {
  edition[kind] = { card, status, reason, model, generatedAt: now };
  if (card?.pairKey) edition.history.push({ kind, key: card.pairKey, shownAt: now });
  if (card?.threadKey) edition.history.push({ kind, key: card.threadKey, shownAt: now });
};

/**
 * Connection — the lead. No relation preference; the best-scoring dormant pair
 * that clears the gates wins. Complete on its own: a user who reads it and
 * closes the tab got the value.
 */
const generateConnection = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {}, edition = null } = {}) => {
  const recentSet = await collectRecentSet({ userId, models, now });
  if (!recentSet.length) {
    return { status: 'empty', reason: 'Nothing read this week.' };
  }

  const diag = newRelationDiagnostics();
  let passes = 0;
  for (const recent of recentSet) {
    if (passes >= MAX_RELATION_PASSES) break;
    const candidates = await findDormantMatches({ userId, models, recentItem: recent, now, env, deps });
    for (const dormant of candidates) {
      if (passes >= MAX_RELATION_PASSES) break;
      const key = pairKey(recent, dormant);
      if (edition && isRecentlyShown(edition, key, now)) continue;
      passes += 1;
      const relation = await runRelationPass({ recent, dormant, deps, diagnostics: diag });
      if (relation) {
        return {
          status: 'ready',
          model: relation.model,
          card: cardFromRelation({ kind: 'connection', recent, dormant, relation, now })
        };
      }
    }
  }

  return outcomeFromDiagnostics(diag, 'Nothing worth connecting this week.');
};

/**
 * Collision — the dormant side is restricted to claims the user actually
 * committed to, and the relation to the two that challenge them. Ends in the
 * shipped check-in ritual rather than a new write path.
 */
const collectClaimCandidates = async ({ userId, models = {}, now = new Date() } = {}) => {
  if (!models.WikiPage?.find) return [];
  const pages = await models.WikiPage.find({ userId, status: { $ne: 'archived' } })
    .select('_id title slug claims createdAt')
    .lean();
  const rows = [];
  (pages || []).forEach(page => {
    (page.claims || []).forEach(claim => {
      if (claim?.checkInStatus === 'retired' || claim?.retiredAt) return;
      const sources = Math.max(
        Array.isArray(claim.sourceRefIds) ? claim.sourceRefIds.length : 0,
        Array.isArray(claim.citationIds) ? claim.citationIds.length : 0
      );
      if (sources < 2) return;
      const text = clean(claim.text, 800);
      if (text.length < 40) return;
      // A claim the agent wrote this week, from this week's reading, is not a
      // conviction the user has been holding — challenging it with its own
      // source is circular. Only claims that have stood for a while qualify.
      const writtenAt = asDate(claim.createdAt) || asDate(page.createdAt);
      if (!writtenAt || now.getTime() - writtenAt.getTime() < CLAIM_MIN_AGE_MS) return;
      // Maintenance bookkeeping that talks about the page rather than the
      // subject. These are artifacts of the wiki process, not positions.
      if (META_CLAIM_RE.test(text)) return;
      rows.push({
        type: 'claim',
        id: `${idString(page)}:${claim.claimId}`,
        pageId: idString(page),
        pageTitle: clean(page.title || 'Untitled wiki page', 200),
        claimId: String(claim.claimId),
        title: clean(page.title || 'Untitled wiki page', 200),
        text,
        at: asDate(claim.createdAt) || asDate(page.createdAt),
        href: wikiClaimHref(idString(page), claim.claimId),
        sourceCount: sources
      });
    });
  });
  return rows;
};

/**
 * Rank stored claims against one recent item. Semantic first, term overlap only
 * as a floor — the whole point of a collision is catching a paraphrased
 * disagreement, and shared vocabulary is a poor proxy for that.
 */
const termOverlapRank = (recent, rows, textOf, minOverlap, limit) => {
  const recentTerms = new Set(normalizeForQuoteMatch(recent.text).split(' ').filter(word => word.length > 4));
  return rows
    .map(row => {
      const terms = normalizeForQuoteMatch(textOf(row)).split(' ').filter(word => word.length > 4);
      return { row, overlap: terms.filter(word => recentTerms.has(word)).length };
    })
    .filter(entry => entry.overlap >= minOverlap)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map(entry => entry.row);
};

const rankClaimsForRecent = async ({ userId, models = {}, recent, claims, probe, env = process.env, deps = {} } = {}) => {
  const vectorSearch = deps.searchVectorItems || searchVectorItems;
  const band = atlasSimilarityBand(env);
  const byId = new Map(claims.map(claim => [claim.id, claim]));
  if (Array.isArray(probe) && probe.length) {
    try {
      const hits = await vectorSearch({
        VectorItem: models.VectorItem,
        userId,
        vector: probe,
        limit: 12,
        objectTypes: ['wiki_claim']
      });
      const ranked = (hits || [])
        .filter(hit => Number(hit?.score || 0) >= band.min && Number(hit.score) <= band.max)
        .map(hit => byId.get(String(hit.objectId || '')))
        .filter(Boolean)
        .slice(0, 3);
      if (ranked.length) return ranked.map(claim => ({ claim }));
    } catch (_error) {
      // Index unreachable — fall through to the floor.
    }
  }
  return termOverlapRank(recent, claims, claim => claim.text, 3, 3).map(claim => ({ claim }));
};

const generateCollision = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {}, edition = null } = {}) => {
  const [recentSet, claims] = await Promise.all([
    collectRecentSet({ userId, models, now }),
    collectClaimCandidates({ userId, models, now })
  ]);
  if (!recentSet.length) return { status: 'empty', reason: 'Nothing read this week.' };
  if (!claims.length) return { status: 'empty', reason: 'No claims with two or more sources to challenge yet.' };

  const embed = deps.embedText || embedText;
  const diag = newRelationDiagnostics();
  let passes = 0;
  for (const recent of recentSet) {
    if (passes >= MAX_RELATION_PASSES) break;
    let probe = null;
    try {
      probe = await embed(clean(recent.text, 3000));
    } catch (_error) {
      continue;
    }
    if (!Array.isArray(probe)) continue;

    // Prefer the semantic index; fall back to term overlap when the claim
    // collection is empty (nothing indexed yet, or the index is unreachable).
    // Word counting misses paraphrase entirely, which is most of what a real
    // contradiction looks like — it is a floor, not the intent.
    const ranked = await rankClaimsForRecent({ userId, models, recent, claims, probe, env, deps });

    for (const { claim } of ranked) {
      if (passes >= MAX_RELATION_PASSES) break;
      const key = pairKey(recent, claim);
      if (edition && isRecentlyShown(edition, key, now)) continue;
      passes += 1;
      const relation = await runRelationPass({
        recent,
        dormant: claim,
        allowedRelations: ['contradicts', 'supersedes'],
        deps,
        diagnostics: diag
      });
      if (relation) {
        const card = cardFromRelation({ kind: 'collision', recent, dormant: claim, relation, now });
        card.claim = {
          pageId: claim.pageId,
          pageTitle: claim.pageTitle,
          claimId: claim.claimId,
          text: claim.text,
          sourceCount: claim.sourceCount,
          href: claim.href
        };
        return { status: 'ready', model: relation.model, card };
      }
    }
  }

  return outcomeFromDiagnostics(diag, 'Nothing this week challenges a claim you hold.');
};

/**
 * Resolution — a question the user asked months ago that this week's reading
 * bears on. The dormant side is the open-question set rather than the library.
 */
const collectOpenQuestions = async ({ userId, models = {}, now = new Date() } = {}) => {
  if (!models.Question?.find) return [];
  const cutoff = new Date(now.getTime() - DORMANT_MIN_AGE_MS);
  const questions = await models.Question.find({ userId, status: 'open', createdAt: { $lte: cutoff } })
    .sort({ createdAt: 1 })
    .limit(60)
    .lean();
  return (questions || [])
    .map(question => ({
      type: 'question',
      id: idString(question),
      title: clean(question.text || 'Open question', 200),
      text: clean(question.text || '', 600),
      at: asDate(question.createdAt),
      href: questionHref(idString(question))
    }))
    .filter(question => question.text.length >= 20);
};

const generateResolution = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {}, edition = null } = {}) => {
  const [recentSet, questions] = await Promise.all([
    collectRecentSet({ userId, models, now }),
    collectOpenQuestions({ userId, models, now })
  ]);
  if (!recentSet.length) return { status: 'empty', reason: 'Nothing read this week.' };
  if (!questions.length) return { status: 'empty', reason: 'No open questions older than four months.' };

  const diag = newRelationDiagnostics();
  let passes = 0;
  for (const question of questions) {
    if (passes >= MAX_RELATION_PASSES) break;
    const ranked = termOverlapRank(question, recentSet, item => item.text, 2, 2);

    for (const recent of ranked) {
      if (passes >= MAX_RELATION_PASSES) break;
      const key = pairKey(recent, question);
      if (edition && isRecentlyShown(edition, key, now)) continue;
      passes += 1;
      const relation = await runRelationPass({
        recent,
        dormant: question,
        allowedRelations: ['fills_gap', 'generalizes', 'contradicts'],
        deps,
        diagnostics: diag
      });
      if (relation) {
        const card = cardFromRelation({ kind: 'resolution', recent, dormant: question, relation, now });
        card.question = { id: question.id, text: question.text, href: question.href, at: card.dormant.at };
        return { status: 'ready', model: relation.model, card };
      }
    }
  }

  return outcomeFromDiagnostics(diag, 'Nothing this week bears on an old question.');
};

/**
 * Convergence — the one-to-many case. Three or more of this week's items all
 * landing on the same dormant item. Two is a pair, not a pattern, so the
 * minimum is real and enforced.
 */
const generateConvergence = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {}, edition = null } = {}) => {
  // Convergence is a pattern, not an event, so it reads the wider window the
  // thread mechanic uses. On a real reading cadence (~5 marked articles a
  // month) the 30-day window rarely holds the three items this needs, and a
  // mechanic that is structurally impossible is worse than one that is quiet.
  const recentSet = await collectRecentSet({ userId, models, now, windowMs: THREAD_WINDOW_MS });
  if (recentSet.length < CONVERGENCE_MIN_ITEMS) {
    return { status: 'empty', reason: 'Too little read recently to converge on anything.' };
  }

  const byDormant = new Map();
  for (const recent of recentSet) {
    const candidates = await findDormantMatches({ userId, models, recentItem: recent, now, env, deps, limit: 4 });
    candidates.forEach(dormant => {
      const key = `${dormant.type}:${dormant.id}`;
      if (!byDormant.has(key)) byDormant.set(key, { dormant, recents: [] });
      byDormant.get(key).recents.push(recent);
    });
  }

  const clusters = Array.from(byDormant.values())
    .filter(row => row.recents.length >= CONVERGENCE_MIN_ITEMS)
    .sort((a, b) => b.recents.length - a.recents.length);

  const diag = newRelationDiagnostics();
  for (const cluster of clusters) {
    const key = `convergence:${cluster.dormant.type}:${cluster.dormant.id}`;
    if (edition && isRecentlyShown(edition, key, now)) continue;
    const relation = await runRelationPass({ recent: cluster.recents[0], dormant: cluster.dormant, deps, diagnostics: diag });
    if (!relation) continue;
    const card = cardFromRelation({ kind: 'convergence', recent: cluster.recents[0], dormant: cluster.dormant, relation, now });
    card.pairKey = key;
    card.converging = cluster.recents.map(recent => ({
      type: recent.type,
      id: recent.id,
      title: recent.title,
      at: recent.at ? recent.at.toISOString() : null,
      href: recent.href
    }));
    return { status: 'ready', model: relation.model, card };
  }

  return outcomeFromDiagnostics(diag, 'Nothing converged this week.');
};

/**
 * The unnamed thread — no dormant side. Clusters recent reading and finds a
 * group with no wiki page covering it. Every source is named and clickable:
 * the count is real or the card does not render.
 */
const buildThreadPrompt = (items = []) => [
  'Someone has been reading these things over the past three weeks. They have not named what connects them.',
  '',
  ...items.map((item, index) => `${index + 1}. "${item.title}" — ${clean(item.text, 320)}`),
  '',
  'Name the thread running through them. Return strict JSON:',
  '{ "name": a short noun phrase under 60 characters, "line": one sentence under 240 characters saying what the thread is about }',
  '',
  'If these items do not share a real thread, return {"name": null}. Returning null is correct; a vague label like "technology" or "ideas" is worse than none.'
].join('\n');

const generateThread = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {}, edition = null } = {}) => {
  const chat = deps.chatComplete || chatComplete;
  const configured = deps.isTextGenerationConfigured || isTextGenerationConfigured;
  if (!configured()) {
    return {
      status: 'error',
      reason: 'The model that names threads is not configured, so nothing could be checked. This is not "no thread" — it is unknown.'
    };
  }

  const recentSet = await collectRecentSet({ userId, models, now, windowMs: THREAD_WINDOW_MS, limit: RECENT_SET_LIMIT });
  if (recentSet.length < THREAD_MIN_ITEMS) {
    return { status: 'empty', reason: 'Too little read recently to find a thread.' };
  }

  // Cluster by mutual proximity: seed on each item, gather the recent items
  // that sit near it, keep groups of four or more.
  const clusters = [];
  const embed = deps.embedText || embedText;
  const used = new Set();
  for (const seed of recentSet) {
    if (used.has(`${seed.type}:${seed.id}`)) continue;
    let seedVector = null;
    try {
      seedVector = await embed(clean(seed.text, 3000));
    } catch (_error) {
      continue;
    }
    if (!Array.isArray(seedVector)) continue;
    const seedTerms = new Set(normalizeForQuoteMatch(seed.text).split(' ').filter(word => word.length > 5));
    const members = recentSet.filter(item => {
      if (`${item.type}:${item.id}` === `${seed.type}:${seed.id}`) return true;
      const terms = normalizeForQuoteMatch(item.text).split(' ').filter(word => word.length > 5);
      return terms.filter(word => seedTerms.has(word)).length >= 4;
    });
    if (members.length >= THREAD_MIN_ITEMS) {
      members.forEach(member => used.add(`${member.type}:${member.id}`));
      clusters.push(members);
    }
  }
  if (!clusters.length) return { status: 'empty', reason: 'No cluster of four or more related items.' };

  const pages = models.WikiPage?.find
    ? await models.WikiPage.find({ userId, status: { $ne: 'archived' } }).select('title').lean()
    : [];
  const pageTitles = new Set((pages || []).map(page => normalizeForQuoteMatch(page.title || '')));

  const diag = newRelationDiagnostics();
  for (const members of clusters) {
    const threadKey = `thread:${members.map(item => `${item.type}:${item.id}`).sort().join(',')}`;
    if (edition && (isRecentlyShown(edition, threadKey, now) || isSuppressed(edition, 'thread', threadKey, now))) continue;

    let completion = null;
    diag.attempted += 1;
    try {
      completion = await chat({
        route: 'artifact_draft',
        maxTokens: 220,
        temperature: 0.3,
        reasoningEffort: 'low',
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You name the thread running through a set of readings, or return null. You never produce a vague label.' },
          { role: 'user', content: buildThreadPrompt(members) }
        ]
      });
    } catch (error) {
      diag.upstreamErrors += 1;
      diag.lastError = String(error?.message || error).slice(0, 200);
      continue;
    }
    const parsed = safeJsonParse(typeof completion === 'string' ? completion : completion?.text || '');
    const name = clean(parsed?.name, 60);
    const line = clean(parsed?.line, 240);
    if (!name || !line) { diag.declined += 1; continue; }
    // A thread the wiki already covers is not unnamed.
    if (pageTitles.has(normalizeForQuoteMatch(name))) continue;

    return {
      status: 'ready',
      model: (typeof completion === 'object' && completion?.model) || 'hf',
      card: {
        kind: 'thread',
        name,
        line,
        threadKey,
        sources: members.map(item => ({
          type: item.type,
          id: item.id,
          title: item.title,
          at: item.at ? item.at.toISOString() : null,
          href: item.href
        })),
        generatedAt: now.toISOString()
      }
    };
  }

  return outcomeFromDiagnostics(diag, 'No unnamed thread right now.');
};

const GENERATORS = {
  connection: generateConnection,
  collision: generateCollision,
  resolution: generateResolution,
  convergence: generateConvergence,
  thread: generateThread
};

const runMechanic = async ({ userId, models = {}, kind, now = new Date(), env = process.env, deps = {}, enforceCap = true } = {}) => {
  if (!MECHANICS.includes(kind)) {
    const error = new Error('Unknown Reading Loop mechanic.');
    error.statusCode = 400;
    throw error;
  }
  const edition = await loadEdition({ userId, models });
  if (!edition) {
    const error = new Error('Reading Loop storage unavailable.');
    error.statusCode = 500;
    throw error;
  }
  const cap = runCapFor(env);
  if (enforceCap && runsUsedToday(edition, kind, now) >= cap) {
    const error = new Error(`Daily limit reached for ${kind}.`);
    error.statusCode = 429;
    error.retryAfterLocalDate = true;
    throw error;
  }

  pruneLedgers(edition, now);
  const result = await GENERATORS[kind]({ userId, models, now, env, deps, edition });
  recordMechanic(edition, kind, { ...result, now });
  if (enforceCap) noteRun(edition, kind, now);
  await edition.save();
  return { mechanic: serializeMechanic(edition[kind], kind, edition, now, env), edition };
};

const serializeMechanic = (mechanic = {}, kind, edition = {}, now = new Date(), env = process.env) => ({
  kind,
  status: String(mechanic?.status || 'idle'),
  reason: String(mechanic?.reason || ''),
  card: mechanic?.card || null,
  generatedAt: mechanic?.generatedAt ? new Date(mechanic.generatedAt).toISOString() : null,
  runsUsedToday: runsUsedToday(edition, kind, now),
  dailyRunCap: runCapFor(env)
});

/**
 * Cold start is a real state, not an error. A corpus younger than the dormancy
 * threshold cannot produce a connection, and faking one would be the worst
 * possible first impression.
 */
const assessCorpusAge = async ({ userId, models = {}, now = new Date() } = {}) => {
  if (!models.Article?.find) return { ready: true, oldestAt: null, readyAt: null };
  // Oldest *engagement*, not oldest row. An imported archive is created today
  // and read years ago; judging it by row age would wrongly gate a rich corpus
  // behind a four-month wait.
  const marked = await models.Article.find({ userId, 'highlights.0': { $exists: true } })
    .sort({ createdAt: 1 })
    .limit(200)
    .select('createdAt lastOpenedAt highlights')
    .lean();
  const engagements = (marked || [])
    .map(article => lastEngagementAt(article)?.getTime() || 0)
    .filter(Boolean);
  let oldestAt = engagements.length ? new Date(Math.min(...engagements)) : null;
  if (!oldestAt) {
    const oldest = await models.Article.findOne({ userId }).sort({ createdAt: 1 }).select('createdAt').lean();
    oldestAt = asDate(oldest?.createdAt);
  }
  if (!oldestAt) return { ready: false, oldestAt: null, readyAt: null };
  const readyAt = new Date(oldestAt.getTime() + DORMANT_MIN_AGE_MS);
  return { ready: readyAt.getTime() <= now.getTime(), oldestAt, readyAt };
};

const buildReadingLoopEdition = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {} } = {}) => {
  const edition = await loadEdition({ userId, models });
  if (!edition) {
    const error = new Error('Reading Loop storage unavailable.');
    error.statusCode = 500;
    throw error;
  }
  const corpus = await assessCorpusAge({ userId, models, now });

  return {
    generatedAt: now.toISOString(),
    coldStart: corpus.ready ? null : {
      oldestAt: corpus.oldestAt ? corpus.oldestAt.toISOString() : null,
      readyAt: corpus.readyAt ? corpus.readyAt.toISOString() : null,
      reason: corpus.oldestAt
        ? 'The loop needs four months of library behind it before a dormant connection means anything.'
        : 'Save a few things first — the loop reads your library back to you.'
    },
    connection: serializeMechanic(edition.connection, 'connection', edition, now, env),
    collision: serializeMechanic(edition.collision, 'collision', edition, now, env),
    resolution: serializeMechanic(edition.resolution, 'resolution', edition, now, env),
    convergence: serializeMechanic(edition.convergence, 'convergence', edition, now, env),
    thread: serializeMechanic(edition.thread, 'thread', edition, now, env)
  };
};

const suppressThread = async ({ userId, models = {}, threadKey, now = new Date() } = {}) => {
  const edition = await loadEdition({ userId, models });
  if (!edition) return null;
  pruneLedgers(edition, now);
  edition.suppressed.push({ kind: 'thread', key: String(threadKey), until: new Date(now.getTime() + SUPPRESSION_MS) });
  if (String(edition.thread?.card?.threadKey || '') === String(threadKey)) {
    edition.thread = { card: null, status: 'empty', reason: 'Dismissed. Not resurfacing for 60 days.', generatedAt: now, model: '' };
  }
  await edition.save();
  return edition;
};

/**
 * Weekly precompute for the lead. Runs without the daily cap because it is the
 * system's own cadence, not the user's.
 */
const CONNECTION_REFRESH_MS = 7 * DAY_MS;

const refreshConnectionIfStale = async ({ userId, models = {}, now = new Date(), env = process.env, deps = {} } = {}) => {
  const edition = await loadEdition({ userId, models });
  if (!edition) return null;
  const generatedAt = edition.connection?.generatedAt ? new Date(edition.connection.generatedAt).getTime() : 0;
  if (generatedAt && now.getTime() - generatedAt < CONNECTION_REFRESH_MS) {
    return { skipped: true, reason: 'fresh' };
  }
  const corpus = await assessCorpusAge({ userId, models, now });
  if (!corpus.ready) return { skipped: true, reason: 'cold_start' };
  const { mechanic } = await runMechanic({ userId, models, kind: 'connection', now, env, deps, enforceCap: false });
  return { skipped: false, mechanic };
};

module.exports = {
  buildReadingLoopEdition,
  runMechanic,
  refreshConnectionIfStale,
  suppressThread,
  assessCorpusAge,
  MECHANICS,
  RELATIONS,
  RELATION_LABELS,
  __testables: {
    applyRelationGates,
    newRelationDiagnostics,
    outcomeFromDiagnostics,
    assessCorpusAge,
    buildRelationPrompt,
    buildThreadPrompt,
    cardFromRelation,
    collectClaimCandidates,
    collectOpenQuestions,
    collectRecentSet,
    findDormantMatches,
    generateConnection,
    generateCollision,
    generateConvergence,
    generateResolution,
    generateThread,
    hydrateCandidate,
    engagementText,
    isDormant,
    isRecentlyShown,
    lastEngagementAt,
    isSuppressed,
    normalizeForQuoteMatch,
    pairKey,
    pruneLedgers,
    quoteAppearsInSource,
    runRelationPass,
    RELATIONS,
    composeRelationLines,
    isUsableSlot,
    runsUsedToday,
    safeJsonParse,
    serializeMechanic,
    similarityBand,
    DORMANT_MIN_AGE_MS,
    NO_REPEAT_MS,
    RECENT_WINDOW_MS
  }
};
