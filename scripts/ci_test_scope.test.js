const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { classify, changedFiles, localDependencies } = require('./ci_test_scope');
const { FILES } = require('./pack_extension');
const only = result => [result.server, result.ui, result.extension];

test('component routing and conservative safety/unknown/shared fallbacks', () => {
  const fixtures = [
    [['docs/readme.md'], [false, false, false]],
    [['note-taker-ui/src/components/ArticleReader.test.jsx'], [false, true, false]],
    [['server/agentEval/score.test.js'], [true, false, false]],
    [['server/ai/articlePassages.js'], [true, false, false]],
    [['popup.css'], [false, false, true]],
    [['note-taker-ui/src/styles/semantic-theme.css'], [true, true, true]],
    [['note-taker-ui/src/pages/placementSwitchModel.js'], [true, true, true]],
    [['note-taker-ui/src/api/highlights.js'], [true, true, true]],
    [['note-taker-ui/src/components/AuthPanel.jsx'], [true, true, true]],
    [['server/routes/wikiRoutes.js'], [true, true, true]],
    [['server/models/Article.js'], [true, true, true]],
    [['new-shared-helper.js'], [true, true, true]],
    [['note-taker-ui/package-lock.json'], [true, true, true]],
    [['.github/workflows/tests.yml'], [true, true, true]],
    [['scripts/ci_test_scope.js'], [true, true, true]],
    [[], [true, true, true]],
    [['docs/notes.md', 'popup.css', 'server/agentEval/score.test.js'], [true, false, true]],
    [['note-taker-ui/src/components/WorkNote.jsx'], [true, true, true]],
  ];
  fixtures.push([['note-taker-ui/src/components/ArticleReader.jsx'], [true, true, true]]);
  fixtures.push([['manifest.json'], [true, true, true]], [['packages/wiki-mcp/server.json'], [true, true, true]], [['note-taker-ui/src/pages/SharedWikiPage.jsx'], [true, true, true]]);
  fixtures.push([['note-taker-ui/src/pages/deletedFixture.js'], [true, true, true]]);
  for (const [files, expected] of fixtures) assert.deepEqual(only(classify(files)), expected, files.join(','));
});

test('every extension pack input and its transitive UI dependencies select extension', () => {
  for (const file of localDependencies(FILES)) assert.equal(classify([file]).extension, true, file);
});

test('eval duplicate tests remain covered by Server for every workflow path trigger', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/agent-eval.yml'), 'utf8');
  const triggers = [...workflow.matchAll(/- '([^']+)'/g)].map(match => match[1]);
  for (const trigger of triggers) {
    const file = trigger.replace(/\*\*/g, 'example.js').replace(/\*/g, '');
    assert.equal(classify([file]).server, true, trigger);
  }
  const { selectFiles } = require('./run_server_tests');
  const selected = selectFiles({ filters: [], only: null });
  for (const file of ['server/agentEval/score.test.js', 'server/agentEval/runEval.test.js']) assert.ok(selected.includes(file));
  assert.match(workflow, /if: github.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /npm run agent:eval:check/);
});

test('git comparison covers multi-commit pushes and both sides of renames/deletions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-scope-'));
  const git = args => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  try {
    git(['init']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
    fs.writeFileSync(path.join(root, 'old.js'), 'before');
    fs.writeFileSync(path.join(root, 'deleted.js'), 'deleted');
    git(['add', '.']); git(['commit', '-m', 'base']); const base = git(['rev-parse', 'HEAD']);
    fs.renameSync(path.join(root, 'old.js'), path.join(root, 'new.js'));
    git(['add', '-A']); git(['commit', '-m', 'rename']);
    fs.unlinkSync(path.join(root, 'deleted.js'));
    git(['add', '-A']); git(['commit', '-m', 'delete']);
    assert.deepEqual(changedFiles(base, 'HEAD', root).sort(), ['deleted.js', 'new.js', 'old.js']);
    assert.throws(() => changedFiles('000000', 'HEAD', root));
    assert.throws(() => changedFiles('missing', 'HEAD', root));
    assert.deepEqual(only(classify(['popup.js', 'note-taker-ui/src/components/ArticleReader.test.jsx'])), [false, true, true]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('local dependency traversal follows transitive imports and fails on unresolved inputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-dependencies-'));
  try {
    fs.writeFileSync(path.join(root, 'entry.js'), "const model = require('./model');");
    fs.writeFileSync(path.join(root, 'model.js'), "export { value } from './leaf.js';");
    fs.writeFileSync(path.join(root, 'leaf.js'), 'export const value = 1;');
    assert.deepEqual([...localDependencies(['entry.js'], root)].sort(), ['entry.js', 'leaf.js', 'model.js']);
    fs.unlinkSync(path.join(root, 'leaf.js'));
    assert.throws(() => localDependencies(['entry.js'], root), /Unresolved dependency/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
