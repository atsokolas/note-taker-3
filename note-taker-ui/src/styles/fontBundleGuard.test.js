const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const scannedRoots = ['src', 'public', 'build']
  .map(folder => path.join(repoRoot, folder))
  .filter(folder => fs.existsSync(folder));

const blockedFamilies = [
  'So' + 'leil',
  ['Clipper', 'So', 'leil'].join('')
];

const ignoredDirectories = new Set([
  'node_modules',
  'playwright-report'
]);

const sourceExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.ts',
  '.tsx'
]);

const walk = (folder, files = []) => {
  fs.readdirSync(folder, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(fullPath, files);
      return;
    }
    if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  });
  return files;
};

describe('font bundle guard', () => {
  it('keeps paid font family names out of app source and generated assets', () => {
    const matches = [];
    scannedRoots.flatMap(root => walk(root)).forEach((filePath) => {
      const contents = fs.readFileSync(filePath, 'utf8');
      blockedFamilies.forEach((family) => {
        if (contents.includes(family)) {
          matches.push(path.relative(repoRoot, filePath));
        }
      });
    });

    expect(matches).toEqual([]);
  });
});
