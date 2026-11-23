const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { flatQuery } = require('./flatQuery');

test('a query is flat strings: no lists, no objects, no operators', async () => {
  const app = express().set('query parser', flatQuery).get('/echo', (req, res) => res.json(req.query));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const echo = async search => (await fetch(`http://127.0.0.1:${server.address().port}/echo?${search}`)).json();
  try {
    assert.deepEqual(await echo('q=moats&limit=5'), { q: 'moats', limit: '5' });
    assert.deepEqual(await echo('q=a&q=b&limit=5'), { limit: '5' }, 'a field sent twice is no field');
    assert.deepEqual(await echo('id[$gt]=&q=x%20y'), { 'id[$gt]': '', q: 'x y' }, 'brackets are only characters');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('a __proto__ field is a field, not a prototype', () => {
  const query = flatQuery('__proto__=x');
  assert.equal(Object.getPrototypeOf(query), null);
  assert.equal(query.__proto__, 'x');
});
