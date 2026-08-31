const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'public-casebook.css'), 'utf8');

describe('public casebook paper', () => {
  it('honors reduced motion on the sealed folio', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.public-casebook,[\s\S]*?animation:\s*none/
    );
  });

  it('does not paint the folio as glass or a feed', () => {
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/followers/);
    expect(css).not.toMatch(/like-count|vote|toast/i);
  });
});
