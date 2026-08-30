const GENERIC_TITLES = new Set([
  'article',
  'document',
  'inbox',
  'note',
  'post',
  'read',
  'thread',
  'untitled',
  'work'
]);

const NAMED_LIBRARY_FRAGMENT_EXAMPLES = Object.freeze([
  {
    before: 'work',
    author: 'Jeffrey Yan',
    url: 'https://x.com/jeffreycyan/status/1',
    sourceType: 'thread',
    content: 'Turned down $100 million to keep building. The second sentence stays in the body.',
    publishedAt: '2026-08-29T12:00:00.000Z',
    after: 'Jeffrey Yan — Turned down $100 million to keep building.'
  },
  {
    before: 'write code. He was a bodyguard.',
    author: '',
    url: 'https://x.com/user/status/2',
    sourceType: 'thread',
    content: 'write code. He was a bodyguard. The rest of the thread stays in the body.',
    publishedAt: '2026-08-29T12:00:00.000Z',
    after: 'X — write code.'
  },
  {
    before: 'inception remain the same. What has changed is the world around us.',
    author: '',
    url: 'https://x.com/user/status/3',
    sourceType: 'thread',
    content: 'inception remain the same. What has changed is the world around us.',
    publishedAt: '2026-08-29T12:00:00.000Z',
    after: 'X — inception remain the same.'
  }
]);

const clean = (value = '', limit = 240) => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit)
  .trim();

const sentence = (value = '', limit = 120) => {
  const text = clean(value, 1000).replace(/^[#>*\-•\s]+/, '');
  if (!text) return '';
  const end = text.search(/[.!?](?=\s|$)/);
  const whole = end >= 0 ? text.slice(0, end + 1) : text;
  if (whole.length <= limit) return whole;
  const clipped = whole.slice(0, limit + 1);
  const boundary = clipped.lastIndexOf(' ');
  return boundary > 40 ? clipped.slice(0, boundary).trim() : '';
};

const firstHeading = (value = '') => {
  const raw = String(value || '');
  const markdown = raw.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1];
  const html = raw.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
  return clean(markdown || html || '', 180);
};

const bareTitle = (value = '') => clean(value, 240)
  .toLowerCase()
  .replace(/[.!?:;,]+$/g, '')
  .trim();

const isGenericWord = (value = '') => GENERIC_TITLES.has(bareTitle(value));

const isFragmentTitle = (value = '') => {
  const title = clean(value, 240);
  if (!title) return true;
  if (isGenericWord(title)) return true;
  if (/^[a-z]/.test(title)) return true;
  if (/^(?:and|but|for|in|of|or|so|the|to|with)\b/.test(title)) return true;
  return false;
};

const repairLeadingTitleCase = (value = '') => {
  const title = clean(value, 180);
  if (!title || isGenericWord(title)) return '';
  if (!/^[a-z]/.test(title) || /[.!?]\s+\p{L}/u.test(title)) return '';
  return `${title[0].toUpperCase()}${title.slice(1)}`;
};

const domainLabel = (value = '') => {
  try {
    return new URL(String(value || '')).hostname
      .replace(/^www\./i, '')
      .split('.')[0]
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
  } catch (_error) {
    return '';
  }
};

const dateLabel = value => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const isSocialSource = ({ sourceType = '', url = '' } = {}) => (
  /(?:social|thread|tweet)/i.test(String(sourceType || ''))
  || /(?:^|\.)x\.com$|(?:^|\.)twitter\.com$/i.test((() => {
    try { return new URL(String(url || '')).hostname; } catch (_error) { return ''; }
  })())
);

const lastResortTitle = ({ siteName = '', url = '', publishedAt = null } = {}) => (
  `${clean(siteName, 80) || domainLabel(url) || 'Imported source'} · ${dateLabel(publishedAt)}`
);

const deriveImportedTitle = ({
  metadataTitle = '',
  content = '',
  author = '',
  siteName = '',
  sourceType = '',
  url = '',
  publishedAt = null
} = {}) => {
  const explicit = clean(metadataTitle, 180);
  if (explicit && !isFragmentTitle(explicit)) return explicit;
  const repairedExplicit = repairLeadingTitleCase(explicit);
  if (repairedExplicit) return repairedExplicit;

  const heading = firstHeading(content);
  if (heading && !isFragmentTitle(heading)) return heading;

  const opening = sentence(content);
  const byline = clean(author, 80);
  if (opening && !isGenericWord(opening) && (byline || isSocialSource({ sourceType, url }))) {
    const named = clean(`${byline || domainLabel(url) || 'Social post'} — ${opening}`, 180);
    if (named && !isFragmentTitle(named)) return named;
  }

  return lastResortTitle({ siteName, url, publishedAt });
};

const highlightText = (article = {}) => (
  (Array.isArray(article.highlights) ? article.highlights : [])
    .map(highlight => highlight?.text)
    .find(Boolean) || ''
);

const planArticleTitleRepair = (article = {}) => {
  const before = clean(article.title, 240);
  if (!isFragmentTitle(before)) return null;
  const after = deriveImportedTitle({
    metadataTitle: article.title,
    content: article.content || highlightText(article),
    author: article.author,
    siteName: article.siteName,
    sourceType: article.importMeta?.sourceType,
    url: article.url,
    publishedAt: article.publicationDate || article.createdAt
  });
  if (!after || after === before) return null;
  return {
    id: article._id != null ? String(article._id) : '',
    userId: String(article.userId || ''),
    before,
    after
  };
};

module.exports = {
  NAMED_LIBRARY_FRAGMENT_EXAMPLES,
  deriveImportedTitle,
  firstHeading,
  isFragmentTitle,
  isSocialSource,
  planArticleTitleRepair,
  repairLeadingTitleCase
};
