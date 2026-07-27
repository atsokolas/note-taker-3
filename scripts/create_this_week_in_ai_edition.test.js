const test = require('node:test');
const assert = require('node:assert/strict');

const { ISSUE_INPUT } = require('./create_this_week_in_ai_issue_001');
const {
  runEdition,
  validateWeeklyManifest
} = require('./create_this_week_in_ai_edition');

test('weekly manifest produces a private Library-first wiki candidate', async () => {
  const result = await runEdition({ manifest: ISSUE_INPUT, apply: false });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.status, 'draft');
  assert.equal(result.visibility, 'private');
  assert.equal(result.sourceCount, 4);
  assert.match(result.title, /This Week in AI/);
});

test('weekly manifest rejects paid, secondary, and out-of-window sources', () => {
  assert.throws(
    () => validateWeeklyManifest({
      ...ISSUE_INPUT,
      items: [{ ...ISSUE_INPUT.items[0], url: 'https://example.com/paper' }]
    }),
    /direct https:\/\/arxiv.org\/abs/
  );
  assert.throws(
    () => validateWeeklyManifest({
      ...ISSUE_INPUT,
      items: [{ ...ISSUE_INPUT.items[0], sourceQuality: 'secondary' }]
    }),
    /primary source/
  );
  assert.throws(
    () => validateWeeklyManifest({
      ...ISSUE_INPUT,
      items: [{ ...ISSUE_INPUT.items[0], publishedAt: '2026-07-19T12:00:00.000Z' }]
    }),
    /outside the evidence window/
  );
});
