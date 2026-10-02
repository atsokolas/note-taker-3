const assert = require('assert');
const { parseNotebookWordingOptions } = require('./notebookWordingOptions');

const run = () => {
  const original = 'The team should probably revisit the rollout next week.';
  const parsed = parseNotebookWordingOptions(JSON.stringify({
    options: [
      { wording: 'The team should revisit the rollout next week.', explanation: 'Removes hedging without changing the plan.' },
      { wording: 'Revisit the rollout next week.', explanation: 'Leads with the action.' },
      { wording: 'Revisit the rollout next week.', explanation: 'Duplicate should drop.' },
      { wording: original, explanation: 'Same as original should drop.' },
      { wording: 'Next week, revisit the rollout.', explanation: 'Moves the timing forward for urgency.' }
    ]
  }), { original });
  assert.strictEqual(parsed.length, 3);
  assert.ok(parsed.every((item) => item.wording && item.explanation));
  assert.ok(parsed.every((item) => normalizeKey(item.wording) !== normalizeKey(original)));
  console.log('notebookWordingOptions tests passed');
};

const normalizeKey = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

run();
