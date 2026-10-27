#!/usr/bin/env node
// One compact boundary for local/CI output. Test runners keep their own exit
// semantics; the complete output and structured results stay beside the receipt.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn, spawnSync, execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function identity(root = ROOT) {
  const git = args => execFileSync('git', args, { cwd: root });
  const paths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean).sort();
  const tree = crypto.createHash('sha256');
  for (const file of paths) {
    tree.update(`${file}\0`);
    const full = path.join(root, file);
    const stat = fs.lstatSync(full, { throwIfNoEntry: false });
    if (!stat) tree.update('<deleted>');
    else {
      tree.update(`${stat.mode}\0`);
      tree.update(stat.isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full));
    }
  }
  const dependencies = ['node_modules', 'note-taker-ui/node_modules'].map(dir => {
    const full = path.join(root, dir);
    const lock = path.join(full, '.package-lock.json');
    return fs.existsSync(full) ? [fs.realpathSync(full), fs.existsSync(lock) ? hash(fs.readFileSync(lock)) : null] : null;
  });
  return {
    commit: git(['rev-parse', 'HEAD']).toString().trim(),
    tree: tree.digest('hex'),
    environment: { node: process.version, executable: process.execPath, platform: process.platform, arch: process.arch,
      dependencies, overrides: { CI: 'true' }, variablesHash: hash(JSON.stringify(Object.entries({ ...process.env, CI: 'true' }).sort())) }
  };
}

