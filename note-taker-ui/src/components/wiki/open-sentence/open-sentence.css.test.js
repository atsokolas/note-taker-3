import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'open-sentence.css'), 'utf8');

describe('open-sentence motion', () => {
  it('opens on the same curve a sentence already uses to move', () => {
    expect(css).toMatch(/grid-template-rows:\s*0fr/);
    expect(css).toMatch(/transition:\s*grid-template-rows var\(--noeis-motion-deliberate\) cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  });

  it('keeps the pocket and drops only the drawing when motion is reduced', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/transition:\s*none/);
    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).not.toMatch(/display:\s*none/);
  });

  it('lets a placed passage settle on the same 220ms curve', () => {
    expect(css).toMatch(/@keyframes open-sentence-place/);
    expect(css).toMatch(/animation: open-sentence-place var\(--noeis-motion-base\) cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  });

  it('lets the Open chip follow a fine pointer without inventing a new motion language', () => {
    expect(css).toMatch(/--open-chip-x/);
  });
});
