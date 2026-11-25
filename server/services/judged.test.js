const { test } = require('node:test');
const assert = require('node:assert/strict');
const { judged } = require('./judged');

/* A pair is read once for the words it held: the same words reuse the
   kept reading; words edited since are read again. */
test('a pair is read once, and again after either side is edited', async () => {
  const rows = [];
  const ConnectionJudgment = {
    find: ({ about }) => ({ select: () => ({ lean: async () => rows.filter(row => about.$in.includes(row.about)) }) }),
    bulkWrite: async ops => ops.forEach(({ updateOne: { filter, update } }) => {
      const row = rows.find(held => held.about === filter.about);
      if (row) Object.assign(row, update.$set); else rows.push({ ...update.$set });
    })
  };
  const reads = [];
  const judge = async ({ pairs }) => { reads.push(pairs.length); return pairs.map((_, index) => ({ index, relation: 'bears', a: '' })); };
  const pair = says => ({ about: 'a1>highlight:h1', a: { who: 'A', says: 'Checklists catch what memory drops.' }, b: { who: 'B', says } });
  const ask = says => judged({ userId: 'u1', pairs: [pair(says)], models: { ConnectionJudgment }, judge });

  assert.equal((await ask('Surgeons forget steps.')).get('a1>highlight:h1').relation, 'bears');
  await ask('Surgeons forget steps.');
  assert.deepEqual(reads, [1]);
  await ask('Surgeons forget steps under pressure.');
  assert.deepEqual(reads, [1, 1]);
  assert.equal(rows.length, 1);
});
