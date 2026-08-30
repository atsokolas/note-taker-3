const fs = require('fs');
const path = require('path');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'coverage') return [];
    return walk(full);
  }
  if (!/\.(js|jsx|css)$/.test(entry.name)) return [];
  return [full];
});

describe('Taste Pass T2 — the UI never confesses duplicates', () => {
  it('has no leftover duplicate-count caption in the UI bundle', () => {
    const banned = `copies of this ${'claim'}`;
    const root = path.join(__dirname, '..');
    const hits = walk(root).filter((file) => (
      new RegExp(banned, 'i').test(fs.readFileSync(file, 'utf8'))
    ));
    expect(hits).toEqual([]);
  });
});
