const fs = require('fs');
const path = require('path');

/**
 * Three sentences, product-wide.
 *
 *   That did not save.
 *   Nothing here yet.
 *   You went looking — here is why it’s empty.
 *
 * A reader meeting a failure should meet the same voice every time, and a
 * failure is one of a very small number of facts: the write did not land, the
 * place is empty, or the search found nothing. Every bespoke variant of those
 * — "Failed to create folder.", "Could not save note." — is the same fact in
 * a different costume, and the costume is what makes software feel assembled
 * by strangers.
 *
 * This test governs the writes, which are unambiguous. See the note below on
 * reads, which the sanctioned three do not cover.
 */

const SRC = path.join(__dirname, '..');

const SAVE = 'That did not save.';

/* A write that failed, in any of the many ways the codebase used to say it. */
const BESPOKE_WRITE = new RegExp(
  "(['\"])((?:Failed to|Could not|Unable to|We could not|Couldn't)\\s+"
  + '(?:save|create|update|delete|remove|add|move|attach|detach|apply|record|'
  + 'submit|send|post|rename|reorder|promote|revoke|import|export|set|write|'
  + 'accept|reject|archive|restore)[^\'"]{0,60})\\1',
  'g'
);

const SETTER = /\b(setError|setStatus|setNote|setMessage|setSaveError|setStartError|setChangeProposalError|error:|message:)\b/;

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

const bespokeWriteFailures = () => {
  const found = [];
  for (const file of walk(SRC)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      // console.error is for whoever is debugging, and speaks its own language.
      if (line.includes('console.')) return;
      if (!SETTER.test(line)) return;
      BESPOKE_WRITE.lastIndex = 0;
      let match = BESPOKE_WRITE.exec(line);
      while (match) {
        found.push(`${path.relative(SRC, file)}:${index + 1}  ${match[2].slice(0, 60)}`);
        match = BESPOKE_WRITE.exec(line);
      }
    });
  }
  return found;
};

describe('the three sentences', () => {
  it('says one thing when a write does not land', () => {
    expect(bespokeWriteFailures()).toEqual([]);
  });

  it('still has the sentence to say', () => {
    const inUse = walk(SRC).some(file => fs.readFileSync(file, 'utf8').includes(SAVE));
    expect(inUse).toBe(true);
  });

  it('is looking at copy, not at logging', () => {
    // Guards the guard.
    expect(SETTER.test("setError('Failed to create folder.')")).toBe(true);
    // Logging is excluded by the console. check rather than by SETTER, which
    // is why both guards exist.
    expect("console.error('x', err)".includes('console.')).toBe(true);
    BESPOKE_WRITE.lastIndex = 0;
    expect(BESPOKE_WRITE.test("'Failed to create folder.'")).toBe(true);
    BESPOKE_WRITE.lastIndex = 0;
    expect(BESPOKE_WRITE.test("'That did not save.'")).toBe(false);
  });
});
