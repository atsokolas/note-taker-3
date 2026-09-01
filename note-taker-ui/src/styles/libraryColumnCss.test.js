const fs = require('fs');
const path = require('path');

const libraryCss = fs.readFileSync(path.join(__dirname, 'library-column.css'), 'utf8');
const themeCss = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');
const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki-front-page.css'), 'utf8');

describe('the 1px meander', () => {
  it('is one living-ink material, not a second stylesheet', () => {
    expect(themeCss).toMatch(/\.noeis-meander::before\s*\{[^}]*mask-image:/s);
    expect(fs.existsSync(path.join(__dirname, 'library-delight.css'))).toBe(false);
  });

  it('marks the set-aside pile and the feed scroll, not a 2px leaf edge', () => {
    expect(libraryCss).not.toMatch(/Full meander polish is a later pass/);
    expect(libraryCss).not.toMatch(/\.library-feed\s*\{[^}]*border-left:\s*1px solid/s);
    expect(libraryCss).not.toMatch(/\.library-pile__leaf[\s\S]{0,240}border-left:\s*2px/);
  });

  it('replaces the asked-back inset bar with the same meander', () => {
    expect(wikiCss).not.toMatch(
      /\.wiki-front-page__asked-back\s*\{[^}]*box-shadow:\s*inset 2px 0 0 var\(--noeis-living-sap/s
    );
  });
});

describe('Library at 1440, ~1320, and ~430', () => {
  it('holds the two-column shell at the Safari-sidebar width', () => {
    expect(libraryCss).toMatch(/\.library-page-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*208px\)/s);
    expect(libraryCss).toMatch(/@media \(max-width: 1320px\) and \(min-width: 901px\)/);
    expect(libraryCss).toMatch(/@media \(min-width: 1440px\)/);
  });

  it('folds to one column before a phone, and fans Set aside as a sheet at 430', () => {
    expect(libraryCss).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.library-page-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
    );
    expect(libraryCss).toMatch(
      /@media \(max-width: 430px\)[\s\S]*?\.library-pile__sheet\s*\{[^}]*position:\s*fixed/s
    );
  });
});

describe('reduced motion on Library polish', () => {
  it('kills pile stagger, sheet rise, and the warm edge', () => {
    expect(libraryCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.library-pile[\s\S]*?animation:\s*none/s
    );
    expect(libraryCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.library-pile__sheet[\s\S]*?animation:\s*none/s
    );
  });
});
