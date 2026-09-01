const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'styles', 'knowledge-movements.css'), 'utf8');

describe('the Consequence Ripple', () => {
  it('is one thread, drawn on the rule the delta already stands on', () => {
    expect(css).toMatch(/\.knowledge-movement__delta\.is-rippling::before\s*\{[^}]*width:\s*1px/s);
    expect(css).toMatch(/\.knowledge-movement__delta\.is-rippling::before\s*\{[^}]*transform-origin:\s*top/s);
  });

  it('draws itself rather than reserving space for an effect', () => {
    expect(css).toMatch(/@keyframes knowledge-movement-ripple\s*\{[^}]*scaleY\(0\)/s);
    // Absolute, so a thread that never runs changes no layout.
    expect(css).toMatch(/\.knowledge-movement__delta\.is-rippling::before\s*\{[^}]*position:\s*absolute/s);
  });

  it('keeps the thread and drops only the drawing when motion is reduced', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('knowledge-movement-ripple')));
    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).not.toMatch(/display:\s*none/);
  });

  it('never bounces, per the house rules for motion', () => {
    const block = css.slice(css.indexOf('.knowledge-movement__delta.is-rippling::before'));
    expect(block.slice(0, 400)).toMatch(/cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  });
});
