#!/usr/bin/env node
/**
 * Run every server-side test: the node-style scripts and the jest suites.
 *
 * The repo has two test idioms and no naming convention separating them.
 * Most files are node-style: bare assert blocks (or node:test) executed with
 * `node file.test.js`. A minority use jest's describe/test/it globals, which
 * node cannot run at all. Both kinds used to be wired into npm scripts one
 * path at a time, so a new test ran only if someone remembered to add it.
 *
 * So the list is discovered rather than maintained: every *.test.js / *.test.cjs
 * under server/, scripts/ and packages/ runs, and a new one is picked up the
 * day it is written.
 *
 *   node scripts/run_server_tests.js            # everything
 *   node scripts/run_server_tests.js --node     # node-style files only
 *   node scripts/run_server_tests.js --jest     # jest suites only (extra args go to jest)
 *   node scripts/run_server_tests.js wiki       # only files whose path contains "wiki"
 */
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['server', 'scripts', 'packages'];
const SKIP = new Set(['node_modules', 'output', 'build', '.git']);
const TEST_FILE = /\.test\.c?js$/;
const JEST_GLOBALS = /^\s*(?:describe|test|it)(?:\.each|\.only)?\s*[(`]/m;
const NODE_TEST = /require\(['"](?:node:)?test['"]\)|from ['"](?:node:)?test['"]/;
const TIMEOUT_MS = 5 * 60 * 1000;

const args = process.argv.slice(2);
const only = args.includes('--node') ? 'node' : args.includes('--jest') ? 'jest' : null;
const filters = args.filter((arg) => !arg.startsWith('-'));
const jestArgs = args.filter((arg) => arg.startsWith('-') && arg !== '--node' && arg !== '--jest');

const walk = (dir, found = []) => {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (TEST_FILE.test(entry.name)) found.push(path.relative(ROOT, full));
  }
  return found;
};

const isJest = (file) => {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return JEST_GLOBALS.test(source) && !NODE_TEST.test(source);
};

const files = DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((file) => !filters.length || filters.some((f) => file.includes(f)))
  .sort();
const jestSuites = files.filter(isJest);
const nodeFiles = files.filter((file) => !isJest(file));

const runNodeFile = (file) => new Promise((resolve) => {
  const started = Date.now();
  execFile(process.execPath, [file], { cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
    (error, stdout, stderr) => resolve({
      file,
      ok: !error,
      seconds: ((Date.now() - started) / 1000).toFixed(1),
      output: `${stdout}${stderr}`,
      reason: error && (error.killed ? `timed out after ${TIMEOUT_MS / 1000}s` : `exit ${error.code}`)
    }));
});

const runNodeFiles = async () => {
  if (!nodeFiles.length) return [];
  const jobs = Number(process.env.TEST_JOBS) || Math.max(2, os.cpus().length);
  console.log(`Running ${nodeFiles.length} node-style test files, ${jobs} at a time.`);
  const queue = [...nodeFiles];
  const results = [];
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const result = await runNodeFile(queue.shift());
      results.push(result);
      console.log(`${result.ok ? 'pass' : 'FAIL'}  ${result.file}  (${result.seconds}s)`);
      if (!result.ok) console.log(`${result.output.trimEnd().split('\n').slice(-40).join('\n')}\n--- ${result.reason}\n`);
    }
  }));
  return results;
};

const runJest = () => {
  if (!jestSuites.length) return true;
  console.log(`\nRunning ${jestSuites.length} jest suites.`);
  try {
    execFileSync(
      'npx',
      /* --runTestsByPath, because jest treats bare positional arguments as
         regular expressions and would also match archived copies under output/. */
      ['jest', '--testEnvironment=node', '--rootDir', ROOT, '--runTestsByPath', ...jestSuites, ...jestArgs],
      { stdio: 'inherit', cwd: ROOT }
    );
    return true;
  } catch (_failed) {
    return false; // jest has already printed what went wrong.
  }
};

(async () => {
  const results = only === 'jest' ? [] : await runNodeFiles();
  const jestOk = only === 'node' ? true : runJest();
  const failed = results.filter((result) => !result.ok);

  console.log('\nServer tests');
  if (only !== 'jest') console.log(`  node-style: ${results.length - failed.length} of ${results.length} passed`);
  if (only !== 'node') console.log(`  jest:       ${jestSuites.length} suites, ${jestOk ? 'all passed' : 'some failed (see above)'}`);
  failed.forEach((result) => console.log(`  failed: ${result.file} (${result.reason})`));
  process.exit(failed.length || !jestOk ? 1 : 0);
})();
