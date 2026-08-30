/*
 * A suggestion under a claim has to answer that sentence.
 *
 * Library evidence already searches the held claim, but the UI used to dump
 * whatever came back — one leftover word, a title match, an evergreen
 * "strongest" source. Overnight was the latest event tagged to the page, even
 * when the filing said it did not touch the claim.
 *
 * This ranks and keeps only passages that actually cover the hold. It never
 * scores a side. The human still files Why or Against.
 */

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'ours', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will',
  'with', 'would', 'you', 'your', 'yours'
]);

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const stem = (word = '') => {
  const lower = String(word || '').toLowerCase();
  if (lower.length < 5) return lower;
  return lower.replace(/(ies|ied|ing|ed|es|s|y)$/, '');
};

const tokenOf = (word = '') => String(word || '')
  .toLowerCase()
  .replace(/[^a-z0-9'-]/g, '')
  .replace(/^[-']+|[-']+$/g, '');

/** The words in the held sentence worth matching. Same bar as library evidence. */
export const holdTerms = (claim = '') => {
  const seen = new Set();
  return clean(claim)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map(tokenOf)
    .filter(word => word.length > 2 && !STOPWORDS.has(word))
    .filter((word) => {
      if (seen.has(word)) return false;
      seen.add(word);
      return true;
    });
};

export const matchedHoldTerms = (text = '', terms = []) => {
  const roots = new Set();
  clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .forEach((word) => {
      const token = tokenOf(word);
      if (!token) return;
      roots.add(token);
      roots.add(stem(token));
    });
  return terms.filter(term => roots.has(term) || roots.has(stem(term)));
};

/* One leftover word is not an answer. A short claim may only have one or two
   terms, and those must be allowed to match; a longer claim needs real cover. */
const coversHold = (terms = [], matched = []) => {
  if (!terms.length || !matched.length) return false;
  if (terms.length === 1) return matched.length === 1;
  if (matched.length >= 2) return true;
  return matched.length / terms.length >= 0.4;
};

export const answersHeldSentence = (text = '', claim = '') => {
  const terms = holdTerms(claim);
  const matched = matchedHoldTerms(text, terms);
  return { ok: coversHold(terms, matched), matched, terms };
};

const termsFromCandidate = (candidate = {}, terms = []) => (
  matchedHoldTerms(`${candidate?.text || ''} ${candidate?.note || ''}`, terms)
);

/** Quiet ink: the claim's own words, in the order the sentence said them. */
export const holdInk = (claim = '', matched = []) => {
  const hits = new Set((matched || []).map(term => stem(tokenOf(term))).filter(Boolean));
  if (!hits.size) return '';
  const words = [];
  const seen = new Set();
  clean(claim)
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .forEach((raw) => {
      const token = tokenOf(raw);
      if (!token || seen.has(token)) return;
      if (!hits.has(token) && !hits.has(stem(token))) return;
      seen.add(token);
      words.push(token);
    });
  return words.join(' · ');
};

/**
 * Keep library candidates that answer the held sentence, strongest cover first.
 * "Strongest" here is how much of this sentence the passage answers — not an
 * evergreen dump, not a title match, not a leftover generic term.
 */
export const selectHoldCandidates = (candidates = [], claim = '') => {
  const terms = holdTerms(claim);
  if (!terms.length) return [];
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const matched = termsFromCandidate(candidate, terms);
      return { ...candidate, matched };
    })
    .filter(candidate => coversHold(terms, candidate.matched) && clean(candidate.text))
    .sort((left, right) => (
      right.matched.length - left.matched.length
      || String(left.id || '').localeCompare(String(right.id || ''))
    ));
};
