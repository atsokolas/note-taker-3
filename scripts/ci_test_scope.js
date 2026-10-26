#!/usr/bin/env node
// Narrow only understood component boundaries. Unknown/shared/risky inputs run
// every gate, including this classifier and workflow changes.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FILES } = require('./pack_extension');
const ROOT = path.resolve(__dirname, '..');
const ALL = { server: true, ui: true, extension: true };
const risky = /auth|privac|permission|persist|storage|sync|draft|session|token|migration|encrypt|exploration|work.?note|reading.?state|public|shar|ownership|account|credential|secret|overwrite|revision|recover/i;

function localDependencies(entries, root = ROOT) {
  const found = new Set();
  const visit = file => {
    if (found.has(file)) return;
    found.add(file);
    const full = path.join(root, file);
    if (!fs.existsSync(full) || !/\.[cm]?[jt]sx?$/.test(file)) return;
    const source = fs.readFileSync(full, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|require\(\s*|import\s*\(?\s*)['"](\.[^'"]+)['"]/g)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      const dependency = [base, ...['.js', '.jsx', '.cjs', '.json', '/index.js', '/index.jsx'].map(ext => base + ext)]
        .find(candidate => fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isFile());
      // An unresolved local import is a shared/unknown dependency: fail broad.
      if (!dependency) throw new Error(`Unresolved dependency: ${file} -> ${match[1]}`);
      visit(dependency);
    }
  };
  entries.forEach(visit);
  return found;
}

function classify(files, root = ROOT) {
  const scope = { server: false, ui: false, extension: false };
  if (!files.length) return { ...ALL, reason: 'No reliable change range' };
  let extension;
  try { extension = localDependencies([...FILES, 'note-taker-ui/src/styles/semantic-theme.css'], root); }
  catch (error) { return { ...ALL, reason: error.message }; }
  for (const file of files) {
    if (!fs.existsSync(path.join(root, file)) && !/^(?:docs\/.*\.md|README\.md|CHANGELOG\.md)$/.test(file)) return { ...ALL, reason: `Deleted/renamed or unknown input: ${file}` };
    if (risky.test(file) || /(?:^|\/)(?:package[^/]*\.json|manifest\.json|[^/]*lock[^/]*|[^/]*config[^/]*|\.env[^/]*)$/.test(file)) {
      return { ...ALL, reason: `Shared/configuration/safety input: ${file}` };
    }
    if (/^packages\//.test(file) && !/\.[cm]?[jt]sx?$/.test(file)) return { ...ALL, reason: `Package configuration/data input: ${file}` };
    if (extension.has(file)) {
      scope.extension = true;
      if (file.startsWith('note-taker-ui/')) scope.ui = true;
    } else if (/^note-taker-ui\/(?:src|public)\//.test(file)) {
      // API/context/hooks and shared models can change persistence or contracts.
      if (!/^note-taker-ui\/src\/(?:components|pages|styles)\//.test(file) || /model|context|provider/i.test(file)) {
        return { ...ALL, reason: `Shared UI dependency: ${file}` };
      }
      if (!/\.test\.[cm]?[jt]sx?$/.test(file)) {
        try {
          if ([...localDependencies([file], root)].some(dependency => risky.test(dependency))) return { ...ALL, reason: `Safety-sensitive UI dependency: ${file}` };
        } catch (error) { return { ...ALL, reason: error.message }; }
      }
      scope.ui = true;
    } else if (/^server\/(?:ai|agentEval)\//.test(file) || /^server\/.*\.test\.c?js$/.test(file) || /^packages\//.test(file)) {
      scope.server = true;
    } else if (/^(?:docs\/.*\.md|README\.md|CHANGELOG\.md)$/.test(file)) {
      // Documentation only; all check jobs still report a successful skip.
    } else return { ...ALL, reason: `Unknown/shared input: ${file}` };
  }
  // Some server tests read UI files as contract fixtures. Follow their local
  // imports too, rather than assuming all UI paths are independent of Server.
  if (scope.ui && !scope.server) {
    const tracked = execFileSync('git', ['ls-files', '-z', 'server', 'scripts', 'packages'], { cwd: root }).toString().split('\0');
    const roots = new Set();
    for (const file of tracked.filter(file => /\.test\.c?js$/.test(file) && file !== 'scripts/ci_test_scope.test.js')) {
      if (!fs.existsSync(path.join(root, file))) continue;
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      for (const match of source.matchAll(/note-taker-ui\/[\w./-]+/g)) {
        if (fs.existsSync(path.join(root, match[0])) && fs.statSync(path.join(root, match[0])).isFile()) roots.add(match[0]);
      }
    }
    try {
      const dependencies = localDependencies([...roots], root);
      if (files.some(file => dependencies.has(file))) scope.server = true;
    } catch (error) { return { ...ALL, reason: error.message }; }
  }
  return { ...scope, reason: 'Known component dependencies' };
}

function changedFiles(base, head, root = ROOT) {
  if (!base || /^0+$/.test(base) || !head) throw new Error('Missing comparison commits');
  // No rename detection: both old and new paths become delete/add entries.
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head, '--'], { cwd: root }).toString().split('\0').filter(Boolean);
}
function main() {
  let result;
  try {
    const [base, head] = process.argv.slice(2);
    result = classify(changedFiles(base, head));
  } catch (error) { result = { ...ALL, reason: `Broad fallback: ${error.message}` }; }
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, ['server', 'ui', 'extension'].map(key => `${key}=${result[key]}\n`).join(''));
}
if (require.main === module) main();
module.exports = { classify, changedFiles, localDependencies };
