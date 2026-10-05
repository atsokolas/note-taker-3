// An answer is grounded in a source when it carries a run of that source's own
// words. Paraphrase does not count: it is the one thing a reader cannot check.

const PASSAGE_WORDS = 6;

const words = (text = '') => String(text || '')
  .toLowerCase()
  .replace(/[‘’]/g, "'")
  .replace(/[^a-z0-9' ]+/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

const ngrams = (list, n) => {
  const grams = new Set();
  for (let i = 0; i + n <= list.length; i += 1) grams.add(list.slice(i, i + n).join(' '));
  return grams;
};

const drawsOn = (reply, sourceText, n = PASSAGE_WORDS) => {
  const sourceGrams = ngrams(words(sourceText), n);
  for (const gram of ngrams(words(reply), n)) if (sourceGrams.has(gram)) return true;
  return false;
};

// The items whose own words the reply carries, in the order they were given.
const groundedIn = (reply = '', items = []) => (Array.isArray(items) ? items : [])
  .filter((item) => item && drawsOn(reply, item.fullText || item.replySnippet || item.snippet || ''));

module.exports = { PASSAGE_WORDS, words, drawsOn, groundedIn };