async function main(args = process.argv.slice(2)) {
  const kind = args.shift();
  if (!['ui', 'server'].includes(kind)) throw new Error('Usage: node scripts/test_receipt.js ui|server [selectors/options] [--list]');
  const list = args.includes('--list');
  args = args.filter(arg => arg !== '--list');
  const cwd = kind === 'ui' ? path.join(ROOT, 'note-taker-ui') : ROOT;
  const runner = kind === 'ui' ? path.join(cwd, 'node_modules/react-scripts/bin/react-scripts.js') : path.join(ROOT, 'scripts/run_server_tests.js');
  const baseArgs = kind === 'ui' ? [runner, 'test', '--watchAll=false', ...args] : [runner, ...args];
  // Do not allow flags that can turn the UI gate into discovery-only or hide a
  // zero match. Server options are parsed by its runner before any execution.
  if (kind === 'ui' && args.some(arg => /^--(?:passWithNoTests|listTests|watch|watchAll|onlyFailures|findRelatedTests|lastCommit|changedSince|onlyChanged|json|outputFile|help|version)(?:=|$)/.test(arg) || /^-(?:o|f|h|v)$/.test(arg))) {
    throw new Error('Discovery, watch, skip, and output options are managed by the receipt runner');
  }
  const dir = path.resolve(ROOT, process.env.NOEIS_TEST_REPORT_DIR || 'tmp/test-receipts', `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  const rawLog = path.join(dir, 'raw.log');
  const details = path.join(dir, 'results.json');
  const preview = spawnSync(process.execPath, [...baseArgs, ...(kind === 'ui' ? ['--listTests', '--json'] : ['--list'])],
    { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  fs.writeFileSync(path.join(dir, 'selection.log'), `${preview.stdout || ''}${preview.stderr || ''}`);
  if (preview.error || preview.status !== 0) throw new Error(`Selection failed: ${preview.error?.message || preview.stderr || preview.stdout}\nLogs: ${dir}`);
  const files = JSON.parse(preview.stdout);
  if (!Array.isArray(files) || !files.length) throw new Error(`No test files selected. Logs: ${dir}`);
  if (list) { console.log(JSON.stringify(files, null, 2)); return; }
  const command = [process.execPath, ...baseArgs, ...(kind === 'ui' ? ['--json', `--outputFile=${details}`] : [])];
  const code = identity();
  const started = Date.now();
  const fd = fs.openSync(rawLog, 'w');
  let result;
  try {
    result = await new Promise(resolve => {
      const grouped = process.platform !== 'win32';
      const child = spawn(command[0], command.slice(1), { cwd, detached: grouped, stdio: ['ignore', fd, fd], env: { ...process.env, CI: 'true', ...(kind === 'server' ? { NOEIS_SERVER_REPORT: details } : {}) } });
      let interrupted = null;
      let escalation;
      const kill = signal => {
        try { grouped ? process.kill(-child.pid, signal) : child.kill(signal); }
        catch (error) { if (error.code !== 'ESRCH') fs.writeSync(fd, error.message); }
      };
      const forward = signal => {
        interrupted ||= signal;
        kill(signal);
        escalation ||= setTimeout(() => kill('SIGKILL'), 5000);
      };
      const interrupt = () => forward('SIGINT');
      const terminate = () => forward('SIGTERM');
      process.on('SIGINT', interrupt);
      process.on('SIGTERM', terminate);
      const timeout = setTimeout(() => forward('SIGTERM'), 15 * 60 * 1000);
      child.on('error', error => { fs.writeSync(fd, error.stack); });
      child.on('close', (status, signal) => {
        clearTimeout(timeout);
        if (interrupted) kill('SIGKILL');
        clearTimeout(escalation);
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', terminate);
        const stopped = interrupted || signal;
        resolve({ status: stopped ? 128 + (os.constants.signals[stopped] || 1) : status ?? 1, signal: stopped });
      });
    });
  } finally { fs.closeSync(fd); }
  const raw = fs.readFileSync(rawLog, 'utf8');
  let counts = { files: files.length };
  let report;
  let reportError;
  try {
    report = JSON.parse(fs.readFileSync(details, 'utf8'));
    if (kind === 'ui') {
      counts = { files: report.numTotalTestSuites, tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests };
      if (!report.success || !(report.numPassedTests + report.numFailedTests)) result.status ||= 1;
    } else {
      counts = { files: files.length, nodeFiles: report.nodeFiles, jestSuites: report.jestSuites, jest: report.jest };
      if (report.nodeFiles + report.jestSuites !== files.length) throw new Error('Incomplete server report');
    }
  } catch (error) {
    reportError = error.message;
    result.status ||= 1;
  }
  const warnings = { consoleErrors: (raw.match(/console\.error/g) || []).length,
    act: (raw.match(/not wrapped in act/g) || []).length,
    aggregateErrors: (raw.match(/AggregateError/g) || []).length,
    warnings: (raw.match(/\bWarning:|\bWARN\b/gi) || []).length };
  const receipt = { ...code, cwd, command, files, counts, seconds: (Date.now() - started) / 1000,
    status: result.status, signal: result.signal, reportError, warnings, rawLog, rawBytes: Buffer.byteLength(raw) };
  fs.writeFileSync(path.join(dir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`${kind.toUpperCase()} ${result.status === 0 ? 'PASS' : 'FAIL'} ${JSON.stringify(counts)} ${receipt.seconds.toFixed(2)}s; warnings ${JSON.stringify(warnings)}`);
  console.log(`Commit ${code.commit}; tree ${code.tree}; ${process.version} ${process.platform}/${process.arch}`);
  console.log(`Command (argv): ${JSON.stringify(command)}\nReceipt: ${path.join(dir, 'receipt.json')}\nRaw log: ${rawLog} (${receipt.rawBytes} bytes)`);
  if (result.status) {
    const failures = kind === 'server' ? (report?.failures || []).map(failure => `${failure.file}: ${failure.reason || ''}\n${failure.output}`) : (report?.testResults || []).filter(result => result.status === 'failed').map(result => `${result.name}\n${result.message}`);
    if (reportError) console.error(`Report failed: ${reportError}`);
    console.error((failures.join('\n') || raw).slice(-12000));
  }
  process.exitCode = result.status;
}
if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { identity, main };
