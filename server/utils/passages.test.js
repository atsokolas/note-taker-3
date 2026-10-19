const test = require('node:test');
const assert = require('node:assert');
const { absorbPassage, passageIn, samePassage } = require('./passages');

const PAGE = 'Ce que l’on conçoit bien s’énonce clairement. The decline of violence may be the most significant and least appreciated development in the history of our species, but it is not a law of nature. Later sentences follow.';

test('a quote typed with only its ends is found in the book as the book prints it', () => {
  assert.strictEqual(
    passageIn(PAGE, '"The decline of violence … not a law of nature'),
    'The decline of violence may be the most significant and least appreciated development in the history of our species, but it is not a law of nature'
  );
  assert.strictEqual(passageIn(PAGE, 'the decline of VIOLENCE may be'), 'The decline of violence may be', 'case and quote marks do not matter');
  assert.strictEqual(passageIn(PAGE, 'conçoit bien s’énonce clairement'), 'conçoit bien s’énonce clairement', 'accents are words too');
});

test('too few words, words out of order, or a word cut in half is no match', () => {
  assert.strictEqual(passageIn(PAGE, 'the decline'), '');
  assert.strictEqual(passageIn(PAGE, 'law of nature … The decline of'), '');
  assert.strictEqual(passageIn(PAGE, 'ecline of violence may'), '');
});

test('two passages are one when one was typed with only its ends', () => {
  assert.ok(samePassage('The decline of violence … not a law of nature', PAGE));
  assert.ok(samePassage('  It is not a LAW of nature! ', 'It is not a law of nature.'));
  assert.ok(!samePassage('It is a law of nature', 'It is not a law of nature'));
});

test('an arriving Kindle highlight completes the quote typed at the desk and keeps its page and note', () => {
  const typed = { text: '"The decline of violence … least appreciated development', note: 'base year?', page: 212, createdAt: new Date('2026-10-19T21:00:00Z') };
  const other = { text: 'Something else entirely, marked long ago.', note: '' };
  const held = absorbPassage([other, typed], { text: PAGE, note: 'from the Kindle' });
  assert.strictEqual(held, typed);
  assert.strictEqual(typed.text, 'The decline of violence may be the most significant and least appreciated development');
  assert.strictEqual(typed.note, 'base year?\n\nfrom the Kindle');
  assert.strictEqual(typed.page, 212);
});

test('a note typed on its own takes the Kindle highlight made at the same moment, and only that one', () => {
  const note = { text: '', note: 'He is conflating risk with uncertainty.', createdAt: new Date('2026-10-19T21:14:30Z') };
  assert.strictEqual(absorbPassage([note], { text: 'Risk you can price.', at: '2026-10-19T21:30:00Z' }), null);
  assert.strictEqual(absorbPassage([note], { text: 'Risk you can price; uncertainty you cannot.', at: '2026-10-19T21:14:00Z' }), note);
  assert.strictEqual(note.text, 'Risk you can price; uncertainty you cannot.');
  assert.strictEqual(note.note, 'He is conflating risk with uncertainty.');
});

test('a new passage is new', () => {
  assert.strictEqual(absorbPassage([{ text: 'One thing.', note: '' }], { text: 'Another thing entirely.' }), null);
});
