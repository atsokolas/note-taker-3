const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

const { buildNotebookRouter } = require('../notebookRoutes');
const { buildConceptPinRouter } = require('../conceptPinRoutes');
const { buildConceptQuestionBoardRouter } = require('../conceptQuestionBoardRoutes');

// Every dependency but auth is a model that must not be reached: a wrongly
// typed field is refused at the route's edge, before anything is read.
const untouched = new Proxy(() => {}, { get: () => () => { throw new Error('reached past the shape'); } });
const deps = new Proxy({
  mongoose,
  authenticateToken: (req, _res, next) => { req.user = { id: String(new mongoose.Types.ObjectId()) }; next(); }
}, { get: (given, name) => (name in given ? given[name] : untouched) });

const start = async () => {
  const app = express().use(express.json());
  [buildNotebookRouter, buildConceptPinRouter, buildConceptQuestionBoardRouter].forEach(build => app.use(build(deps)));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const send = async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  return { send, close: () => new Promise(resolve => server.close(resolve)) };
};

test('a wrongly typed field is a 400 that names it, where it used to be a 500', async () => {
  const app = await start();
  try {
    assert.deepEqual(await app.send('POST', '/api/notebook/folders', { name: 7 }), { status: 400, body: { error: 'name must be text.' } });
    assert.deepEqual(await app.send('PUT', '/api/concepts/Moats/pins', { addHighlightIds: 'h-1' }), { status: 400, body: { error: 'addHighlightIds must be a list.' } });
    assert.deepEqual(await app.send('POST', '/api/questions', { text: ['why?'] }), { status: 400, body: { error: 'text must be text.' } });
    assert.deepEqual(await app.send('PUT', '/api/questions/q-1', { conceptName: { $ne: '' } }), { status: 400, body: { error: 'conceptName must be text.' } });
  } finally { await app.close(); }
});
