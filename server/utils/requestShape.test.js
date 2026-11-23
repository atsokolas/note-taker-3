const test = require('node:test');
const assert = require('node:assert/strict');
const { shaped, record, z } = require('./requestShape');

const run = (shapes, req) => {
  let status = 200; let body = null; let passed = false;
  const res = { status: code => { status = code; return res; }, json: value => { body = value; return res; } };
  shaped(shapes)(req, res, () => { passed = true; });
  return { status, body, passed };
};

const note = { body: z.object({ title: z.string().max(5).optional(), tags: z.array(z.string()).nullish(), meta: record().nullish() }) };

test('a request of the right shape passes untouched, extra fields and all', () => {
  const req = { body: { title: 'Ok', extra: 1 } };
  assert.equal(run(note, req).passed, true);
  assert.deepEqual(req.body, { title: 'Ok', extra: 1 });
});

test('a wrong type is refused with the field named in plain words', () => {
  assert.deepEqual(run(note, { body: { title: 7 } }), { status: 400, body: { error: 'title must be text.' }, passed: false });
  assert.equal(run(note, { body: { tags: 'a' } }).body.error, 'tags must be a list.');
  assert.equal(run(note, { body: { tags: ['a', 2] } }).body.error, 'tags.1 must be text.');
  assert.equal(run(note, { body: { meta: [] } }).body.error, 'meta must be an object.');
  assert.equal(run(note, { body: { title: 'Too long' } }).body.error, 'title must be at most 5 characters.');
});

test('a missing body is read as empty, and params and query are checked too', () => {
  assert.equal(run(note, {}).passed, true);
  const byId = { params: z.object({ id: z.string().regex(/^\d+$/) }), query: z.object({ limit: z.string().optional() }) };
  assert.equal(run(byId, { params: { id: '12' }, query: {} }).passed, true);
  assert.equal(run(byId, { params: { id: '12' }, query: { limit: ['1', '2'] } }).body.error, 'limit must be text.');
  assert.equal(run(byId, { params: { id: 'x' }, query: {} }).status, 400);
});
