const TRACKING_URL_RE = /https?:\/\/[^\s]+(?:\?|&)(?:utm_[^\s&]+|ref=[^\s&]+)/gi;
const TRACKING_HOST_RE = /https?:\/\/(?:www\.)?(?:substack\.com|beehiiv\.com|convertkit\.com)\/[^\s]+/gi;

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const stripTrackingUrls = (value = '') => (
  normalizeWhitespace(
    String(value || '')
      .replace(TRACKING_URL_RE, '')
      .replace(TRACKING_HOST_RE, '')
  )
);

const isBoilerplateRetrievalSentence = (sentence = '') => {
  const lower = normalizeWhitespace(sentence).toLowerCase();
  if (!lower) return true;
  if (lower.length < 40) return true;
  return [
    'welcome to',
    'joined us',
    'subscribe',
    'sign up',
    'utm_',
    'http://',
    'https://',
    'hi friends',
    'not boring',
    'publication_id',
    'redirect',
    'free trial'
  ].some((token) => lower.includes(token));
};

const sanitizeRetrievalSnippet = (value = '', { maxLength = 220 } = {}) => {
  const cleaned = stripTrackingUrls(String(value || '').replace(/<[^>]*>/g, ' '));
  if (!cleaned || isBoilerplateRetrievalSentence(cleaned)) return '';
  const limit = Math.max(40, Number(maxLength) || 220);
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1).trim()}…` : cleaned;
};

const pickSubstantiveSentence = (value = '') => {
  const sentences = normalizeWhitespace(value)
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sanitizeRetrievalSnippet(sentence, { maxLength: 280 }))
    .filter(Boolean);
  return sentences[0] || sanitizeRetrievalSnippet(value, { maxLength: 280 });
};

const classifyQuestionEvidenceTone = (value = '') => {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return 'neutral';
  if (/\b(counter|contradict|against|tension|weak|problem|trade[-\s]?off|fails?|doubt|uncertain|however|although|but)\b/.test(text)) {
    return 'counter';
  }
  if (/\b(support|because|shows|demonstrates|evidence|allows|enables|therefore|thus)\b/.test(text)) {
    return 'support';
  }
  return 'neutral';
};

module.exports = {
  stripTrackingUrls,
  isBoilerplateRetrievalSentence,
  sanitizeRetrievalSnippet,
  pickSubstantiveSentence,
  classifyQuestionEvidenceTone
};
