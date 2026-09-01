#!/usr/bin/env node
/**
 * Run the server's jest-style tests.
 *
 * server/ has two test idioms and no naming convention separating them. Most
 * files are node-style: bare assert blocks executed with `node file.js`, and
 * wired into npm scripts one path at a time. A minority use describe/it, which
 * node cannot run at all.
 *
 * Pointing jest at server/ reports the node-style majority as "must contain at
 * least one test" and buries the real results, so nobody pointed jest at
 * server/. The describe/it suites — Stage 5's roles, mandates, dissent and
 * handoff, Stage 6's decision memory, calibration and portability among them —
 * were written, committed, and then run by nothing.
 *
 * So the list is discovered rather than maintained: any server test file that
 * declares a describe block is a jest suite, and a new one is picked up the
 * day it is written. Nothing here needs updating when a test is added.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const SKIP = new Set(['node_modules', 'output', 'build', '.git']);
const DESCRIBES = /^\s*(?:describe|describe\.each)\s*[(.]/m;

const testFiles = (dir, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { testFiles(full, found); continue; }
    if (!entry.name.endsWith('.test.js')) continue;
    if (DESCRIBES.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(ROOT, full));
  }
  return found;
};

const suites = testFiles(SERVER).sort();
if (!suites.length) {
  console.log('No jest-style server suites found.');
  process.exit(0);
}

console.log(`Running ${suites.length} jest-style server suites.`);
try {
  execFileSync(
    'npx',
    /* --runTestsByPath, because jest treats bare positional arguments as
       regular expressions. Without it, server/.../notionFetchTool.test.js
       also matches the archived copy of that same file inside every export
       under output/, and the run reports stale failures from acceptance runs
       finished a month ago. */
    ['jest', '--testEnvironment=node', '--rootDir', ROOT, '--runTestsByPath', ...suites, ...process.argv.slice(2)],
    { stdio: 'inherit', cwd: ROOT }
  );
} catch (_failed) {
  // jest has already printed what went wrong; do not bury it in a stack trace.
  process.exit(1);
}
