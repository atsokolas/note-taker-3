const crypto = require('crypto');
const { isDuplicateKey, shareSlug } = require('./authoredNotebookShare');

/**
 * C6/C7: a shared question or concept leaves the workshop as a frozen snapshot.
 *
 * Same URL contract as a notebook share — one slug, an explicit freeze, an
 * explicit later update under that URL. Private edits never rewrite the
 * published copy. Wiki shares stay live. This file replaces the inline
 * sanitizers that used to assemble a public page from live documents.
 *
 * C7: a second person may offer a bounded reading beside a published question.
 * That reading is not merged into the snapshot. The owner may later say how
 * they take it; the original writing stays. A new reading is held until
 * the owner places it. Libraries stay private.
 */

const PREVIEW_STALE = {
  question: 'The question changed since you previewed it. Refresh the preview before sharing.',
  concept: 'The concept changed since you previewed it. Refresh the preview before sharing.'
};

const NOT_PUBLISHED = {
  question: 'This question is not published.',
  concept: 'This concept is not published.'
};

const CONTRIBUTION_LIMIT = 12;
const CONTRIBUTION_CHARS = 800;
const CONTRIBUTION_REMAINDER_CHARS = 400;
const CONTRIBUTION_BY_CHARS = 80;

const publicText = (value = '', limit = 8000) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const stripTags = (value = '') => publicText(
  String(value || '').replace(/<[^>]*>/g, ' '),
  8000
);

const asIso = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const readLean = async (query) => {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const asRow = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const idOf = (row) => String(row?._id || row?.id || '');

const sanitizeParagraphBlocks = (blocks = []) => (
  (Array.isArray(blocks) ? blocks : [])
    .filter((block) => (
      block?.type === 'paragraph'
      && !String(block?.sourcePath || '').trim()
      && !String(block?.articleId || '').trim()
      && !String(block?.articleTitle || '').trim()
    ))
    .map((block) => ({
      id: String(block?.id || ''),
      type: 'paragraph',
      text: String(block?.text || '').trim()
    }))
    .filter((block) => block.text)
);

const sanitizeCard = (card) => ({
  id: String(card?.id || ''),
  type: String(card?.type || ''),
  title: String(card?.title || ''),
  content: String(card?.content || ''),
  whyItMatters: String(card?.whyItMatters || ''),
  strength: String(card?.strength || ''),
  confidence: String(card?.confidence || '')
});

const projectPublicQuestion = (question = {}, ownerDisplayName = '') => ({
  ownerDisplayName: publicText(ownerDisplayName, 200),
  question: {
    text: publicText(question?.text, 8000),
    status: question?.status === 'answered' ? 'answered' : 'open',
    conceptName: publicText(question?.conceptName || question?.linkedTagName, 400),
    paragraphs: sanitizeParagraphBlocks(question?.blocks)
  }
});

const projectPublicConcept = (concept = {}, ownerDisplayName = '') => {
  const workbench = (concept?.ideaWorkbench && typeof concept.ideaWorkbench === 'object')
    ? concept.ideaWorkbench
    : {};
  const cards = Array.isArray(workbench.cards) ? workbench.cards : [];
  return {
    ownerDisplayName: publicText(ownerDisplayName, 200),
    concept: {
      name: publicText(concept?.name, 400),
      description: String(concept?.description || ''),
      hypothesisHtml: String(workbench?.hypothesis?.html || ''),
      framing: String(workbench?.header?.prompt || ''),
      supports: cards.filter((card) => card?.zone === 'supports').map(sanitizeCard),
      contradictions: cards.filter((card) => card?.zone === 'contradictions').map(sanitizeCard),
      questions: cards.filter((card) => card?.zone === 'questions').map(sanitizeCard)
    }
  };
};

const hashPublicQuestion = (preview) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    ownerDisplayName: preview?.ownerDisplayName || '',
    question: preview?.question || {}
  }))
  .digest('hex');

const hashPublicConcept = (preview) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    ownerDisplayName: preview?.ownerDisplayName || '',
    concept: preview?.concept || {}
  }))
  .digest('hex');

