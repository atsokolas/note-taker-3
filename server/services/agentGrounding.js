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

// Where each quotation lives: the first source that carries it word for word,
// so the reader can open the words where they were written.
const quotedFrom = (reply = '', items = []) => quotations(reply).flatMap((quote) => {
  const source = (Array.isArray(items) ? items : [])
    .find(item => item?.id && quotedIn(quote, [item.fullText || item.snippet || '']));
  return source ? [{ quote, type: source.type, id: source.id, title: source.title }] : [];
});

// A number is grounded the same way: the source states it. Each figure keeps
// the value it stands for and how precisely it was written, so "$81.6 billion"
// matches a filing's "81,615" (in millions) but not "$80 billion". Years and
// small bare counts are not figures a reader checks.
const SCALES = { thousand: 1e3, million: 1e6, mn: 1e6, mm: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12, t: 1e12 };
const NUMBER = /(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(%|percent|thousand|million|billion|trillion|mm|mn|bn|tn|[mbt]\b|x\b|×))?/gi;

// An amount as a sentence writes it: "$297,247 million", "$5.91bn".
const AMOUNT = '(\\$?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(?:thousand|million|billion|trillion|mm|mn|bn|tn|[mbt]\\b))?)';

const MONTH_BEFORE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+$/i;

const figuresIn = (text = '') => {
  const figures = [];
  for (const match of String(text).matchAll(NUMBER)) {
    const [raw, dollar, digits, unitRaw = ''] = match;
    const unit = unitRaw.toLowerCase();
    // "the high-80s" or "the 1990s" names a range, and "January 25" a day, not a figure.
    if (!unit && /^'?s\b/.test(String(text).slice(match.index + raw.length))) continue;
    // "the 52-week year" names a period's length, not a figure.
    if (!dollar && !unit && /^[-\s](?:week|month|day|year|quarter)\b/i.test(String(text).slice(match.index + raw.length))) continue;
    if (!dollar && !unit && MONTH_BEFORE.test(String(text).slice(Math.max(0, match.index - 12), match.index))) continue;
    const base = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const decimals = (digits.split('.')[1] || '').length;
    const bare = !dollar && !unit;
    if (bare && !digits.includes(',') && !digits.includes('.') && (base < 10 || (base >= 1900 && base <= 2100))) continue;
    const scale = SCALES[unit] || 1;
    figures.push({ raw: raw.trim(), value: base * scale, base, step: scale * 10 ** -decimals, percent: unit === '%' || unit === 'percent' });
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
// "75.0% of $177.8bn" is the percentage times the base.
const derivedFrom = (a, b) => [a / b, (a / b) * 100, a / b - 1, ((a - b) / b) * 100, a * b, (a * b) / 100, a - b, a + b];
// Small whole numbers a claim scales by ("x 4", "over 5 years") are not
// figures a reader checks, but they are inputs to the arithmetic shown.
const SCALERS = /\b(?:[2-9]|1[0-2])\b/g;
const SCALER_WORDS = [
  [/\b(?:doubl\w*|twice|halv\w*)\b/i, 2], [/\btripl\w*/i, 3], [/\bquadrupl\w*/i, 4],
  ...['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
    .map((word, index) => [new RegExp(`\\b(?:by|times|over|divided by)\\s+${word}\\b`, 'i'), index + 2])
];
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
  // "x 52/36" scales a nine-month figure to a year; its terms are not claims.
  const fractions = [...text.matchAll(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g)];
  const fractionTerms = new Set(fractions.flatMap(([, a, b]) => [a, b]));
  // "below 88-89%" sets a band to watch; both ends are the threshold.
  const before = figure => text.slice(0, text.indexOf(figure.raw)).replace(/\d+(?:\.\d+)?%?\s*[-–]\s*$/, '');
  const figures = figuresIn(text).filter(figure => !THRESHOLD.test(before(figure))
    && !fractionTerms.has(figure.raw));
  const scalers = [
    ...(text.match(SCALERS) || []).map(Number),
    ...fractions.map(([, a, b]) => Number(a) / Number(b)).filter(Number.isFinite),
    ...SCALER_WORDS.filter(([pattern]) => pattern.test(text)).map(([, k]) => k)
  ];
  const near = (value, figure) => UNIT_SHIFTS.some(shift => (
    Math.abs(value * shift - figure.value) <= Math.max(figure.step / 2, Math.abs(figure.value) * 0.005)
  ));
  // "1.10^5" (or "1.10 raised to the 5th power") compounds a rate;
  // "(b / a)^(1/4) - 1" is a growth rate per year.
  const exponents = [...text.matchAll(/(?:\^|\braised to the)\s*\(?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?(?:st|nd|rd|th)?\s*\)?/gi)]
    .map(([, a, b]) => (b ? Number(a) / Number(b) : Number(a)))
    .filter(Number.isFinite);
  const powers = value => exponents.map(e => value ** e).filter(Number.isFinite);
  const powered = value => powers(value).flatMap(p => [p, p - 1, (p - 1) * 100]);
  // Working shown in the claim must produce what the claim says it does:
  // "1.5% ($5.54 / $954.50)" is refused, as is "grew 11% to $297.25bn from
  // $269.91bn", however well sourced each figure is.
  const valueOf = raw => figuresIn(raw)[0];
  const wrongWorking = [
    // Both sides are amounts: "(92.3% U.S./Canada, 89.8% worldwide)" divides nothing.
    ...[...text.matchAll(new RegExp(`\\(\\s*${AMOUNT}\\s*\\/\\s*${AMOUNT}\\s*\\)(?!\\s*\\^)`, 'g'))].flatMap(([raw, x, y]) => {
      const [a, b] = [valueOf(x), valueOf(y)];
      if (!a || !b || !b.value || fractionTerms.has(x.trim())) return [];
      const others = figures.filter(figure => figure.raw !== a.raw && figure.raw !== b.raw);
      return others.some(figure => [a.value / b.value, (a.value / b.value) * 100, (a.value / b.value - 1) * 100].some(v => near(v, figure)))
        ? [] : [raw];
    }),
    ...[...text.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)%\\s+(?:to\\s+${AMOUNT}\\s+from\\s+${AMOUNT}|from\\s+${AMOUNT}\\s+to\\s+${AMOUNT})`, 'gi'))].flatMap(([raw, rate, toA, fromA, fromB, toB]) => {
      const [now, then] = [valueOf(toA || toB || ''), valueOf(fromA || fromB || '')];
      if (!now || !then || !then.value) return [];
      const step = /\./.test(rate) ? 10 ** -rate.split('.')[1].length : 1;
      return Math.abs((now.value / then.value - 1) * 100 - Number(rate)) <= step / 2 + 0.05 ? [] : [raw];
    }),
    // "Quadrupled" from $119bn to $279bn is 2.3x: a multiple in words is working too.
    ...[...text.matchAll(new RegExp(`\\b(doubl|tripl|quadrupl)\\w*(?:\\s+\\w+){0,3}?\\s+(from|to)\\s+${AMOUNT}\\s+(?:to|from)\\s+${AMOUNT}`, 'gi'))].flatMap(([raw, stem, first, x, y]) => {
      const times = { doubl: 2, tripl: 3, quadrupl: 4 }[stem.toLowerCase()];
      const [a, b] = /^from$/i.test(first) ? [valueOf(x), valueOf(y)] : [valueOf(y), valueOf(x)];
      const ratio = a?.value && b && b.value / a.value;
      return !ratio || (ratio >= times * 0.85 && ratio <= times * 1.4) ? [] : [raw];
    }),
    // "Roughly double (1.10^5 ≈ 1.61x)": the word against the multiple beside it.
    ...[...text.matchAll(/\b(doubl|tripl|quadrupl)\w*[^;]{0,40}?(?<![\d.])(\d+(?:\.\d+)?)\s*[x×](?![a-z])/gi)].flatMap(([raw, stem, multiple]) => {
      const times = { doubl: 2, tripl: 3, quadrupl: 4 }[stem.toLowerCase()];
      return Number(multiple) >= times * 0.85 && Number(multiple) <= times * 1.4 ? [] : [raw];
    })
  ];
  const known = figures.filter(figure => statedIn(figure, values));
  const follows = figure => known.some(a => (
    near(a.value, figure)
    // A rate written as a growth factor: 10% is 1.10; a share's remainder: 91.6% leaves 8.4%.
    || near(1 + a.value / 100, figure)
    || (a.percent && figure.percent && near(100 - a.value, figure))
    || powered(a.value).concat(powered(1 + a.value / 100)).some(value => near(value, figure))
    || known.some(b => a !== b && b.value !== 0 && powered(a.value / b.value).some(value => near(value, figure)))
    // "$4.90 x 1.10^5" carries a stated base forward at a compounding rate.
    || known.some(b => a !== b && powers(b.value).concat(powers(1 + b.value / 100))
      .some(p => near(a.value * p, figure) || near(a.value / p, figure)))
    || scalers.some(k => near(a.value * k, figure) || near(a.value / k, figure))
    || known.some(b => a !== b && b.value !== 0 && derivedFrom(a.value, b.value).some(value => near(value, figure)))
  )) || signedSums(known.map(a => a.value)).some(value => near(value, figure));
  for (let grew = true; grew;) {
    const next = figures.filter(figure => !known.includes(figure) && follows(figure));
    known.push(...next);
    grew = next.length > 0;
  }
  return [...figures.filter(figure => !known.includes(figure)).map(figure => figure.raw), ...wrongWorking];
};

module.exports = {
  PASSAGE_WORDS, NOTE_LABEL, words, drawsOn, groundedIn, inventedQuotes, quotedIn, quotedFrom,
  figuresIn, valuesIn, statedIn, unstatedFigures
};
