const fs = require('fs');
const path = require('path');

/**
 * The voice, enforced.
 *
 * Five words the product does not say. Each one is a place where software
 * names its own plumbing instead of the reader's things:
 *
 *   items          — a source, a note, a page, a belief. Say which.
 *   entries        — the same evasion, wearing a different collar.
 *   content        — what you saved. "Content" is what a CMS calls it.
 *   notifications  — this product prints a paper; it does not notify.
 *   dashboard      — there is no dashboard here, and never should be.
 *
 * The scan reads user-facing copy only. A class name is not a sentence, a
 * path is not a sentence, and `article.content` is a field rather than a word
 * anyone reads — the rule below is deliberately narrow so that a failure here
 * always means a real sentence a real person would see.
 */

const SRC = path.join(__dirname, '..');
const BANNED = ['items', 'entries', 'content', 'notifications', 'dashboard'];

/* The one exemption, and its reason.

   A privacy policy and terms of use are legal instruments, and "content" in
   them is a term of art covering everything a person uploads, imports or
   creates. Rewriting it to "what you saved" would narrow a promise the
   company has made, which is a decision for a lawyer and not for a house
   style guide. If these pages are ever rewritten, they should lose the word
   with legal advice rather than with a find-and-replace. */
const EXEMPT = new Set([
  path.join(SRC, 'pages', 'PrivacyPolicy.jsx'),
  path.join(SRC, 'pages', 'TermsOfUse.jsx')
]);

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
    if (EXEMPT.has(full)) continue;
    found.push(full);
  }
  return found;
};

const offences = () => {
  const found = [];
  for (const file of walk(SRC)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (line.includes('className')) return;
      const texts = [
        ...[...line.matchAll(QUOTED)].map(match => match[2]),
        ...[...line.matchAll(JSX_TEXT)].map(match => match[1])
      ];
      for (const text of texts) {
        if (!isCopy(text)) continue;
        for (const word of BANNED) {
          if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
            found.push(`${path.relative(SRC, file)}:${index + 1}  ${word}  ${text.slice(0, 70)}`);
          }
        }
      }
    });
  }
  return found;
};

describe('the words this product does not say', () => {
  it('names the reader’s things, never the plumbing', () => {
    const found = offences();
    expect(found).toEqual([]);
  });

  it('is looking at sentences, not at class names or fields', () => {
    // Guards the guard: if isCopy ever went blind, the test above would pass
    // for the wrong reason.
    expect(isCopy('Failed to load related items.')).toBe(true);
    expect(isCopy('modal-content modal-content--insert')).toBe(false);
    expect(isCopy('article-reader-content reader')).toBe(false);
    expect(isCopy('../pages/evergreenModel')).toBe(false);
    expect(isCopy('Two words')).toBe(false);
  });
});
