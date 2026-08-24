const assert = require('node:assert');
const { editorialSentence, readsAsModelScratchpad } = require('./wikiPresentationGuard');

/* The morning paper printed a model's working-out as the day's editorial line.
   The lead sentence is the one place the product must never babble. */

const LEAKED = "Here's a thinking process: 1. **Analyze User Request:** - Task: Write a 1-2 sentence editorial summary of what's new in a personal knowledge base over the last 24 hours.";
const FALLBACK = '3 wiki pages gained source material.';

assert.strictEqual(readsAsModelScratchpad(LEAKED), true, 'the leak that shipped is caught');
assert.strictEqual(
  editorialSentence(LEAKED, { fallback: FALLBACK }),
  FALLBACK,
  'and the deterministic summary runs instead'
);

// Each tell on its own.
[
  'Let me think about what changed today.',
  'Step 1: gather the new sources.',
  '1. Summarise the new pages',
  'Here is my plan for the summary.',
  'We need to produce a 1-2 sentence editorial summary of what is new.',
  'I have to write a calm summary before returning the answer.',
  '**Analysis** of the last day.',
  '## Summary',
  'Task: write a summary.',
  'assistant: your wiki is quiet today.',
  'Draft 1: the wiki gained three sources.'
].forEach((text) => {
  assert.strictEqual(readsAsModelScratchpad(text), true, `scratchpad not caught: ${text}`);
  assert.strictEqual(editorialSentence(text, { fallback: FALLBACK }), FALLBACK);
});

// Real summaries must survive, including ones about analysis and tasks.
[
  'Three wiki pages gained source material overnight, and one claim is due for review.',
  'Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours.',
  'Two sources arrived on the analysis of capital allocation, and nothing else moved.',
  'A new filing task is waiting, though nothing you hold has changed.'
].forEach((text) => {
  assert.strictEqual(readsAsModelScratchpad(text), false, `false positive: ${text}`);
  assert.strictEqual(editorialSentence(text, { fallback: FALLBACK }), text, `rejected a real summary: ${text}`);
});

// A tell hiding past the trim point is still caught: the raw text is judged first.
const lateTell = `${'The wiki gained a source. '.repeat(11)}**Analysis:** done.`;
assert.strictEqual(editorialSentence(lateTell, { fallback: FALLBACK }), FALLBACK, 'judged before trimming');

// Nothing to say is still nothing to say.
assert.strictEqual(editorialSentence('', { fallback: FALLBACK }), FALLBACK);
assert.strictEqual(readsAsModelScratchpad(''), false);

console.log('scratchpad guard tests passed');
