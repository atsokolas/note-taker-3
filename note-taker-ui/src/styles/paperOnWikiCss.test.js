import fs from 'fs';
import path from 'path';

/* The Paper sits on the wiki front page, which is a grid whose track is wider
   than the element holding it at laptop widths. `width: 100%` on a grid item
   resolves against that track, so the paper ran out under the agent rail at
   1280px — the RUN buttons landed inside the rail's column and the masthead
   collided with it. A column of text has a width of its own. */
describe('the paper at the top of the wiki', () => {
  const block = () => {
    const css = fs.readFileSync(path.join(__dirname, 'paper.css'), 'utf8');
    return css.match(/\.paper--compact \{[\s\S]*?\n\}/)?.[0] || '';
  };

  it('keeps its own measure rather than stretching to whatever holds it', () => {
    expect(block()).toMatch(/width:\s*min\(100%,\s*760px\)/);
    expect(block()).not.toMatch(/width:\s*100%\s*;/);
  });

  it('does not let a grid track push it past its container', () => {
    expect(block()).toMatch(/min-width:\s*0/);
    expect(block()).toMatch(/justify-self:\s*start/);
  });
});
