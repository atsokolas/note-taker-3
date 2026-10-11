const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'styles', file), 'utf8');
const paper = read('wiki-front-page.css');
const library = read('library-column.css');
const switchCss = read('placement-switch.css');

/**
 * Pass 4 is all motion, and motion is the one thing a unit test cannot watch.
 * What it can hold is the vocabulary: that each moment exists, that it uses
 * the product's one curve, and that reduced motion is honoured everywhere —
 * which is the rule most easily lost when someone adds the next animation.
 */
describe('living ink dries in', () => {
  it('takes a quarter second rather than happening between frames', () => {
    expect(library).toMatch(/transition:\s*color 250ms/);
  });

  it('flashes the destination when something lands there', () => {
    expect(library).toMatch(/@keyframes noeis-destination-flash/);
    expect(library).toMatch(/noeis-destination-flash 250ms/);
  });

  it('drops both when motion is reduced, and keeps the colour', () => {
    const reduced = library.slice(library.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/transition:\s*none/);
    expect(reduced).toMatch(/animation:\s*none/);
  });
});

describe('one curve, product-wide', () => {
  it('uses the same settle everywhere motion happens', () => {
    [paper, library, switchCss].forEach((sheet) => {
      expect(sheet).toMatch(/cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    });
  });

  it('never bounces', () => {
    [paper, library, switchCss].forEach((sheet) => {
      expect(sheet).not.toMatch(/cubic-bezier\([^)]*,\s*-\d/);
    });
  });
});
