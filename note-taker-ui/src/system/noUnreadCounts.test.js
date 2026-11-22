const fs = require('fs');
const path = require('path');

/**
 * The rule you can't turn off: Noeis never counts what you have not read.
 *
 * "12 new", "3 unread": a number like that turns reading into a debt, and
 * a debt is something you pay off rather than enjoy. Noeis says *that*
 * something is new, by name, and never *how much*. /manifesto says why.
 *
 * The scan fails on any sentence that puts a number in front of "new" or
 * "unread", so the rule holds for code nobody has written yet.
 */

const SRC = path.join(__dirname, '..');
const COUNTED = /\$\{[^}]+\}\s+(new|unread)\b|\{[^{}]+\}\s+(new|unread)\s*</;

const walk = (dir, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) found.push(full);
  }
  return found;
};

it('never counts what you have not read', () => {
  const counted = walk(SRC).flatMap(file => fs.readFileSync(file, 'utf8').split('\n')
    .map((line, index) => (COUNTED.test(line) ? `${path.relative(SRC, file)}:${index + 1}: ${line.trim()}` : null))
    .filter(Boolean));
  expect(counted).toEqual([]);
});
