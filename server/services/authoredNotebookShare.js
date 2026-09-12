const crypto = require('crypto');
const { publicHttpUrl } = require('./editionShape');

/**
 * C6 first deliverable: a notebook leaves the workshop as a frozen snapshot.
 *
 * Editions already publish this way — one URL, an explicit freeze, an explicit
 * later update under that same URL, revocation by deleting the row. This is
 * that contract for an authored essay, not a second share engine.
 *
 * Live question/concept shares stay live. Wiki shares stay live. This slice
 * does not change them.
 */

const PREVIEW_STALE = 'The note changed since you previewed it. Refresh the preview before sharing.';
const SLUG_BYTES = 9;
const ACCESS_OPEN = 'open';
const ACCESS_WITHHELD = 'withheld';

const PUBLIC_TYPES = Object.freeze({
  paragraph: 'paragraph',
  heading: 'heading',
  bullet: 'bullet',
  quote: 'quote',
  article: 'article',
  concept: 'concept',
  question: 'question',
  wiki: 'wiki',
  code: 'code',
  divider: 'divider'
});

const shareSlug = () => crypto.randomBytes(SLUG_BYTES)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const isDuplicateKey = (error) => Number(error?.code) === 11000;

const publicText = (value = '', limit = 8000) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const stripTags = (value = '') => publicText(
  String(value || '').replace(/<[^>]*>/g, ' '),
  8000
);

const idOf = (value) => String(value?._id || value?.id || value || '').trim();

const codeLanguage = (block = {}) => {
  const raw = String(block.sourcePath || block.language || '').trim();
  if (!raw || raw.startsWith('/')) return '';
  return publicText(raw, 40);
};

const articleIdOf = (block = {}) => idOf(block.articleId);

const collectArticleIds = (entry = {}) => {
  const seen = new Set();
  (Array.isArray(entry?.blocks) ? entry.blocks : []).forEach((block) => {
    const articleId = articleIdOf(block);
    if (articleId) seen.add(articleId);
  });
  return [...seen];
};

const sourceOf = (block = {}, articlesById = new Map()) => {
  const article = articlesById.get(articleIdOf(block));
  const title = publicText(block.articleTitle, 400) || publicText(article?.title, 400);
  const href = publicHttpUrl(article?.url || block.url || block.href || '');
  if (!title && !href) return null;
  return {
    title,
    href,
    access: href ? ACCESS_OPEN : ACCESS_WITHHELD
  };
};

const namedBlock = (type, block = {}) => {
  const text = publicText(
    block.conceptName || block.questionText || block.articleTitle || block.text,
    400
  );
  if (!text) return null;
  return { id: publicText(block.id, 80), type, text };
};

const projectPublicBlock = (block = {}, articlesById = new Map()) => {
  const type = String(block?.type || '').trim();
  const id = publicText(block.id, 80);
  const text = publicText(block.text, 8000);

  if (type === 'heading' && text) {
    const level = Math.min(Math.max(Number(block.level) || 1, 1), 4);
    return { id, type: PUBLIC_TYPES.heading, level, text };
  }
  if (type === 'bullet' && text) {
    return {
      id,
      type: PUBLIC_TYPES.bullet,
      indent: Math.min(Math.max(Number(block.indent) || 0, 0), 6),
      text
    };
  }
  if (type === 'highlight_embed' || type === 'highlight-ref' || type === 'highlight_ref' || type === 'quote') {
    const source = sourceOf(block, articlesById);
    if (!text && !source) return null;
    return {
      id,
      type: PUBLIC_TYPES.quote,
      text,
      ...(source ? { source } : {})
    };
  }
  if (type === 'article_ref' || type === 'article-ref') {
    const source = sourceOf(block, articlesById);
    const label = publicText(block.articleTitle || block.text, 400);
    if (!label && !source) return null;
    return {
      id,
      type: PUBLIC_TYPES.article,
      text: label || source.title,
      ...(source ? { source } : {})
    };
  }
  if (type === 'concept_ref' || type === 'concept-ref') return namedBlock(PUBLIC_TYPES.concept, block);
  if (type === 'question_ref' || type === 'question-ref') return namedBlock(PUBLIC_TYPES.question, block);
  if (type === 'wiki_ref' || type === 'wiki-ref') return namedBlock(PUBLIC_TYPES.wiki, block);
  if (type === 'code' || type === 'codeBlock') {
    const code = String(block.text || '').replace(/\s+$/g, '');
    if (!code) return null;
    const language = codeLanguage(block);
    return { id, type: PUBLIC_TYPES.code, text: code.slice(0, 12000), ...(language ? { language } : {}) };
  }
  if (type === 'divider' || type === 'horizontalRule') {
    return { id, type: PUBLIC_TYPES.divider };
  }
  if (text) return { id, type: PUBLIC_TYPES.paragraph, text };
  return null;
};

