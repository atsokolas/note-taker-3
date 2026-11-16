const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startWorkProjectErasure, SWEEP_INTERVAL_MS } = require('./workProjectErasure');

test('sweeps on readiness and hourly, skips overlap, catches errors and stops', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const connection = new EventEmitter(); connection.readyState = 0;
  let calls = 0, finish;
  const errors = [];
  const stop = startWorkProjectErasure({ connection, eraseDue: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, onError: (...args) => errors.push(args) });
  assert.equal(calls, 0);
  connection.readyState = 1; connection.emit('connected'); assert.equal(calls, 1);
  t.mock.timers.tick(SWEEP_INTERVAL_MS); assert.equal(calls, 1, 'overlapping sweep is skipped');
  finish(); await Promise.resolve();
  t.mock.timers.tick(SWEEP_INTERVAL_MS - 1); assert.equal(calls, 1);
  t.mock.timers.tick(1); assert.equal(calls, 2);
  finish(); await Promise.resolve(); stop();
  t.mock.timers.tick(SWEEP_INTERVAL_MS); connection.emit('connected'); assert.equal(calls, 2);
  assert.equal(connection.listenerCount('connected'), 0); assert.deepEqual(errors, []);
  const stopFailure = startWorkProjectErasure({ connection, eraseDue: async () => { throw new Error('offline'); }, onError: (...args) => errors.push(args) });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(errors.length, 1); stopFailure();
  const stopBlocked = startWorkProjectErasure({ connection, eraseDue: async () => ({ blocked: 1, failed: 2 }), onError: (...args) => errors.push(args) });
  await Promise.resolve(); await Promise.resolve(); stopBlocked();
  assert.deepEqual(errors[1], ['[work-project-erasure] incomplete batches', { blocked: 1, failed: 2 }]);
});
