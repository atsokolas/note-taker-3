const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { requestTiming, timed } = require('./requestTiming');

const listen = app => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

test('a response reports how long it waited on the database and on a model', async () => {
  const app = express();
  app.use(requestTiming);
  app.get('/slow', async (_req, res) => {
    await timed('db', () => new Promise(resolve => setTimeout(resolve, 20)));
    await Promise.all([1, 2].map(() => timed('ai', () => new Promise(resolve => setTimeout(resolve, 30)))));
    res.json({ ok: true });
  });
  const server = await listen(app);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/slow`, { headers: { 'x-request-id': 'req-1' } });
  server.close();

  assert.strictEqual(response.headers.get('x-request-id'), 'req-1');
  const timing = Object.fromEntries(response.headers.get('server-timing').split(', ').map((entry) => {
    const [name, ...fields] = entry.split(';');
    return [name, Object.fromEntries(fields.map(field => field.split('=')))];
  }));
  assert.strictEqual(timing.db.desc, '"1"');
  assert.strictEqual(timing.ai.desc, '"2"');
  assert.ok(Number(timing.db.dur) >= 15);
  assert.ok(Number(timing.ai.dur) >= 50, 'parallel waits are summed');
  assert.ok(Number(timing.total.dur) >= Number(timing.db.dur));
});

test('work outside a request runs untimed', async () => {
  assert.strictEqual(await timed('db', async () => 'done'), 'done');
});
