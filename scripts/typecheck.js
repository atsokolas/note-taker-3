#!/usr/bin/env node
/**
 * The type checker reads the server's plain JavaScript and catches what tests
 * miss: a name that was never defined, a call with the wrong arguments. It
 * found a ReferenceError inside the Notion import's own error handler on its
 * first run.
 *
 * A name that is never defined fails the gate outright: that is a crash
 * waiting for its code path. The rest of what it reports today is mostly noise
 * from untyped Mongoose documents, so the gate is a ratchet: no file may gain
 * errors over the baseline, and every fix that removes some is locked in with
 * `--update`. The baseline only shrinks.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'typecheck-baseline.json');
const UNDEFINED_NAME = / error TS(2304|2552):/;

const errorsByFile = () => {
  const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'server/jsconfig.json', '--pretty', 'false'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const counts = {};
  const lines = tsc.stdout.split('\n').filter(line => / error TS\d+:/.test(line));
  lines.forEach((line) => {
    const file = line.slice(0, line.indexOf('('));
    counts[file] = (counts[file] || 0) + 1;
  });
  return { counts, lines };
};

const main = () => {
  const { counts, lines } = errorsByFile();
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  if (process.argv.includes('--update')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`Baseline: ${lines.length} errors in ${Object.keys(sorted).length} files.`);
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const undefinedNames = lines.filter(line => UNDEFINED_NAME.test(line));
  undefinedNames.forEach(line => console.error(line));
  const worse = Object.keys(sorted).filter(file => sorted[file] > (baseline[file] || 0));
  const better = Object.keys(baseline).filter(file => (sorted[file] || 0) < baseline[file]);
  worse.forEach((file) => {
    console.error(`${file}: ${sorted[file]} type errors, baseline ${baseline[file] || 0}`);
    lines.filter(line => line.startsWith(`${file}(`)).forEach(line => console.error(`  ${line}`));
  });
  if (better.length) console.log(`${better.length} files have fewer type errors than the baseline; run \`npm run typecheck -- --update\` to lock that in.`);
  if (worse.length || undefinedNames.length) process.exit(1);
  console.log(`Type check holds: ${lines.length} known errors, none new.`);
};

main();
