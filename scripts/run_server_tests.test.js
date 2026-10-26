const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, selectFiles, runNodeFile } = require('./run_server_tests');

test('Jest separated and inline option values are not filename selectors', () => {
  assert.deepEqual(parseArgs(['--jest', 'agentEval', '--maxWorkers', '2', '-t', 'keeps words']).jestArgs, ['--maxWorkers=2', '-t=keeps words']);
  assert.deepEqual(parseArgs(['wiki', '--maxWorkers=2']).filters, ['wiki']);
  for (const args of [['--maxWorkers'], ['--unknown'], ['--passWithNoTests'], ['--', '--listTests'], ['--node', '--jest'], ['--node', '--maxWorkers', '2']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('selection fails closed after zero match, deletion, rename, or mixed valid/invalid selectors', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-runner-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(__dirname + '/run_server_tests.js', path.join(root, 'scripts/run_server_tests.js'));
    const old = path.join(root, 'scripts/old.test.js');
    fs.writeFileSync(old, "console.log('proof that passing output is preserved');");
    const run = args => spawnSync(process.execPath, ['scripts/run_server_tests.js', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(run(['--node', 'old']).status, 0);
    assert.match(run(['--node', 'old']).stdout, /proof that passing output is preserved/);
    assert.equal(run(['old', 'missing']).status, 1);
    assert.equal(run(['missing', '--list']).status, 1);
    const badJobs = spawnSync(process.execPath, ['scripts/run_server_tests.js', '--node', 'old'], { cwd: root, env: { ...process.env, TEST_JOBS: '-1' }, encoding: 'utf8' });
    assert.equal(badJobs.status, 1);
    assert.match(badJobs.stderr, /positive integer/);
    fs.renameSync(old, path.join(root, 'scripts/new.test.js'));
    assert.equal(run(['old']).status, 1);
    assert.deepEqual(JSON.parse(run(['new', '--list']).stdout), ['scripts/new.test.js']);
    fs.unlinkSync(path.join(root, 'scripts/new.test.js'));
    assert.throws(() => selectFiles({ filters: [], only: null }, root), /No test files/);
    fs.writeFileSync(old, "console.error('deliberate visible failure'); process.exit(7);");
    const failed = run(['old']);
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /deliberate visible failure/);
    assert.match(failed.stdout, /exit 7/);
    fs.writeFileSync(old, 'setInterval(() => {}, 1000);');
    const timeout = await runNodeFile('scripts/old.test.js', root, 30);
    assert.equal(timeout.ok, false);
    assert.match(timeout.reason, /timed out/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
