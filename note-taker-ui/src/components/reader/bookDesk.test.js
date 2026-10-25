import { completionFor, kindOf, lastTime, pageNow, pagesOf, readLine, sittingOf, spineOf, tallyLine } from './bookDesk';

const at = minutes => new Date(Date.UTC(2026, 9, 19, 21, minutes)).toISOString();
const NOW = Date.UTC(2026, 9, 19, 22, 0);

test('a line is read by how it is typed, and the page stays where it was', () => {
  expect(readLine('212 "The decline of violence … law of nature"', 188)).toEqual({ page: 212, text: 'The decline of violence … law of nature' });
  expect(readLine('he is conflating risk and uncertainty', 212)).toEqual({ page: 212, note: 'he is conflating risk and uncertainty' });
  expect(readLine('> “Call me Ishmael.”', null)).toEqual({ page: null, text: 'Call me Ishmael.' });
  expect(readLine('213', 212)).toEqual({ page: 213 });
  expect(readLine('1984 was the year', 4)).toEqual({ page: 1984, note: 'was the year' });
  expect(readLine('212 "Scale is a moat" #moats #power-laws', 4)).toEqual({ page: 212, tags: ['moats', 'power-laws'], text: 'Scale is a moat' });
  expect(readLine('#moats', 212)).toEqual({ page: 212, tags: ['moats'] });
  expect(readLine('the #1 reason he #lost', 9)).toEqual({ page: 9, tags: ['lost'], note: 'the #1 reason he' });
});

test('a question is a thought ending in a question mark', () => {
  expect(kindOf({ text: 'Is it?', note: '' })).toBe('quote');
  expect(kindOf({ text: '', note: 'is this survivorship?' })).toBe('question');
  expect(kindOf({ text: '', note: 'it is.' })).toBe('note');
});

test('marks sit in page order under their page, the Kindle run first', () => {
  const marks = [
    { _id: 'b', page: 212, text: 'Later on the page.', createdAt: at(30) },
    { _id: 'k2', location: 'Location 1702–1705', text: 'Second on the Kindle.', createdAt: at(1) },
    { _id: 'a', page: 188, note: 'first', createdAt: at(10) },
    { _id: 'c', page: 212, note: 'why?', createdAt: at(31) },
    { _id: 'k1', location: 'Location 90', text: 'First on the Kindle.', createdAt: at(2) }
  ];
  expect(pagesOf(marks).map(({ label, marks: onPage }) => [label, onPage.map(mark => mark._id)])).toEqual([
    ['Loc. 90', ['k1']],
    ['Loc. 1702–1705', ['k2']],
    ['p. 188', ['a']],
    ['p. 212', ['b', 'c']]
  ]);
  expect(pageNow(marks)).toBe(212);
});

test('tonight is the sitting still going on, said as a receipt', () => {
  const marks = [
    { _id: 'old', page: 40, text: 'Last week.', createdAt: '2026-10-12T21:00:00Z' },
    { _id: 'a', page: 188, text: 'A quote.', createdAt: at(10) },
    { _id: 'b', page: 212, note: 'is it?', createdAt: at(40) },
    { _id: 'c', page: 205, note: 'a thought', createdAt: at(50) }
  ];
  const sitting = sittingOf(marks, NOW);
  expect(sitting.map(mark => mark._id)).toEqual(['a', 'b', 'c']);
  expect(tallyLine(sitting)).toBe('pp. 188–212 · 1 quote, 1 note, 1 question');
  expect(sittingOf(marks, NOW + 3 * 60 * 60 * 1000)).toEqual([]);
});

test('last time is the last thing you wrote in your own words, or the last passage', () => {
  expect(lastTime([])).toBeNull();
  expect(lastTime([
    { page: 186, note: 'is this just survivorship?', createdAt: at(1) },
    { page: 188, text: 'A passage after it.', createdAt: at(2) }
  ])).toEqual({ page: 186, words: 'is this just survivorship?', own: true });
  expect(lastTime([{ text: 'Only a passage.', createdAt: at(1) }])).toEqual({ page: null, words: 'Only a passage.', own: false });
  expect(lastTime([{ page: 12, text: 'There is grandeur.', note: 'read first\n\nwhy end on grandeur?', createdAt: at(1) }]).words).toBe('why end on grandeur?');
});

test('the book finishes a quote you already marked, from its first words', () => {
  const marks = [{ text: 'The decline of violence may be the most significant development in our history.' }];
  expect(completionFor('The decline of viol', marks)).toBe('ence may be the most significant development in our history.');
  expect(completionFor('the decline of violence ', marks)).toBe('may be the most significant development in our history.');
  expect(completionFor('The decline of violence', marks)).toBe(' may be the most significant development in our history.');
  expect(completionFor('the most significant development', marks)).toBe('');
  expect(completionFor('The decline', marks)).toBe('');
});

test('the spine places each mark along the book and names the thickest stretch only when it stands out', () => {
  const at = (page, kind = 'quote') => ({ _id: `m${page}`, page, ...(kind === 'quote' ? { text: 'words' } : { note: 'mine' }) });
  const spine = spineOf([at(10), at(180), at(185, 'note'), at(190), at(400)]);
  expect(spine.end).toBe('p. 400');
  expect(spine.ticks.map(tick => tick.at)).toEqual([0.025, 0.45, 0.4625, 0.475, 1]);
  expect(spine.ticks[2]).toMatchObject({ kind: 'note', label: 'p. 185' });
  expect(spine.thickest).toEqual({ label: 'pp. 160–200', id: 'm180' });

  const even = spineOf([at(40), at(120), at(200), at(280), at(400)]);
  expect(even.thickest).toBeNull();
});

test('a Kindle book runs by location, and too few marks make no spine', () => {
  const kindle = [1200, 1250, 5000].map(n => ({ _id: `k${n}`, text: 'w', location: `Location ${n}–${n + 3}` }));
  expect(spineOf(kindle)).toMatchObject({ end: 'Loc. 5000' });
  expect(spineOf(kindle.slice(0, 2))).toBeNull();
  expect(spineOf([{ _id: 'r', text: 'no place' }, ...kindle.slice(0, 2)])).toBeNull();
});
