const crypto = require('crypto');
const mongoose = require('mongoose');
const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { embedTexts, isEmbeddingConfigured } = require('../ai/embed');
const { quotedIn, words } = require('./agentGrounding');
const { sourcePassages, topPassages } = require('./agentRetrieval');
const { buildHighlightDocument } = require('../utils/highlightUtils');
const {
  JudgmentChangeProposalError,
  assertBinding,
  buildReadingProposal,
  isReading,
  readingReceiptId
} = require('./judgmentChangeProposalService');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');

/* Reading talks back.

   New words meet the views you hold. When a source arrives, the views it
   might bear on are read against it, one narrow question each: does this
   passage set support, challenge, or say nothing about this exact sentence?
   What you said would change your mind is asked too, as its own candidate:
   does this passage set report that the condition has been met? A met
   condition is a challenge, marked with the words you wrote.
   A verdict becomes a pending passage on the view only when the model quotes
   the source verbatim. When you write in Think, the sentences of the note
   are read the same way, and the one that contradicts a view you hold is
   named beside the note.

   Candidates: the views whose sentence the text's passages answer best, by
   words (BM25) and, when embeddings are on, by meaning, fused by rank. With
   no embeddings the word ranking alone is the candidate list.

   Source arrival. Eligibility: held, unresolved views (not set aside, no
   verdict), held before the source was saved, and each one's open tests
   (the resolution criteria and falsifiers not retired or triggered); passages
   from that one source only. Quality bar: a support, challenge, or "meets"
   verdict whose quote is found word for word in the stored text; at most five
   readings per source, a met test asked before a sentence, one proposal per
   view per source, three per reader per day.
   Silence: nothing appears on the view.

   A note. Eligibility: the same held, unresolved views; sentences of six
   words or more in the saved note. Quality bar: a "contradicts" verdict given
   with high confidence; each sentence is asked once, ever; one
   line per note at a time, and a line set aside never returns.
   Silence: no rule, no margin line.

   Without a model there is no reading at all, and no keyword guess stands in
   for one. */

const VIEWS_PER_SOURCE = 5;
const PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_QUOTE_WORDS = 5;

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const time = value => {
  const at = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(at) ? at : null;
};
const list = value => (Array.isArray(value) ? value : []);

const isOpenView = (page) => {
  const judgment = page?.judgment || {};
  return Boolean(clean(judgment.currentJudgment))
    && !['parked', 'closed', 'archived'].includes(judgment.status)
    && !list(judgment.verdicts).length;
};

const heldSince = page => time(page?.judgment?.startedAt) ?? time(page?.judgment?.bornAt) ?? time(page?.createdAt);

const alreadyFiled = (page, articleId) => [...list(page?.judgment?.why), ...list(page?.judgment?.against)]
  .some(reason => String(reason?.acceptedFrom || '').startsWith(`highlight:${articleId}:`));

const VIEW_FIELDS = '_id title createdAt judgment.currentJudgment judgment.status judgment.startedAt judgment.bornAt judgment.verdicts judgment.why judgment.against judgment.resolutionCriteria judgment.falsifiers';
const heldViews = async ({ WikiPage, userId }) => (await WikiPage.find({
  userId,
  status: { $ne: 'archived' },
  'judgment.currentJudgment': { $type: 'string', $ne: '' }
}).select(VIEW_FIELDS).lean()).filter(isOpenView);

const sentenceOf = page => clean(page?.judgment?.currentJudgment);

/* What would change your mind, still open: the criteria line and each
   falsifier not yet retired or triggered, in the words that name the signal. */
const testsOf = page => [...new Set([
  clean(page?.judgment?.resolutionCriteria, 600),
  ...list(page?.judgment?.falsifiers)
    .filter(falsifier => !['retired', 'triggered'].includes(falsifier?.status))
    .map(falsifier => clean(falsifier?.observableSignal || falsifier?.text, 600))
].filter(Boolean))];

/* The asks a view puts to a source: its sentence, and each open test. */
const asksOf = page => [page, ...testsOf(page).map(condition => ({ ...page, condition }))];
const askedText = ask => ask.condition || sentenceOf(ask);

/* Meaning: each view's sentence beside the text's passages, one embedding
   call. Below the floor a passage is only near the view in topic. */
const SEMANTIC_FLOOR = 0.5;
const EMBEDDED_PASSAGES = 24;
const RRF_K = 60;

const cosine = (left = [], right = []) => {
  let dot = 0; let a = 0; let b = 0;
  left.forEach((value, index) => { dot += value * right[index]; a += value * value; b += right[index] * right[index]; });
  return a && b ? dot / Math.sqrt(a * b) : 0;
};

