const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { refuseQueryOperators } = require('./refuseQueryOperators');

const app = express();
app.use(express.json());
app.use(refuseQueryOperators);
app.all('/echo', (req, res) => res.json({ body: req.body, query: req.query }));

let base;
let server;
test.before(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = body => fetch(`${base}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('an operator smuggled into a login body is refused', async () => {
  const response = await post({ username: { $ne: '' }, password: 'x' });
  assert.strictEqual(response.status, 400);
  assert.deepStrictEqual(await response.json(), { error: 'Field names cannot start with $.' });
});

test('an operator nested deep in a body or in the query string is refused', async () => {
  assert.strictEqual((await post({ page: { blocks: [{ attrs: { $where: '1' } }] } })).status, 400);
  assert.strictEqual((await fetch(`${base}/echo?id[$gt]=`)).status, 400);
});

test('ordinary bodies, dollar amounts and all, pass untouched', async () => {
  const body = { title: 'Costs $5', tags: ['$TSLA'], doc: { type: 'doc', content: [{ type: 'text', text: '$' }] } };
  const response = await post(body);
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual((await response.json()).body, body);
});