const blocksFrom = (entry = {}) => {
  if (Array.isArray(entry?.blocks) && entry.blocks.length) return entry.blocks;
  const fallback = stripTags(entry?.content || '');
  return fallback ? [{ id: 'body', type: 'paragraph', text: fallback }] : [];
};

/**
 * An allowlist. Article ids, highlight ids, library paths, wiki workspace
 * doors, tags, folders, and the rest of the private house never leave.
 */
const projectPublicNotebook = (entry = {}, ownerDisplayName = '', { articlesById = new Map() } = {}) => ({
  title: publicText(entry?.title, 300) || 'Untitled',
  ownerDisplayName: publicText(ownerDisplayName, 200),
  blocks: blocksFrom(entry)
    .map((block) => projectPublicBlock(block, articlesById))
    .filter(Boolean)
});

const hashPublicNotebook = (snapshot) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    title: snapshot?.title || '',
    ownerDisplayName: snapshot?.ownerDisplayName || '',
    blocks: snapshot?.blocks || []
  }))
  .digest('hex');

const canPublishNotebook = (snapshot) => (
  Array.isArray(snapshot?.blocks) && snapshot.blocks.some((block) => (
    block?.type === PUBLIC_TYPES.divider
    || Boolean(publicText(block?.text, 8000))
    || Boolean(block?.source?.title)
  ))
);

const freezeNotebookSnapshot = (preview, publishedAt) => {
  const date = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  const iso = Number.isNaN(date.getTime()) ? '' : date.toISOString();
  return iso ? { ...preview, publishedAt: iso } : { ...preview };
};

const notebookShareState = (share, { preview = null, currentHash = '' } = {}) => {
  if (!share) {
    return {
      shared: false,
      publishable: canPublishNotebook(preview),
      ownerDisplayName: preview?.ownerDisplayName || '',
      preview,
      currentHash
    };
  }
  return {
    shared: true,
    publishable: canPublishNotebook(preview),
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

const loadSourceArticles = async ({ Article, userId, entry }) => {
  const ids = collectArticleIds(entry);
  if (!ids.length || !Article?.find) return new Map();
  const query = Article.find({ _id: { $in: ids }, userId }).select('_id url title');
  const rows = typeof query.lean === 'function' ? await query.lean() : await query;
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [idOf(row), row]));
};

const readLean = async (query) => {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
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

const liveNotebookPreview = async ({ Article, User, entry, userId }) => {
  const [articlesById, ownerDisplayName] = await Promise.all([
    loadSourceArticles({ Article, userId, entry }),
    ownerNameOf(User, userId)
  ]);
  const preview = projectPublicNotebook(entry, ownerDisplayName, { articlesById });
  return {
    preview,
    currentHash: hashPublicNotebook(preview),
    ownerDisplayName,
    publishable: canPublishNotebook(preview)
  };
};

module.exports = {
  ACCESS_OPEN,
  ACCESS_WITHHELD,
  PREVIEW_STALE,
  PUBLIC_TYPES,
  canPublishNotebook,
  collectArticleIds,
  freezeNotebookSnapshot,
  hashPublicNotebook,
  isDuplicateKey,
  liveNotebookPreview,
  loadSourceArticles,
  notebookShareState,
  projectPublicBlock,
  projectPublicNotebook,
  shareSlug
};
