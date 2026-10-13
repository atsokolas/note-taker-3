#!/usr/bin/env node
// Asks the reading-talks-back question of each case: find the new source's
// passages that answer the held view (by words, and by meaning when
// embeddings are configured), ask the model, verify the quote; the same for
// each open falsifier, asked whether the source meets it. Then the
// "you hold the opposite" question of each written sentence. With no model
// configured it lists the cases and exits 0, because silence is what readers
// get then.
//
//   npm run agent:eval:reading
require('dotenv').config();
const { CASES, FALSIFIER_CASES, OPPOSITE_CASES } = require('../server/agentEval/readingCases');
const { chatComplete, isTextGenerationConfigured } = require('../server/ai/hfTextClient');
const { embedTexts, isEmbeddingConfigured } = require('../server/ai/embed');
const { sourcePassages } = require('../server/services/agentRetrieval');
const { candidateViews, __testables: { askedText, readOne, readSentence } } = require('../server/services/readingTalksBack');

const line = (id, expect, result) => console.log(`${id.padEnd(28)} ${expect.padEnd(12)} ${result}`);

const main = async () => {
  const all = [...CASES, ...FALSIFIER_CASES, ...OPPOSITE_CASES];
  if (!isTextGenerationConfigured()) {
    all.forEach(item => line(item.id, item.expect, 'skipped (no model)'));
    console.log(`\n0/${all.length} run: no model is configured, so reading stays silent.`);
    return;
  }
  const embed = isEmbeddingConfigured() ? embedTexts : null;
  let passed = 0;
  for (const item of [...CASES, ...FALSIFIER_CASES]) {
    const ask = { _id: item.id, judgment: { currentJudgment: item.view }, condition: item.falsifier };
    const [candidate] = await candidateViews({ views: [ask], passages: sourcePassages('', item.source), embed, textOf: askedText });
    const verdict = candidate
      ? await readOne({ sentence: item.view, condition: item.falsifier, passages: candidate.passages, sourceText: item.source, complete: chatComplete }).catch(() => null)
      : null;
    const got = !verdict ? 'silent' : verdict.falsifier ? 'meets' : verdict.stance;
    if (got === item.expect) passed += 1;
    line(item.id, item.expect, got === item.expect ? 'pass' : `fail  got ${got}`);
  }
  for (const item of OPPOSITE_CASES) {
    const got = await readSentence({ view: item.view, sentence: item.sentence, complete: chatComplete }).catch(() => null) || 'silent';
    // What matters is whether a line is shown: only a sure contradiction is.
    const ok = (got === 'contradicts') === (item.expect === 'contradicts');
    if (ok) passed += 1;
    line(item.id, item.expect, ok ? `pass  (${got})` : `fail  got ${got}`);
  }
  console.log(`\n${passed}/${all.length} passed${embed ? '' : ' (words only: no embeddings configured)'}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
