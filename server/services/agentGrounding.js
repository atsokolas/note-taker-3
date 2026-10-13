// An answer is grounded in a source when it carries a run of that source's own
// words. Paraphrase does not count: it is the one thing a reader cannot check.

const PASSAGE_WORDS = 6;
const QUOTE_MIN_WORDS = 5;
// A highlight is shown with the reader's margin note after this label. The
// author's words and the reader's are two statements, never one quotation.
const NOTE_LABEL = 'Your note:';

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

// A text's separate statements: the author's words, and each margin note, which
// runs from its label to the end of its paragraph.
const statements = (text = '') => {
  const [first, ...noted] = String(text || '').split(NOTE_LABEL);
  return [first, ...noted.flatMap((part) => {
    const [note, ...rest] = part.split(/\n\s*\n/);
    return [note, rest.join('\n\n')];
  })];
};

// Whether a quoted span appears in one of the texts, word for word. An
// ellipsis marks words left out, so each piece between ellipses must appear
// on its own, however short, but all of them in the same statement.
const quotedIn = (span = '', texts = []) => {
  const haystacks = (Array.isArray(texts) ? texts : [])
    .flatMap(statements)
    .map(text => ` ${words(text).join(' ')} `);
  const pieces = String(span)
    .split(/…|\.{3}/)
    .map(piece => words(piece).join(' '))
    .filter(Boolean);
  return pieces.length > 0 && haystacks.some(text => pieces.every(piece => text.includes(` ${piece} `)));
};

// Quotations of five words or more that appear in none of the given texts.
// A short phrase in quotes is emphasis; a sentence in quotes is a claim
// about what a source said.
const inventedQuotes = (reply = '', texts = []) => quotations(reply).filter(span => !quotedIn(span, texts));

// A number is grounded the same way: the source states it. Each figure keeps
// the value it stands for and how precisely it was written, so "$81.6 billion"
// matches a filing's "81,615" (in millions) but not "$80 billion". Years and
// small bare counts are not figures a reader checks.
const SCALES = { thousand: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, t: 1e12 };
const NUMBER = /(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(%|percent|thousand|million|billion|trillion|mn|bn|[mbt]\b|x\b|×))?/gi;

const figuresIn = (text = '') => {
  const figures = [];
  for (const match of String(text).matchAll(NUMBER)) {
    const [raw, dollar, digits, unitRaw = ''] = match;
    const unit = unitRaw.toLowerCase();
    const base = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const decimals = (digits.split('.')[1] || '').length;
    const bare = !dollar && !unit;
    if (bare && !digits.includes(',') && !digits.includes('.') && (base < 10 || (base >= 1900 && base <= 2100))) continue;
    const scale = SCALES[unit] || 1;
    figures.push({ raw: raw.trim(), value: base * scale, base, step: scale * 10 ** -decimals });
  }
  return figures;
};

// Every value a text states, at every scale a table might state it in,
// and as the bare number it was written as ("$9,226 million" also states 9,226).
const valuesIn = (text = '') => figuresIn(text).flatMap(({ value, base, step }) => (
  step >= 1 ? [value, value * 1e3, value * 1e6, value * 1e9, base] : [value, base]
));

const statedIn = (figure, values) => values.some(value => (
  Math.abs(value - figure.value) <= Math.max(figure.step / 2, Math.abs(figure.value) * 1e-9)
));

// What two stated figures make: a share, a ratio, a change, a product, a sum.
const derivedFrom = (a, b) => [a / b, (a / b) * 100, ((a - b) / b) * 100, a * b, a - b, a + b];
// Small whole numbers a claim scales by ("x 4", "over 5 years") are not
// figures a reader checks, but they are inputs to the arithmetic shown.
const SCALERS = /\b(?:[2-9]|1[0-2])\b/g;
// "below roughly 70%" names a line to watch, not a fact to check.
const THRESHOLD = /\b(?:below|above|under|over|exceeds?|beneath|falls? to|drops? to|rises? to)\s+(?:roughly\s+|about\s+|approximately\s+)?$/i;
// Arithmetic often moves between units: 9,226 (millions) / 20.76 is 444.4 million.
const UNIT_SHIFTS = [1, 1e3, 1e6, 1e9, 1e-3, 1e-6, 1e-9];

// Sums and differences of up to four figures, for a chain like
// "$15.82bn - $6.435bn - $2.458bn - $0.847bn = $6.08bn".
const signedSums = (list) => {
  const sums = [];
  const walk = (start, total, count) => {
    if (count >= 3) sums.push(total);
    if (count === 4) return;
    for (let index = start; index < list.length; index += 1) {
      walk(index + 1, total + list[index], count + 1);
      walk(index + 1, total - list[index], count + 1);
    }
  };
  list.slice(0, 12).forEach((value, index) => walk(index + 1, value, 1));
  return sums;
};

// The figures in a claim that none of the given texts states. A figure the
// writer computed counts when the claim shows its working: it follows from
// figures in the same claim that the sources state, or that follow in turn,
// as "1.99% ($5.91bn / $297.25bn)" or "$384,884 million ($96,221m x 4)" do.
const unstatedFigures = (claim = '', texts = []) => {
  const values = (Array.isArray(texts) ? texts : []).flatMap(valuesIn);
  const text = String(claim);
  const figures = figuresIn(text).filter(figure => !THRESHOLD.test(text.slice(0, text.indexOf(figure.raw))));
  const scalers = (text.match(SCALERS) || []).map(Number);
  const near = (value, figure) => UNIT_SHIFTS.some(shift => (
    Math.abs(value * shift - figure.value) <= Math.max(figure.step / 2, Math.abs(figure.value) * 0.005)
  ));
  const known = figures.filter(figure => statedIn(figure, values));
  const follows = figure => known.some(a => (
    near(a.value, figure)
    || scalers.some(k => near(a.value * k, figure) || near(a.value / k, figure))
    || known.some(b => a !== b && b.value !== 0 && derivedFrom(a.value, b.value).some(value => near(value, figure)))
  )) || signedSums(known.map(a => a.value)).some(value => near(value, figure));
  for (let grew = true; grew;) {
    const next = figures.filter(figure => !known.includes(figure) && follows(figure));
    known.push(...next);
    grew = next.length > 0;
  }
  return figures.filter(figure => !known.includes(figure)).map(figure => figure.raw);
};

module.exports = {
  PASSAGE_WORDS, NOTE_LABEL, words, drawsOn, groundedIn, inventedQuotes, quotedIn,
  figuresIn, valuesIn, statedIn, unstatedFigures
};