const canPublishQuestion = (preview) => Boolean(publicText(preview?.question?.text, 8000));
const canPublishConcept = (preview) => Boolean(publicText(preview?.concept?.name, 400));

const freezeThinkSnapshot = (preview, publishedAt, extra = {}) => {
  const body = { ...(preview || {}) };
  delete body.publishedAt;
  delete body.revisedAt;
  delete body.correction;
  delete body.contributions;
  delete body.contribution;
  delete body.interpretation;
  delete body.interpretedBy;
  delete body.waiting;
  const iso = asIso(publishedAt);
  const revised = asIso(extra.revisedAt);
  const correction = publicText(stripTags(extra.correction), 400);
  return {
    ...body,
    ...(iso ? { publishedAt: iso } : {}),
    ...(revised && revised !== iso ? { revisedAt: revised } : {}),
    ...(correction ? { correction } : {})
  };
};

const contributionBy = (value) => publicText(stripTags(value), CONTRIBUTION_BY_CHARS);
const contributionText = (value) => publicText(stripTags(value), CONTRIBUTION_CHARS);
const contributionRemainder = (value) => publicText(stripTags(value), CONTRIBUTION_REMAINDER_CHARS);

const projectContribution = (row = {}, extra = {}) => {
  const by = contributionBy(row.by);
  const text = contributionText(row.text);
  if (!by || !text) return null;
  const remainder = contributionRemainder(row.remainder);
  const interpretation = contributionRemainder(row.interpretation);
  const interpretedBy = contributionBy(extra.interpretedBy);
  return {
    id: idOf(row),
    by,
    text,
    ...(remainder ? { remainder } : {}),
    ...(interpretation && interpretedBy ? { interpretation, interpretedBy } : {}),
    createdAt: asIso(row.createdAt)
  };
};

const projectContributionList = (rows, extra = {}) => (Array.isArray(rows) ? rows : [])
  .map((row) => projectContribution(row, extra))
  .filter(Boolean);

const contributionHeld = (row) => row?.held === true;
const placedContributions = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => !contributionHeld(row));
const heldContributions = (rows) => (Array.isArray(rows) ? rows : []).filter(contributionHeld);

const loadQuestionContributions = async (QuestionContribution, query) => {
  if (!QuestionContribution?.find) return [];
  const found = QuestionContribution.find(query);
  const sorted = found?.sort ? found.sort({ createdAt: 1, _id: 1 }) : found;
  const rows = sorted && typeof sorted.lean === 'function' ? await sorted.lean() : await sorted;
  return Array.isArray(rows) ? rows : [];
};

// Bound to this published door, not the question's lifetime readings.
// $ifNull lets older rows without contributionCount still take a slot.
const contributionSlotFilter = (slug) => ({
  slug: publicText(slug, 80),
  snapshot: { $ne: null },
  $expr: { $lt: [{ $ifNull: ['$contributionCount', 0] }, CONTRIBUTION_LIMIT] }
});

const claimContributionSlot = async (SharedQuestion, slug) => {
  const filter = contributionSlotFilter(slug);
  if (!filter.slug || !SharedQuestion?.findOneAndUpdate) return null;
  const updated = SharedQuestion.findOneAndUpdate(
    filter,
    { $inc: { contributionCount: 1 } },
    { new: true }
  );
  if (!updated) return null;
  if (typeof updated.lean === 'function') return updated.lean();
  return updated;
};

const releaseContributionSlot = async (SharedQuestion, slug) => {
  const key = publicText(slug, 80);
  if (!key || !SharedQuestion?.findOneAndUpdate) return null;
  const updated = SharedQuestion.findOneAndUpdate(
    { slug: key, contributionCount: { $gt: 0 } },
    { $inc: { contributionCount: -1 } },
    { new: true }
  );
  if (!updated) return null;
  if (typeof updated.lean === 'function') return updated.lean();
  return updated;
};