const nearest = async ({ views, passages, embed, textOf }) => {
  const texts = passages.slice(0, EMBEDDED_PASSAGES);
  if (!embed || !views.length || !texts.length) return new Map();
  const vectors = await embed([...views.map(textOf), ...texts]).catch(() => null);
  if (!Array.isArray(vectors) || vectors.length !== views.length + texts.length) return new Map();
  const passageVectors = vectors.slice(views.length);
  return new Map(views.map((page, index) => [page, texts
    .map((text, at) => ({ text, score: cosine(vectors[index], passageVectors[at]) }))
    .filter(passage => passage.score >= SEMANTIC_FLOOR)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)]));
};

const interleave = (left = [], right = []) => Array.from(
  { length: Math.max(left.length, right.length) },
  (_, index) => [left[index], right[index]]
).flat().filter(Boolean);

const defaultEmbed = () => (isEmbeddingConfigured() ? embedTexts : null);

/* The text is the query's corpus turned around: each view asks the text
   which of its passages answer it, and the views answered best, by either
   signal, are the ones worth a reading. */
const candidateViews = async ({ views, passages, embed = null, limit = VIEWS_PER_SOURCE, textOf = sentenceOf }) => {
  const byWords = new Map(views.map(page => [page, topPassages({ passages, query: textOf(page), limit: 3 })]));
  const byMeaning = await nearest({ views, passages, embed, textOf });
  const rankBy = (found) => new Map(views
    .filter(page => found.get(page)?.length)
    .sort((left, right) => found.get(right)[0].score - found.get(left)[0].score)
    .map((page, rank) => [page, rank]));
  const wordRank = rankBy(byWords);
  const meaningRank = rankBy(byMeaning);
  const fused = page => [wordRank, meaningRank]
    .reduce((sum, ranks) => sum + (ranks.has(page) ? 1 / (RRF_K + ranks.get(page)) : 0), 0);
  return views
    .filter(page => wordRank.has(page) || meaningRank.has(page))
    .sort((left, right) => fused(right) - fused(left))
    .slice(0, limit)
    .map(page => ({
      page,
      // Taken in turn from each ranking, so the passage that chose the view by
      // meaning is read even when the words ranking found three of its own.
      passages: [...new Set(interleave(byWords.get(page), byMeaning.get(page)).map(passage => passage.text))]
        .slice(0, 3)
        .map(text => ({ text }))
    }));
};

const promptFor = ({ sentence, passages }) => [
  `The sentence: "${sentence}"`,
  '',
  'Read this passage set. Does it support, challenge, or say nothing about this exact sentence? Quote the passage verbatim.',
  'Sharing words with the sentence is not support or challenge; say nothing unless the passage bears on what the sentence claims.',
  '',
  ...passages.map((passage, index) => `[${index + 1}] ${passage.text}`),
  '',
  'Answer with JSON only: {"stance": "support" | "challenge" | "nothing", "quote": "the exact words from one passage"}'
].join('\n');

const testPromptFor = ({ sentence, condition, passages }) => [
  `They hold: "${sentence}"`,
  `They said they would change their mind if: "${condition}"`,
  '',
  'Read this passage set. Does it report that this condition has been met? Quote the passage verbatim.',
  'Sharing words with the condition is not meeting it; a passage that only discusses, predicts, or denies it meets nothing.',
  '',
  ...passages.map((passage, index) => `[${index + 1}] ${passage.text}`),
  '',
  'Answer with JSON only: {"stance": "meets" | "nothing", "quote": "the exact words from one passage"}'
].join('\n');

