const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextAccession, ownerMuseum, publicMuseum, sourceOffer } = require('./museumShape');

const piece = (accession, extra = {}) => ({
  accession, kind: 'article', targetId: `source-${accession}`, own: false, passage: 'Make haste slowly.', why: 'Patience as a method.',
  title: 'Life of Augustus', author: 'Suetonius', medium: 'Biography', year: '121', room: 'Time', url: 'https://example.com/augustus',
  ledTo: [], ...extra
});

test('an accession is the year a piece arrived and its place that year, and a retired number stays spent', () => {
  const museum = { pieces: [piece('2016.1'), piece('2021.1')], retired: ['2016.2'] };
  assert.equal(nextAccession(museum, '2016-05-01T00:00:00Z'), '2016.3');
  assert.equal(nextAccession(museum, '2023-01-09T00:00:00Z'), '2023.1');
});

test('a reading offers only the passages its reader marked that still read as passages', () => {
  const offer = sourceOffer('article', {
    title: 'You and Your Research', author: '', siteName: 'Bell Labs', url: 'https://example.com/hamming',
    publicationDate: 'March 7, 1986', createdAt: '2016-04-02T00:00:00Z',
    highlights: [{ text: 'Luck favors the prepared mind.', note: 'the whole talk in one line' }, { text: 'x'.repeat(401) }, { text: '' }]
  });
  assert.deepEqual(offer.passages, [{ text: 'Luck favors the prepared mind.', note: 'the whole talk in one line' }]);
  assert.equal(offer.author, 'Bell Labs');
  assert.equal(offer.year, '1986');
  assert.equal(offer.own, false);
});

test('a note of your own offers its opening, dated by when you began it, and leaves its private source out', () => {
  const offer = sourceOffer('note', { title: 'Why moats erode', content: '<p>Moats are maintained, not owned.</p><p>Second thought here. A third.</p>', createdAt: '2025-02-01T00:00:00Z' });
  assert.equal(offer.own, true);
  assert.equal(offer.year, '2025');
  assert.deepEqual(offer.passages, [{ text: 'Moats are maintained, not owned. Second thought here.', note: '' }]);
  assert.equal(offer.url, '');
});

test('a kept thread hangs whole: each passage it holds, named by its work, dated by when you kept it', () => {
  const offer = sourceOffer('thread', {
    title: 'A thread through Cargo Cult Science and Meditations', createdAt: '2020-01-01T00:00:00Z',
    marks: [{ title: 'Cargo Cult Science', text: 'You must not fool yourself.' }, { title: 'Meditations', text: 'x'.repeat(401) }]
  });
  assert.deepEqual(offer.passages, [{ text: 'You must not fool yourself.', note: 'Cargo Cult Science' }]);
  assert.deepEqual([offer.medium, offer.own, offer.year, offer.url], ['A thread in Noeis', true, '2020', '']);
});

test('a visitor sees what the owner hung and nothing of where it came from', () => {
  const museum = {
    name: 'Athan', handle: 'athan', intro: 'What shaped how I think.', open: true, userId: 'u1', retired: ['2016.2'],
    pieces: [
      piece('2016.1', { ledTo: ['2025.1', '2016.2'] }),
      piece('2025.1', { kind: 'wiki', targetId: 'p1', own: true, url: '' }),
      piece('2025.2', { kind: 'wiki', targetId: 'p2', own: true, url: '' })
    ]
  };
  const pages = new Map([
    ['p1', { _id: 'p1', slug: 'alphabet-is-berkshire', visibility: 'shared', lastReviewedAt: '2026-11-22T00:00:00Z' }],
    ['p2', { _id: 'p2', slug: 'private-page', visibility: 'private', lastReviewedAt: null }]
  ]);
  const wall = publicMuseum(museum, pages);
  const text = JSON.stringify(wall);
  for (const secret of ['u1', 'source-', '"p1"', '"p2"', 'private-page', '"kind"', '"open"']) assert.equal(text.includes(secret), false, secret);
  assert.deepEqual(wall.pieces[0].ledTo, ['2025.1']);
  assert.equal(wall.pieces[1].url, '/share/wiki/alphabet-is-berkshire');
  assert.equal(wall.pieces[1].reviewedAt, '2026-11-22T00:00:00Z');
  assert.equal(wall.pieces[2].url, '');
  assert.deepEqual(wall.retired, ['2016.2']);

  const owner = ownerMuseum(museum, pages);
  assert.equal(owner.open, true);
  assert.deepEqual(owner.pieces.map(({ kind, id }) => [kind, id]), [['article', 'source-2016.1'], ['wiki', 'p1'], ['wiki', 'p2']]);
});
