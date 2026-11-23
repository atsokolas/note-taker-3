const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bookOnShelf } = require('../bookShelf');
const { bookSource } = require('../import/exportFiles');

test('a renamed Kindle book is still the one its Readwise marks land in', () => {
  const kindle = { ...bookSource({ provider: 'kindle', title: 'Middlemarch', author: 'George Eliot' }), title: 'Middlemarch: A Study of Provincial Life' };
  const readwise = bookSource({ provider: 'readwise', title: 'Middlemarch', author: 'George Eliot' });
  assert.equal(bookOnShelf([kindle], readwise), kindle);
});

test('a different book by the same author is not taken for it', () => {
  const shelf = [bookSource({ provider: 'kindle', title: 'Middlemarch', author: 'George Eliot' })];
  assert.equal(bookOnShelf(shelf, bookSource({ provider: 'readwise', title: 'Silas Marner', author: 'George Eliot' })), undefined);
});
