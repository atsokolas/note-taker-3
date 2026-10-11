const mongoose = require('mongoose');
const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { quotedIn, words } = require('./agentGrounding');
const { topPassages } = require('./agentRetrieval');
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

   When a source arrives, the views it might bear on are read against it, one
   narrow question each: does this passage set support, challenge, or say
   nothing about this exact sentence? A verdict becomes a pending passage on
   the view only when the model quotes the source verbatim.

   Eligibility: held, unresolved views (not set aside, no verdict), held
   before the source was saved; passages from that one source only.
   Quality bar: a support or challenge verdict whose quote is found word for
   word in the stored text; at most five views read per source, one proposal
   per view per source, three per reader per day.
   Silence: nothing appears on the view. Without a model there is no reading
   at all, and no keyword guess stands in for one. */

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

/* The source is the query's corpus turned around: each view asks the new
   source which of its passages answer it, and the views it answers best are
   the ones worth a reading. */
const rankViews = ({ views, article }) => views
  .map(page => ({
    page,
    passages: topPassages({ title: article.title, text: article.content, query: page.judgment.currentJudgment, limit: 3 })
  }))
  .filter(candidate => candidate.passages.length && candidate.passages[0].score > 0)
  .sort((left, right) => right.passages[0].score - left.passages[0].score)
  .slice(0, VIEWS_PER_SOURCE);

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

const parseVerdict = (raw = '') => {
  const text = String(raw?.text ?? raw ?? '');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const stance = clean(parsed?.stance, 20).toLowerCase();
    return { stance, quote: clean(parsed?.quote, 1200).replace(/^["“]|["”]$/g, '') };
  } catch (_error) {
    return null;
  }
};

const readOne = async ({ sentence, passages, sourceText, complete }) => {
  const completion = await complete({
    route: 'structure_planner',
    maxTokens: 400,
    temperature: 0,
    messages: [
      { role: 'system', content: 'You read passages for someone who holds a view. You answer only in JSON and quote only words that are on the page.' },
      { role: 'user', content: promptFor({ sentence, passages }) }
    ]
  });
  const verdict = parseVerdict(completion);
  if (!verdict || !['support', 'challenge'].includes(verdict.stance)) return null;
  if (words(verdict.quote).length < MIN_QUOTE_WORDS) return null;
  if (!quotedIn(verdict.quote, [sourceText])) return null;
  return verdict;
};

const proposeFromReading = async ({
  event,
  userId,
  models = {},
  complete = chatComplete,
  configured = isTextGenerationConfigured,
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

  const views = (await WikiPage.find({
    userId: owner,
    status: { $ne: 'archived' },
    'judgment.currentJudgment': { $type: 'string', $ne: '' }
  }).select('_id title createdAt judgment.currentJudgment judgment.status judgment.startedAt judgment.bornAt judgment.verdicts judgment.why judgment.against').lean())
    .filter(page => isOpenView(page) && (heldSince(page) ?? Infinity) < arrivedAt && !alreadyFiled(page, String(article._id)));

  const sourceText = article.content;
  const proposed = [];
  for (const { page, passages } of rankViews({ views, article })) {
    if (await proposedToday() >= PER_DAY) break;
    const receiptId = readingReceiptId({ pageId: String(page._id), articleId: String(article._id) });
    if (await NoeisReceipt.findOne({ userId: owner, receiptId })) continue;
    const verdict = await readOne({ sentence: clean(page.judgment.currentJudgment), passages, sourceText, complete })
      .catch(() => null);
    if (!verdict) continue;
    const receipt = buildReadingProposal({
      page, article, stance: verdict.stance, quote: verdict.quote, eventId: String(event._id || ''), now
    });
    proposed.push(await persistNoeisReceipt({ NoeisReceipt, userId: owner, receipt }) || receipt);
  }
  return proposed;
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

  const articleId = stored.provenance.articleId;
  const quote = clean(stored.provenance.after, 1200);
  let article = await Article.findOne({ _id: articleId, userId }).select('_id highlights');
  if (!article) throw new JudgmentChangeProposalError('That source is no longer in your Library.', 409);
  let highlight = list(article.highlights).find(item => clean(item?.text, 1200) === quote);
  if (!highlight) {
    article = await Article.findOneAndUpdate(
      { _id: articleId, userId },
      { $push: { highlights: buildHighlightDocument({ text: quote, normalizeTags: () => [] }) } },
      { new: true }
    ).select('_id highlights');
    highlight = list(article?.highlights).find(item => clean(item?.text, 1200) === quote);
  }

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
      summary: `Filed ${field === 'why' ? 'for' : 'against'}: ${quote}`,
      provenance: { ...stored.provenance, disposition, resolvedAt: now },
      completedAt: now
    }
  });
  return { proposal: proposal || serializeStoredReceipt(stored), filed };
};

module.exports = {
  PER_DAY,
  VIEWS_PER_SOURCE,
  fileReadingProposal,
  proposeFromReading,
  __testables: { parseVerdict, promptFor, rankViews, readOne }
};
