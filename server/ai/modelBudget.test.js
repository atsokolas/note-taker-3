const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModelBudget } = require('./modelBudget');

test('each account gets so many model calls an hour, wherever they come from', async () => {
  let clock = 0;
  const { onBehalfOf, spend } = buildModelBudget({ perHour: 2, now: () => clock });
  const ask = userId => onBehalfOf(userId, async () => { await null; spend(); });

  await ask('a'); await ask('a');
  await assert.rejects(ask('a'), { status: 429 });
  await ask('b');
  spend();
  spend(); // work nobody's request started is not counted
  clock += 60 * 60 * 1000;
  await ask('a');
});
