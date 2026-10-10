// An answer is grounded in a source when it carries a run of that source's own
// words. Paraphrase does not count: it is the one thing a reader cannot check.

const PASSAGE_WORDS = 6;
const QUOTE_MIN_WORDS = 5;

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

const quotations = (reply = '') => [...String(reply).matchAll(/[“"]([^”"]+)[”"]/g)]
  .map(match => match[1])
  .filter(span => words(span).length >= QUOTE_MIN_WORDS);

// Whether a quoted span appears in any of the texts, word for word. An
// ellipsis marks words left out, so each piece between ellipses must appear
// on its own, however short.
const quotedIn = (span = '', texts = []) => {
  const haystacks = (Array.isArray(texts) ? texts : []).map(text => ` ${words(text).join(' ')} `);
  return String(span)
    .split(/…|\.{3}/)
    .map(piece => words(piece).join(' '))
    .filter(Boolean)
    .every(piece => haystacks.some(text => text.includes(` ${piece} `)));
};

// Quotations of five words or more that appear in none of the given texts.
// A short phrase in quotes is emphasis; a sentence in quotes is a claim
// about what a source said.
const inventedQuotes = (reply = '', texts = []) => quotations(reply).filter(span => !quotedIn(span, texts));

module.exports = { PASSAGE_WORDS, words, drawsOn, groundedIn, inventedQuotes, quotedIn };