const publicQuestionPage = (share, contributions = []) => {
  const snapshot = share?.snapshot && typeof share.snapshot === 'object'
    ? { ...share.snapshot }
    : null;
  if (!snapshot) return null;
  delete snapshot.contributions;
  delete snapshot.contribution;
  delete snapshot.interpretation;
  delete snapshot.interpretedBy;
  delete snapshot.waiting;
  return {
    ...snapshot,
    contributions: projectContributionList(placedContributions(contributions), {
      interpretedBy: share.ownerDisplayName
    })
  };
};

const missingSnapshot = (share) => (
  !share?.snapshot || typeof share.snapshot !== 'object'
);

const thinkShareState = (share, {
  preview = null,
  currentHash = '',
  kind = 'question',
  contributions = []
} = {}) => {
  const publishable = kind === 'concept'
    ? canPublishConcept(preview)
    : canPublishQuestion(preview);
  const extra = {
    interpretedBy: share?.ownerDisplayName || preview?.ownerDisplayName
  };
  const readings = kind === 'question'
    ? projectContributionList(placedContributions(contributions), extra)
    : null;
  const waiting = kind === 'question' && share
    ? projectContributionList(heldContributions(contributions), extra)
    : null;
  if (!share) {
    return {
      shared: false,
      publishable,
      ownerDisplayName: preview?.ownerDisplayName || '',
      preview,
      currentHash,
      ...(readings ? { contributions: readings } : {})
    };
  }
  return {
    shared: true,
    publishable,
    slug: share.slug,
    ownerDisplayName: share.ownerDisplayName || preview?.ownerDisplayName || '',
    publishedAt: share.publishedAt || share.snapshot?.publishedAt || null,
    contentHash: share.contentHash || '',
    currentHash,
    stale: Boolean(share.contentHash && currentHash && share.contentHash !== currentHash),
    preview,
    snapshot: share.snapshot || null,
    ...(readings ? { contributions: readings } : {}),
    ...(waiting && waiting.length ? { waiting } : {})
  };
};

const ownerNameOf = async (User, userId) => {
  if (!User?.findById) return '';
  try {
    const owner = await readLean(User.findById(userId).select('name displayName email'));
    return publicText(
      owner?.displayName
      || owner?.name
      || String(owner?.email || '').split('@')[0],
      200
    );
  } catch (_error) {
    return '';
  }
};

const liveQuestionPreview = async ({ User, question, userId }) => {
  const ownerDisplayName = await ownerNameOf(User, userId);
  const preview = projectPublicQuestion(question, ownerDisplayName);
  return {
    preview,
    currentHash: hashPublicQuestion(preview),
    ownerDisplayName,
    publishable: canPublishQuestion(preview)
  };
};

const liveConceptPreview = async ({ User, concept, userId }) => {
  const ownerDisplayName = await ownerNameOf(User, userId);
  const preview = projectPublicConcept(concept, ownerDisplayName);
  return {
    preview,
    currentHash: hashPublicConcept(preview),
    ownerDisplayName,
    publishable: canPublishConcept(preview)
  };
};

module.exports = {
  CONTRIBUTION_BY_CHARS,
  CONTRIBUTION_CHARS,
  CONTRIBUTION_LIMIT,
  CONTRIBUTION_REMAINDER_CHARS,
  NOT_PUBLISHED,
  PREVIEW_STALE,
  asRow,
  canPublishConcept,
  canPublishQuestion,
  claimContributionSlot,
  contributionBy,
  contributionHeld,
  contributionRemainder,
  contributionSlotFilter,
  contributionText,
  freezeThinkSnapshot,
  hashPublicConcept,
  hashPublicQuestion,
  heldContributions,
  isDuplicateKey,
  liveConceptPreview,
  liveQuestionPreview,
  loadQuestionContributions,
  missingSnapshot,
  ownerNameOf,
  placedContributions,
  projectContribution,
  projectContributionList,
  projectPublicConcept,
  projectPublicQuestion,
  publicQuestionPage,
  readLean,
  releaseContributionSlot,
  sanitizeCard,
  sanitizeParagraphBlocks,
  shareSlug,
  thinkShareState
};
