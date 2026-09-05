const fs = require('fs');
const path = require('path');

/**
 * How the product sounds, enforced.
 *
 * Two rules a scanner can hold so reviewers can spend their reading on what
 * it cannot:
 *
 *   no exclamation marks  — excitement is the product's job, not the
 *      punctuation's. A paper that arrives does not need to shout that it
 *      arrived, and a failure that ends in "!" reads as alarm rather than
 *      honesty.
 *   no simply, no easily  — both read as blame the moment the thing is not
 *      simple or easy for the reader in front of it. ("Just" stays: "saved
 *      just now" is a clock, not a judgment.)
 *
 * Same copy-only idiom as the banned-words and three-sentences gates: quoted
 * strings and JSX text of three words or more. Class names, paths, fields,
 * and comments are not sentences and are not read.
 */

const SRC = path.join(__dirname, '..');

const QUOTED = /(['"])([A-Za-z][^'"]{14,}?)\1/g;
const JSX_TEXT = />\s*([A-Z][^<>{}]{14,}?)\s*</g;

/** Is this string something a person reads, or something a machine reads? */
const isCopy = (text) => {
  if (text.includes('__') || text.includes('--')) return false;      // BEM class names
  if (text.includes('/') && !text.includes(' ')) return false;       // paths and urls
  if (/^[a-z0-9 _-]+$/.test(text) && !text.endsWith('.')) return false; // class lists, ids, enums
  return text.trim().split(/\s+/).length >= 3;
};

const walk = (dir, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, found); continue; }
    if (!/\.(js|jsx)$/.test(entry.name) || entry.name.includes('.test.')) continue;
    found.push(full);
  }
  return found;
};

const copyStrings = () => {
  const found = [];
  for (const file of walk(SRC)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (line.includes('className')) return;
      const texts = [
        ...[...line.matchAll(QUOTED)].map(match => match[2]),
        ...[...line.matchAll(JSX_TEXT)].map(match => match[1])
      ];
      for (const text of texts) {
        if (isCopy(text)) found.push({ file: path.relative(SRC, file), line: index + 1, text });
      }
    });
  }
  return found;
};

const SHOUT = /[A-Za-z]!/;
const CONDESCEND = /\b(simply|easily)\b/i;

describe('how the product sounds', () => {
  it('never raises its voice', () => {
    const found = copyStrings()
      .filter(({ text }) => SHOUT.test(text))
      .map(({ file, line, text }) => `${file}:${line}  ${text.slice(0, 70)}`);
    expect(found).toEqual([]);
  });

  it('never calls the work simple or easy', () => {
    const found = copyStrings()
      .filter(({ text }) => CONDESCEND.test(text))
      .map(({ file, line, text }) => `${file}:${line}  ${text.slice(0, 70)}`);
    expect(found).toEqual([]);
  });
});
