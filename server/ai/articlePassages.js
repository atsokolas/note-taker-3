const {
  MAX_TEXT_LENGTH,
  trimText
} = require('./embeddingTypes');
const { contentHashOf } = require('./vectorStore');

const ARTICLE_PASSAGE_PREFIX = 'passage:v1:';
const DEFAULT_PASSAGE_LENGTH = 900;
const DEFAULT_PASSAGE_OVERLAP = 120;
const DEFAULT_MAX_PASSAGES = 10;
const MIN_PASSAGE_LENGTH = 240;

const positiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const passageSubId = (index) => `${ARTICLE_PASSAGE_PREFIX}${index}`;
const isArticlePassageSubId = (value = '') => String(value || '').startsWith(ARTICLE_PASSAGE_PREFIX);

/* Evidence normalization may collapse layout, but it must not rewrite what the
   source said. The generic embedding normalizer removes Markdown punctuation;
   doing that here would turn "-10%" into "10%" and defeat exact quotation. */
const normalizeSourceText = (value = '') => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isoDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
};

const articleDates = (article = {}) => {
  const createdAt = isoDate(article?.createdAt);
  return {
    createdAt,
    updatedAt: isoDate(article?.updatedAt) || createdAt
  };
};

const articleTitle = (article = {}) => normalizeSourceText(article?.title || '') || 'Untitled article';
const articleBody = (article = {}) => normalizeSourceText(article?.content || '');

/* Keep the long-lived article identity compatible with the durable queue that
   shipped first. Passage rows add recall; they do not silently invalidate the
   summary row used by other semantic surfaces. */
const buildArticleSummary = (article = {}) => {
  const body = articleBody(article);
  return {
    subId: '',
    text: trimText([article?.title, article?.content].filter(Boolean).join('\n')),
    excerpt: body,
    metadata: {
      kind: 'article_summary',
      title: articleTitle(article),
      articleId: String(article?._id || ''),
      sourceContentHash: contentHashOf(body),
      tags: [],
      ...articleDates(article)
    }
  };
};

const boundaryEnd = (body, start, target, minimum) => {
  if (target >= body.length) return body.length;
  const window = body.slice(start, target);
  const floor = Math.max(0, minimum - start);
  const sentenceEnds = ['. ', '? ', '! ', '; ']
    .map(mark => window.lastIndexOf(mark))
    .filter(index => index >= floor)
    .map(index => index + 1);
  if (sentenceEnds.length) return start + Math.max(...sentenceEnds);
  const wordEnd = window.lastIndexOf(' ');
  return wordEnd >= floor ? start + wordEnd : target;
};

const nextStart = (body, start, end, overlap) => {
  const candidate = Math.max(start + 1, end - overlap);
  if (candidate >= body.length) return body.length;
  const nextSpace = body.indexOf(' ', candidate);
  return nextSpace >= 0 && nextSpace < end ? nextSpace + 1 : candidate;
};

/* Passages are bounded enough to read as evidence, overlap enough not to lose
   a thought at a seam, and capped so one long import cannot monopolize the
   rate-limited embedding worker. The exact normalized source words are kept in
   memory only; Atlas stores their vector and hash, never a duplicate copy. */
const buildArticlePassages = (article = {}, options = {}) => {
  const body = articleBody(article);
  if (body.length < MIN_PASSAGE_LENGTH) return [];

  const length = Math.min(
    MAX_TEXT_LENGTH - 256,
    positiveInt(options.passageLength, DEFAULT_PASSAGE_LENGTH)
  );
  const overlap = Math.min(
    Math.floor(length / 3),
    positiveInt(options.passageOverlap, DEFAULT_PASSAGE_OVERLAP)
  );
  const maxPassages = Math.min(24, positiveInt(options.maxPassages, DEFAULT_MAX_PASSAGES));
  const title = articleTitle(article);
  const sourceContentHash = contentHashOf(body);
  const dates = articleDates(article);
  const passages = [];

  for (let start = 0; start < body.length && passages.length < maxPassages;) {
    const target = Math.min(body.length, start + length);
    const minimum = Math.min(target, start + Math.max(MIN_PASSAGE_LENGTH, Math.floor(length * 0.6)));
    const end = boundaryEnd(body, start, target, minimum);
    const excerpt = body.slice(start, end).trim();
    if (excerpt.length >= MIN_PASSAGE_LENGTH) {
      const index = passages.length;
      passages.push({
        subId: passageSubId(index),
        text: trimText(`${title}\n${excerpt}`),
        excerpt,
        metadata: {
          kind: 'article_passage',
          title,
          articleId: String(article?._id || ''),
          passageIndex: index,
          charStart: start,
          charEnd: end,
          sourceContentHash,
          tags: [],
          ...dates
        }
      });
    }
    if (end >= body.length) break;
    start = nextStart(body, start, end, overlap);
  }
  return passages;
};

const buildArticleVectorUnits = (article = {}, options = {}) => {
  const summary = buildArticleSummary(article);
  return [
    ...(summary.text.trim() ? [summary] : []),
    ...buildArticlePassages(article, options)
  ];
};

const exactArticlePassage = (article = {}, row = {}, options = {}) => {
  if (!isArticlePassageSubId(row?.subId)) return '';
  const expectedSourceHash = String(row?.metadata?.sourceContentHash || '');
  if (!expectedSourceHash || expectedSourceHash !== contentHashOf(articleBody(article))) return '';
  const passage = buildArticlePassages(article, options)
    .find(candidate => candidate.subId === String(row.subId));
  if (!passage || contentHashOf(passage.text) !== String(row?.contentHash || '')) return '';
  return passage.excerpt;
};

module.exports = {
  ARTICLE_PASSAGE_PREFIX,
  DEFAULT_PASSAGE_LENGTH,
  DEFAULT_PASSAGE_OVERLAP,
  DEFAULT_MAX_PASSAGES,
  MIN_PASSAGE_LENGTH,
  articleBody,
  buildArticleSummary,
  buildArticlePassages,
  buildArticleVectorUnits,
  exactArticlePassage,
  isArticlePassageSubId,
  normalizeSourceText,
  passageSubId
};
