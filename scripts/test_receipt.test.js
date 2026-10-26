const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { identity } = require('./test_receipt');

test('receipt identity changes with dirty/untracked/renamed/deleted code and environment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-receipt-'));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git(['init']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
    fs.writeFileSync(path.join(root, 'code.js'), 'before');
    git(['add', '.']); git(['commit', '-m', 'base']);
    const before = identity(root);
    assert.deepEqual(identity(root), before);
    fs.writeFileSync(path.join(root, 'code.js'), 'after');
    assert.notEqual(identity(root).tree, before.tree);
    fs.writeFileSync(path.join(root, 'code.js'), 'before');
    fs.writeFileSync(path.join(root, 'new.js'), 'untracked');
    assert.notEqual(identity(root).tree, before.tree);
    fs.unlinkSync(path.join(root, 'new.js'));
    fs.renameSync(path.join(root, 'code.js'), path.join(root, 'renamed.js'));
    assert.notEqual(identity(root).tree, before.tree);
    fs.unlinkSync(path.join(root, 'renamed.js'));
    assert.notEqual(identity(root).tree, before.tree);
    process.env.NOEIS_RECEIPT_FIXTURE = 'changed';
    try { assert.notDeepEqual(identity(root).environment, before.environment); }
    finally { delete process.env.NOEIS_RECEIPT_FIXTURE; }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('compact boundary keeps real failures/zero matches/report-write errors nonzero', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-receipt-run-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const file of ['run_server_tests.js', 'test_receipt.js']) fs.copyFileSync(path.join(__dirname, file), path.join(root, 'scripts', file));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-m', 'base'], { cwd: root, stdio: 'pipe' });
    fs.writeFileSync(path.join(root, '.gitignore'), 'tmp/\n');
    fs.writeFileSync(path.join(root, 'scripts/proof.test.js'), "console.error('deliberate error remains visible'); process.exit(7);");
    const run = (args, env = {}) => spawnSync(process.execPath, ['scripts/test_receipt.js', 'server', '--node', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
    const failed = run(['proof']);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /deliberate error remains visible/);
    assert.match(failed.stdout, /SERVER FAIL/);
    assert.equal(run(['missing']).status, 1);
    fs.writeFileSync(path.join(root, 'blocked'), 'not a directory');
    assert.equal(run(['proof'], { NOEIS_TEST_REPORT_DIR: path.join(root, 'blocked') }).status, 1);
    fs.writeFileSync(path.join(root, 'scripts/proof.test.js'), "console.log('passing detail stays raw');");
    const passed = run(['proof']);
    assert.equal(passed.status, 0);
    assert.doesNotMatch(passed.stdout, /passing detail stays raw/);
    const receipts = fs.readdirSync(path.join(root, 'tmp/test-receipts')).filter(dir => fs.existsSync(path.join(root, 'tmp/test-receipts', dir, 'raw.log')));
    assert.ok(receipts.some(dir => fs.readFileSync(path.join(root, 'tmp/test-receipts', dir, 'raw.log'), 'utf8').includes('passing detail stays raw')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('SIGTERM stops the test process group and retains an interruption receipt', { skip: process.platform === 'win32' }, async () => {
  const { spawn } = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-receipt-signal-'));
  let wrapper;
  try {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'tmp'));
    for (const file of ['run_server_tests.js', 'test_receipt.js']) fs.copyFileSync(path.join(__dirname, file), path.join(root, 'scripts', file));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-m', 'base'], { cwd: root, stdio: 'pipe' });
    fs.writeFileSync(path.join(root, '.gitignore'), 'tmp/\n');
    fs.writeFileSync(path.join(root, 'scripts/proof.test.js'), `
      const { spawn } = require('child_process');
      const fs = require('fs');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
      fs.writeFileSync('tmp/ready.json', JSON.stringify({ pid: process.pid, child: child.pid }));
      setInterval(() => {}, 1000);
    `);
    wrapper = spawn(process.execPath, ['scripts/test_receipt.js', 'server', '--node', 'proof'], { cwd: root, stdio: 'ignore' });
    const closed = new Promise(resolve => wrapper.on('close', status => resolve(status)));
    const ready = path.join(root, 'tmp/ready.json');
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(ready) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(fs.existsSync(ready), 'test child started');
    const pids = Object.values(JSON.parse(fs.readFileSync(ready)));
    wrapper.kill('SIGTERM');
    assert.equal(await closed, 143);
    const dir = fs.readdirSync(path.join(root, 'tmp/test-receipts'))[0];
    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'tmp/test-receipts', dir, 'receipt.json')));
    assert.equal(receipt.status, 143);
    assert.equal(receipt.signal, 'SIGTERM');
    assert.ok(fs.existsSync(receipt.rawLog));
    for (const pid of pids) {
      let alive = true;
      const until = Date.now() + 1000;
      while (alive && Date.now() < until) {
        try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); }
        catch (error) { assert.equal(error.code, 'ESRCH'); alive = false; }
      }
      assert.equal(alive, false, `owned test child ${pid} stopped`);
    }
  } finally {
    wrapper?.kill('SIGKILL');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