const parseJson = (raw = '') => {
  const match = String(raw?.text ?? raw ?? '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_error) { return null; }
};

const parseVerdict = (raw = '') => {
  const parsed = parseJson(raw);
  if (!parsed) return null;
  return { stance: clean(parsed.stance, 20).toLowerCase(), quote: clean(parsed.quote, 1200).replace(/^["“]|["”]$/g, '') };
};

/* A met test is a challenge to the view, carrying the condition it met. */
const STANCES = { meets: 'challenge', support: 'support', challenge: 'challenge' };

const readOne = async ({ sentence, condition = '', passages, sourceText, complete }) => {
  const completion = await complete({
    route: 'structure_planner',
    maxTokens: 400,
    temperature: 0,
    messages: [
      { role: 'system', content: 'You read passages for someone who holds a view. You answer only in JSON and quote only words that are on the page.' },
      { role: 'user', content: (condition ? testPromptFor : promptFor)({ sentence, condition, passages }) }
    ]
  });
  const verdict = parseVerdict(completion);
  if (!verdict || (verdict.stance === 'meets') !== Boolean(condition) || !STANCES[verdict.stance]) return null;
  if (words(verdict.quote).length < MIN_QUOTE_WORDS) return null;
  if (!quotedIn(verdict.quote, [sourceText])) return null;
  return { ...verdict, stance: STANCES[verdict.stance], falsifier: condition };
};

const proposeFromReading = async ({
  event,
  userId,
  models = {},
  complete = chatComplete,
  configured = isTextGenerationConfigured,
  embed = defaultEmbed(),
  now = new Date()
} = {}) => {
  const { Article, WikiPage } = models;
  // Maintenance callers pass the models they need; receipts are found by name.
  const NoeisReceipt = models.NoeisReceipt || mongoose.models.NoeisReceipt;
  if (!configured() || !Article?.findOne || !WikiPage?.find || !NoeisReceipt?.findOne) return [];
  if (event?.sourceType !== 'article' || !event?.sourceObjectId) return [];

  const owner = userId || event.userId;
  const article = await Article.findOne({ _id: event.sourceObjectId, userId: owner })
    .select('_id title content author siteName publicationDate createdAt').lean();
  const arrivedAt = time(article?.createdAt);
  if (!article || !clean(article.content) || arrivedAt == null) return [];

  const proposedToday = () => NoeisReceipt.countDocuments({
    userId: owner,
    kind: 'judgment_change_proposal',
    'provenance.change': 'evidence',
    createdAt: { $gte: new Date(now.getTime() - DAY_MS) }
  });
  if (await proposedToday() >= PER_DAY) return [];

  const views = (await heldViews({ WikiPage, userId: owner }))
    .filter(page => (heldSince(page) ?? Infinity) < arrivedAt && !alreadyFiled(page, String(article._id)));

  const sourceText = article.content;
  const passages = sourcePassages(article.title, sourceText);
  const proposed = [];
  const candidates = await candidateViews({ views: views.flatMap(asksOf), passages, embed, textOf: askedText });
  // A met test says more than a challenge to the sentence: it is asked first.
  candidates.sort((left, right) => Boolean(right.page.condition) - Boolean(left.page.condition));
  for (const { page, passages: read } of candidates) {
    if (await proposedToday() >= PER_DAY) break;
    const receiptId = readingReceiptId({ pageId: String(page._id), articleId: String(article._id) });
    if (await NoeisReceipt.findOne({ userId: owner, receiptId })) continue;
    const verdict = await readOne({ sentence: sentenceOf(page), condition: page.condition, passages: read, sourceText, complete })
      .catch(() => null);
    if (!verdict) continue;
    const receipt = buildReadingProposal({
      page, article, ...verdict, eventId: String(event._id || ''), now
    });
    proposed.push(await persistNoeisReceipt({ NoeisReceipt, userId: owner, receipt }) || receipt);
  }
  return proposed;
};

/* The reader version: a pending passage from this source that argues against
   a view still held in the same words. It is the proposal the source already
   made on the view, said where the source is being read. */
const pushesAgainst = async ({ userId, articleId, models: { WikiPage, NoeisReceipt } = {} }) => {
  if (!WikiPage?.find || !NoeisReceipt?.find || !articleId) return null;
  const pending = await NoeisReceipt.find({
    userId,
    kind: 'judgment_change_proposal',
    status: 'pending',
    'provenance.change': 'evidence',
    'provenance.stance': 'challenge',
    'provenance.articleId': String(articleId)
  }).sort({ createdAt: -1 }).limit(10).lean();
  if (!pending.length) return null;
  const views = await heldViews({ WikiPage, userId });
  for (const receipt of pending) {
    const page = views.find(view => String(view._id) === String(receipt.provenance?.pageId));
    if (page && sentenceOf(page) === clean(receipt.provenance?.before)) {
      return { proposal: serializeStoredReceipt(receipt), pageId: String(page._id), view: sentenceOf(page) };
    }
  }
  return null;
};

/* You hold the opposite.

   A saved note's sentences meet the views you hold. Each sentence is asked
   once: the verdict is kept on the note, so the next save asks only what is
   new, and a line set aside stays set aside. */
const NOTE_ASKS = 2;
const MIN_SENTENCE_WORDS = 6;
const KEPT_READINGS = 200;

const noteSentences = entry => list(entry?.blocks).flatMap(block => clean(block?.text, 8000)
  .split(/(?<=[.!?])\s+/)
  .map(sentence => clean(sentence, 600))
  // Only a finished sentence: the one still being typed is not asked yet.
  .filter(sentence => /[.!?]["”’)]*$/.test(sentence) && words(sentence).length >= MIN_SENTENCE_WORDS)
  .map(sentence => ({ sentence, blockId: clean(block?.id, 120) })));

const pairKey = ({ sentence, page }) => crypto.createHash('sha1')
  .update([sentence, String(page._id), sentenceOf(page)].join('\n')).digest('hex').slice(0, 24);

const oppositePrompt = ({ view, sentence }) => [
  `The view: "${view}"`,
  `The sentence: "${sentence}"`,
  '',
  'Could someone hold both at once? Answer "contradicts" only if holding the sentence means giving up the view.',
  'Sharing a topic or words is not contradiction or support.',
  '',
  'Answer with JSON only: {"verdict": "contradicts" | "supports" | "unrelated", "confidence": "high" | "low"}'
].join('\n');

const readSentence = async ({ view, sentence, complete }) => {
  const parsed = parseJson(await complete({
    route: 'structure_planner',
    maxTokens: 80,
    temperature: 0,
    messages: [
      { role: 'system', content: 'You compare a sentence someone wrote with a view they hold. You answer only in JSON.' },
      { role: 'user', content: oppositePrompt({ view, sentence }) }
    ]
  }));
  const verdict = clean(parsed?.verdict, 20).toLowerCase();
  if (!['contradicts', 'supports', 'unrelated'].includes(verdict)) return null;
  // A contradiction the model is unsure of is kept as asked, and never shown.
  return verdict === 'contradicts' && clean(parsed.confidence, 10).toLowerCase() !== 'high' ? 'unsure' : verdict;
};

const lineFor = ({ reading, page, sentences }) => {
  const at = sentences.find(item => item.sentence === reading.sentence);
  return {
    key: reading.key,
    sentence: reading.sentence,
    blockId: at?.blockId || '',
    pageId: String(page._id),
    view: sentenceOf(page),
    heldSince: new Date(heldSince(page) ?? Date.now()).toISOString()
  };
};

const opposeFromNote = async ({
  entry,
  userId,
  models: { NotebookEntry, WikiPage } = {},
  complete = chatComplete,
  configured = isTextGenerationConfigured,
  embed = defaultEmbed(),
  now = new Date()
} = {}) => {
  if (!entry || !NotebookEntry?.updateOne || !WikiPage?.find) return null;
  const sentences = noteSentences(entry);
  if (!sentences.length) return null;
  const views = await heldViews({ WikiPage, userId });
  const readings = list(entry.viewReadings);

  // The line already standing, while its sentence and its view both hold.
  for (const reading of readings) {
    if (reading.verdict !== 'contradicts' || reading.dismissedAt) continue;
    const page = views.find(view => String(view._id) === String(reading.pageId));
    if (page && pairKey({ sentence: reading.sentence, page }) === reading.key
      && sentences.some(item => item.sentence === reading.sentence)) {
      return lineFor({ reading, page, sentences });
    }
  }
  if (!configured() || !views.length) return null;

  // A sentence is read once, against the view it bears on most: the next save
  // asks only about sentences it has not read, and an unchanged note costs nothing.
  const read = new Set(readings.map(reading => reading.sentence));
  const unread = [...new Set(sentences.map(item => item.sentence))].filter(sentence => !read.has(sentence));
  if (!unread.length) return null;
  // Each sentence a view answers meets the view it ranks highest for: a
  // view's top passage before anyone's second, best views first within a rank.
  // Sentences past this save's asks wait, unread, for the next.
  const matched = (await candidateViews({ views, passages: unread, embed, limit: views.length }))
    .flatMap(({ page, passages }) => passages.map((passage, rank) => ({ page, sentence: passage.text, rank })))
    .sort((left, right) => left.rank - right.rank)
    .filter((pair, index, all) => all.findIndex(other => other.sentence === pair.sentence) === index);
  const pairs = matched.slice(0, NOTE_ASKS).map(pair => ({ ...pair, key: pairKey(pair) }));
  // A sentence no view answers is read too, so it is not looked at again.
  const answered = new Set(matched.map(pair => pair.sentence));
  const fresh = unread.filter(sentence => !answered.has(sentence))
    .map(sentence => ({ key: pairKey({ sentence, page: { _id: '' } }), pageId: '', sentence, verdict: 'unrelated', at: now }));
  for (const { page, sentence, key } of pairs) {
    const verdict = await readSentence({ view: sentenceOf(page), sentence, complete }).catch(() => null);
    if (!verdict) continue;
    fresh.push({ key, pageId: String(page._id), sentence, verdict, at: now });
    if (verdict === 'contradicts') break;
  }
  if (!fresh.length) return null;
  // A save that overlapped this one may have read the same sentences first;
  // then its readings stand and these are dropped, so none is kept twice.
  const kept = await NotebookEntry.updateOne(
    { _id: entry._id, userId, 'viewReadings.sentence': { $nin: fresh.map(reading => reading.sentence) } },
    { $push: { viewReadings: { $each: fresh, $slice: -KEPT_READINGS } } },
    { timestamps: false }
  );
  // Only a line that was kept is shown; the overlapping save's line stands instead.
  const shown = kept?.matchedCount !== 0 && fresh.find(reading => reading.verdict === 'contradicts');
  return shown ? lineFor({ reading: shown, page: views.find(view => String(view._id) === shown.pageId), sentences }) : null;
};

const setOppositeAside = ({ entryId, userId, key, models: { NotebookEntry }, now = new Date() }) => NotebookEntry.updateOne(
  { _id: entryId, userId, 'viewReadings.key': clean(key, 40) },
  { $set: { 'viewReadings.$[reading].dismissedAt': now } },
  { arrayFilters: [{ 'reading.key': clean(key, 40) }], timestamps: false }
);

/* A quote from a saved source, as a highlight on it: the one already there
   with the same words, or a new one. Filing goes through highlights, so a
   passage read out of a source has to become one first. */
const highlightForQuote = async ({ Article, userId, articleId, quote }) => {
  const text = clean(quote, 1200);
  let article = await Article.findOne({ _id: articleId, userId }).select('_id highlights');
  if (!article || !text) return {};
  let highlight = list(article.highlights).find(item => clean(item?.text, 1200) === text);
  if (!highlight) {
    article = await Article.findOneAndUpdate(
      { _id: articleId, userId },
      { $push: { highlights: buildHighlightDocument({ text, normalizeTags: () => [] }) } },
      { new: true }
    ).select('_id highlights');
    highlight = list(article?.highlights).find(item => clean(item?.text, 1200) === text);
  }
  return { article, highlight };
};

/* Filing a pending passage: the quote becomes a highlight on the source it
   came from, the highlight is filed through the ordinary evidence path, and
   the proposal is closed. Every step is idempotent, so a retry lands once. */
const fileReadingProposal = async ({
  userId, pageId, receiptId, field, fileJudgmentEvidence, now = new Date(),
  models: { Article, WikiPage, NoeisReceipt, ...rest } = {}
} = {}) => {
  const page = await WikiPage.findOne({ _id: pageId, userId });
  if (!page) throw new JudgmentChangeProposalError('Wiki page not found.', 404);
  const stored = assertBinding({ receipt: await NoeisReceipt.findOne({ userId, receiptId: clean(receiptId, 300) }), page });
  if (!isReading(stored)) throw new JudgmentChangeProposalError('That proposal is not a passage to file.', 400);
  const disposition = `file_${field}`;
  if (stored.status !== 'pending') {
    if (stored.provenance?.disposition === disposition) return { proposal: stored, replay: true };
    throw new JudgmentChangeProposalError('This passage was already settled.', 409);
  }

  const { article, highlight } = await highlightForQuote({
    Article, userId, articleId: stored.provenance.articleId, quote: stored.provenance.after
  });
  if (!article || !highlight) throw new JudgmentChangeProposalError('That source is no longer in your Library.', 409);

  const filed = await fileJudgmentEvidence({
    ...rest, Article, WikiPage, NoeisReceipt,
    userId,
    pageId,
    requestId: `reading-${stored.provenance.proposalId}`,
    expectedClaim: page.judgment.currentJudgment,
    field,
    articleId: String(article._id),
    highlightId: String(highlight._id)
  }).catch((error) => {
    if (error?.code === 'evidence_already_filed') return null;
    throw error;
  });

  const proposal = await persistNoeisReceipt({
    NoeisReceipt,
    userId,
    receipt: {
      ...stored,
      status: 'accepted',
      summary: `Filed ${field === 'why' ? 'for' : 'against'}: ${highlight.text}`,
      provenance: { ...stored.provenance, disposition, resolvedAt: now },
      completedAt: now
    }
  });
  return { proposal: proposal || serializeStoredReceipt(stored), filed };
};

module.exports = {
  PER_DAY,
  VIEWS_PER_SOURCE,
  candidateViews,
  fileReadingProposal,
  opposeFromNote,
  highlightForQuote,
  proposeFromReading,
  pushesAgainst,
  setOppositeAside,
  __testables: { asksOf, parseVerdict, promptFor, readOne, readSentence, askedText }
};
