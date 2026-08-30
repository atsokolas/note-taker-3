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

const isFragmentTitle = (value = '') => {
  const title = clean(value, 240);
  if (!title) return true;
  const normalized = title.toLowerCase().replace(/[.!?:;,]+$/g, '').trim();
  if (GENERIC_TITLES.has(normalized)) return true;
  if (/^[a-z]/.test(title)) return true;
  if (/^(?:and|but|for|in|of|or|so|the|to|with)\b/.test(title)) return true;
  return false;
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
  /(?:social|thread|tweet|post)/i.test(String(sourceType || ''))
  || /(?:^|\.)x\.com$|(?:^|\.)twitter\.com$/i.test((() => {
    try { return new URL(String(url || '')).hostname; } catch (_error) { return ''; }
  })())
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

  const heading = firstHeading(content);
  if (heading && !isFragmentTitle(heading)) return heading;

  const opening = sentence(content);
  const byline = clean(author, 80);
  if (opening && (byline || isSocialSource({ sourceType, url }))) {
    return clean(`${byline || domainLabel(url) || 'Social post'} — ${opening}`, 180);
  }

  const source = clean(siteName, 80) || domainLabel(url) || 'Imported source';
  return `${source} · ${dateLabel(publishedAt)}`;
};

module.exports = {
  deriveImportedTitle,
  firstHeading,
  isFragmentTitle,
  isSocialSource
};
