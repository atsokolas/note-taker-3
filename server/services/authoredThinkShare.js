const crypto = require('crypto');
const { isDuplicateKey, shareSlug } = require('./authoredNotebookShare');

/**
 * C6: a shared question or concept leaves the workshop as a frozen snapshot.
 *
 * Same URL contract as a notebook share — one slug, an explicit freeze, an
 * explicit later update under that URL. Private edits never rewrite the
 * published copy. Wiki shares stay live. This file replaces the inline
 * sanitizers that used to assemble a public page from live documents.
 */

const PREVIEW_STALE = {
  question: 'The question changed since you previewed it. Refresh the preview before sharing.',
  concept: 'The concept changed since you previewed it. Refresh the preview before sharing.'
};

const NOT_PUBLISHED = {
  question: 'This question is not published.',
  concept: 'This concept is not published.'
};

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

const missingSnapshot = (share) => (
  !share?.snapshot || typeof share.snapshot !== 'object'
);

const thinkShareState = (share, { preview = null, currentHash = '', kind = 'question' } = {}) => {
  const publishable = kind === 'concept'
    ? canPublishConcept(preview)
    : canPublishQuestion(preview);
  if (!share) {
    return {
      shared: false,
      publishable,
      ownerDisplayName: preview?.ownerDisplayName || '',
      preview,
      currentHash
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
    snapshot: share.snapshot || null
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
  NOT_PUBLISHED,
  PREVIEW_STALE,
  asRow,
  canPublishConcept,
  canPublishQuestion,
  freezeThinkSnapshot,
  hashPublicConcept,
  hashPublicQuestion,
  isDuplicateKey,
  liveConceptPreview,
  liveQuestionPreview,
  missingSnapshot,
  ownerNameOf,
  projectPublicConcept,
  projectPublicQuestion,
  readLean,
  sanitizeCard,
  sanitizeParagraphBlocks,
  shareSlug,
  thinkShareState
};
