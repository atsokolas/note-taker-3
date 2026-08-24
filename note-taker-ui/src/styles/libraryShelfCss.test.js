const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'room-shelf.css'), 'utf8');
const libraryCss = fs.readFileSync(path.join(__dirname, 'library-column.css'), 'utf8');
const shelf = fs.readFileSync(path.join(__dirname, '../components/library/LibraryShelfNav.jsx'), 'utf8');

describe('the shared room shelf hierarchy', () => {
  it('owns nested indentation once for every room', () => {
    expect(css).toMatch(/\.room-shelf__item\.is-nested\s*\{[^}]*padding-left/);
    expect(shelf).toMatch(/<RoomShelfButton[\s\S]*?nested/);
  });

  it('does not keep a competing Library-only folder rule', () => {
    expect(libraryCss).not.toMatch(/\.library-shelf ul\.library-shelf__folders/);
  });

  it('keeps a long desktop cabinet reachable and releases it on mobile', () => {
    expect(libraryCss).toMatch(/\.library-shelf\s*\{[^}]*max-height:\s*calc\(100vh - 88px\)[^}]*overflow-y:\s*auto/s);
    expect(libraryCss).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.library-shelf\s*\{[^}]*max-height:\s*none[^}]*overflow-y:\s*visible/s);
  });
});
