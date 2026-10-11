#!/usr/bin/env node
// Asks the reading-talks-back question of each case: rank the new source's
// passages against the held view, ask the model, verify the quote. With no
// model configured it lists the cases and exits 0, because silence is what
// readers get then.
//
//   npm run agent:eval:reading
require('dotenv').config();
const { CASES } = require('../server/agentEval/readingCases');
const { chatComplete, isTextGenerationConfigured } = require('../server/ai/hfTextClient');
const { topPassages } = require('../server/services/agentRetrieval');
const { __testables: { readOne } } = require('../server/services/readingTalksBack');

const main = async () => {
  if (!isTextGenerationConfigured()) {
    CASES.forEach(item => console.log(`${item.id.padEnd(24)} ${item.expect.padEnd(10)} skipped (no model)`));
    console.log(`\n0/${CASES.length} run: no model is configured, so reading stays silent.`);
    return;
  }
  let passed = 0;
  for (const item of CASES) {
    const passages = topPassages({ title: '', text: item.source, query: item.view, limit: 3 });
    const verdict = passages.length
      ? await readOne({ sentence: item.view, passages, sourceText: item.source, complete: chatComplete }).catch(() => null)
      : null;
    const got = verdict ? verdict.stance : 'silent';
    if (got === item.expect) passed += 1;
    console.log(`${item.id.padEnd(24)} ${item.expect.padEnd(10)} ${got === item.expect ? 'pass' : `fail  got ${got}`}`);
  }
  console.log(`\n${passed}/${CASES.length} passed`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
