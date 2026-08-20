const fs = require('fs');
const path = require('path');

/* The indent is the hierarchy the shelf nav is made of, and it shipped doing
   nothing: `.library-shelf ul { padding: 0 }` outranks a bare class, so the
   folders sat flush with All sources. A rule that loses is worse than no rule,
   because it reads as intent in the file and as nothing on the screen. */
const css = fs.readFileSync(path.join(__dirname, 'library-column.css'), 'utf8');

describe('the shelf hierarchy', () => {
  it('indents the folders with a selector that can actually win', () => {
    expect(css).toMatch(/\.library-shelf ul\.library-shelf__folders\s*\{[^}]*padding-left/);
  });

  it('does not try to do it from a bare class', () => {
    expect(css).not.toMatch(/^\.library-shelf__folders\s*\{/m);
  });
});
