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
const { execFile, spawnSync } = require('child_process');
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

// Keep positional selectors separate from Jest option values. Unknown flags fail
// closed; forwarding a discovery/skip flag must never turn a gate into a pass.
const parseArgs = (args) => {
  const options = { only: null, filters: [], jestArgs: [], list: false };
  const values = new Set(['--maxWorkers', '--testTimeout', '--testNamePattern', '-t']);
  const flags = new Set(['--runInBand', '--detectOpenHandles', '--verbose', '--no-cache', '--bail']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') continue;
    if (arg === '--node' || arg === '--jest') {
      if (options.only && options.only !== arg.slice(2)) throw new Error('Choose --node or --jest, not both');
      options.only = arg.slice(2);
    } else if (arg === '--list') options.list = true;
    else if (!arg.startsWith('-')) options.filters.push(arg);
    else {
      const [flag, ...inline] = arg.split('=');
      if (values.has(flag)) {
        const value = inline.length ? inline.join('=') : args[++i];
        if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`);
        options.jestArgs.push(`${flag}=${value}`);
      } else if (flags.has(arg)) options.jestArgs.push(arg);
      else throw new Error(`Unsupported option: ${arg}`);
    }
  }
  if (options.only === 'node' && options.jestArgs.length) throw new Error('Jest options require Jest suites');
  return options;
};

const walk = (dir, found = []) => {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (TEST_FILE.test(entry.name)) found.push(full);
  }
  return found;
};

const isJest = (file, root = ROOT) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return JEST_GLOBALS.test(source) && !NODE_TEST.test(source);
};

const selectFiles = ({ filters, only }, root = ROOT) => {
  const available = DIRS.flatMap((dir) => walk(path.join(root, dir)))
    .map(file => path.relative(root, file))
    .filter(file => !only || (isJest(file, root) ? 'jest' : 'node') === only).sort();
  for (const filter of filters) {
    if (!available.some(file => file.includes(filter))) throw new Error(`No test files match selector: ${filter}`);
  }
  const files = available.filter(file => !filters.length || filters.some(filter => file.includes(filter)));
  if (!files.length) throw new Error('No test files selected');
  return files;
};
const runNodeFile = (file, root = ROOT, timeout = TIMEOUT_MS) => new Promise((resolve) => {
  const started = Date.now();
  execFile(process.execPath, [file], { cwd: root, timeout, maxBuffer: 64 * 1024 * 1024 },
    (error, stdout, stderr) => resolve({
      file,
      ok: !error,
      seconds: ((Date.now() - started) / 1000).toFixed(1),
      output: `${stdout}${stderr}`,
      reason: error && (error.killed ? `timed out after ${timeout / 1000}s` : `exit ${error.code}`)
    }));
});

const runNodeFiles = async (nodeFiles) => {
  if (!nodeFiles.length) return [];
  const jobs = process.env.TEST_JOBS === undefined ? Math.max(2, os.cpus().length) : Number(process.env.TEST_JOBS);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error('TEST_JOBS must be a positive integer');
  console.log(`Running ${nodeFiles.length} node-style test files, ${jobs} at a time.`);
  const queue = [...nodeFiles];
  const results = [];
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const result = await runNodeFile(queue.shift());
      results.push(result);
      console.log(`${result.ok ? 'pass' : 'FAIL'}  ${result.file}  (${result.seconds}s)`);
      console.log(result.output.trimEnd());
      if (!result.ok) console.log(`--- ${result.reason}`);
    }
  }));
  return results;
};

const runJest = (jestSuites, jestArgs) => {
  if (!jestSuites.length) return { ok: true, counts: null };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-jest-'));
  const reportPath = path.join(dir, 'results.json');
  const result = spawnSync('npx',
    ['jest', '--testEnvironment=node', '--rootDir', ROOT, '--runTestsByPath', ...jestSuites, ...jestArgs, '--json', `--outputFile=${reportPath}`],
    { encoding: 'utf8', cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  console.log(`${result.stdout || ''}${result.stderr || ''}`);
  if (result.error || result.signal) console.error(`Jest failed: ${result.error?.message || result.signal}`);
  let ok = result.status === 0 && !result.error;
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const counts = { tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests };
    if (!report.success || counts.passed + counts.failed === 0) ok = false;
    return { ok, counts, failures: report.testResults.filter(result => result.status === 'failed').map(result => ({ file: result.name, output: result.message })) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

const main = async (args = process.argv.slice(2)) => {
  const { only, filters, jestArgs, list } = parseArgs(args);
  const files = selectFiles({ only, filters });
  const jestSuites = files.filter(file => isJest(file));
  const nodeFiles = files.filter(file => !isJest(file));
  if (jestArgs.length && !jestSuites.length) throw new Error('Jest options selected no Jest suites');
  if (list) { console.log(JSON.stringify(files, null, 2)); return; }
  console.log(`Selected ${files.length} files (${nodeFiles.length} node, ${jestSuites.length} Jest). Use --list to preview paths.`);
  const results = await runNodeFiles(nodeFiles);
  const jest = runJest(jestSuites, jestArgs);
  const failed = results.filter(result => !result.ok);
  console.log(`Server: ${results.length - failed.length}/${results.length} node files passed; ${jestSuites.length} Jest suites ${jest.ok ? 'passed' : 'FAILED'}`);
  failed.forEach(result => console.log(`FAILED ${result.file}: ${result.reason}`));
  if (process.env.NOEIS_SERVER_REPORT) fs.writeFileSync(process.env.NOEIS_SERVER_REPORT, JSON.stringify({ files, nodeFiles: results.length, jestSuites: jestSuites.length, jest: jest.counts, failures: [...failed, ...(jest.failures || [])] }));
  process.exitCode = failed.length || !jest.ok ? 1 : 0;
};
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parseArgs, selectFiles, runNodeFile };
