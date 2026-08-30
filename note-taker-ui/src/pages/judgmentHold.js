/* Client-side sentence matching is only for unsaved overnight events. Library
   evidence is filtered by the API so every client shares one quality bar. */
const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'between', 'both', 'but', 'can', 'could', 'did', 'does', 'doing', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'how', 'into', 'its', 'itself', 'just',
  'more', 'most', 'not', 'only', 'other', 'our', 'out', 'over', 'same', 'should',
  'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'too', 'under', 'until', 'very', 'was', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'would',
  'you', 'your'
]);

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const stem = (word = '') => {
  const lower = String(word || '').toLowerCase();
  return lower.length < 5 ? lower : lower.replace(/(ies|ied|ing|ed|es|s|y)$/, '');
};
const tokens = (value = '') => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s'-]/g, ' ')
  .split(/\s+/)
  .map(word => word.replace(/^[-']+|[-']+$/g, ''))
  .filter(word => word.length > 2 && !STOPWORDS.has(word));

export const answersHeldSentence = (text = '', claim = '') => {
  const terms = [...new Set(tokens(claim))];
  const roots = new Set(tokens(text).flatMap(token => [token, stem(token)]));
  const matched = terms.filter(term => roots.has(term) || roots.has(stem(term)));
  const ok = terms.length === 1
    ? matched.length === 1
    : terms.length <= 3
      ? matched.length >= 2
      : matched.length >= 2 && matched.length / terms.length >= 0.4;
  return { ok, matched, terms };
};
