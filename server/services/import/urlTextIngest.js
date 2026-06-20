const decodeHtmlEntities = (value = '') => String(value || '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'");

const stripHtml = (html = '') => decodeHtmlEntities(
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|main|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const extractTagContent = (html = '', tagName = '') => {
  const match = String(html || '').match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? match[1] : '';
};

const extractTitle = (html = '', fallback = '') => {
  const ogTitle = String(html || '').match(/<meta\b[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || String(html || '').match(/<meta\b[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle?.[1]) return decodeHtmlEntities(ogTitle[1]).trim();
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) return decodeHtmlEntities(stripHtml(title[1])).trim();
  return fallback;
};

const extractReadableText = (html = '') => {
  const article = extractTagContent(html, 'article');
  if (article) return stripHtml(article);
  const main = extractTagContent(html, 'main');
  if (main) return stripHtml(main);
  const body = extractTagContent(html, 'body');
  return stripHtml(body || html);
};

const normalizeIngestText = (value = '', maxLength = 120000) => (
  String(value || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, maxLength)
);

const titleCaseConcept = (value = '') => (
  String(value || '')
    .replace(/[“”"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((word) => {
      const lower = word.toLowerCase();
      if (['and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'for'].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
);

const deriveConceptTitleFromText = (value = '', fallback = 'Pasted source') => {
  const firstLine = normalizeIngestText(value, 1000)
    .replace(/^https?:\/\/\S+/i, '')
    .split(/\n+/)
    .map(line => line.trim())
    .find(Boolean) || '';
  const cleaned = firstLine
    .replace(/^[#>\-\s*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  const definitionMatch = cleaned.match(/^(.{3,80}?)\s+(?:is|are|refers to|means|describes)\b/i);
  const phrase = (definitionMatch?.[1] || cleaned.split(/[.:;!?—–-]/)[0] || cleaned)
    .replace(/\b(?:this|that|these|those)\b/gi, '')
    .trim();
  return titleCaseConcept(phrase) || fallback;
};

const fetchUrlForIngest = async ({ url, fetchImpl = fetch, timeoutMs = 12000 } = {}) => {
  const parsed = new URL(String(url || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs can be imported.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 12000));
  try {
    const res = await fetchImpl(parsed.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'text/html, text/plain;q=0.9,*/*;q=0.5',
        'User-Agent': 'NoeisBot/1.0 (+https://www.noeis.io)'
      }
    });
    if (!res.ok) throw new Error(`URL fetch failed with HTTP ${res.status}.`);
    const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
    const raw = await res.text();
    const title = contentType.includes('html') ? extractTitle(raw, parsed.hostname) : parsed.hostname;
    const text = contentType.includes('html') ? extractReadableText(raw) : normalizeIngestText(raw);
    return {
      url: parsed.toString(),
      title: title || parsed.hostname,
      text: normalizeIngestText(text)
    };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  deriveConceptTitleFromText,
  extractReadableText,
  extractTitle,
  fetchUrlForIngest,
  normalizeIngestText,
  stripHtml
};
