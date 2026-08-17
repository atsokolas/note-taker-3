import fs from 'fs';
import path from 'path';

/* A route that is still arriving is not an event. The wiki and judgment routes
   used to raise a full-viewport splash — an eyebrow, a 3.4rem serif headline,
   and a shimmering bar — announcing that the workspace was being prepared.
   Held for a few seconds it read as the product's slowest moment dressed as
   its grandest. */
describe('the route loading fallback', () => {
  const app = () => fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const css = () => fs.readFileSync(path.join(__dirname, '..', 'App.css'), 'utf8');

  it('does not announce that anything is being prepared', () => {
    expect(app()).not.toContain('Preparing the wiki workspace');
    expect(app()).not.toContain('Preparing the living casebook');
    expect(app()).not.toContain('page-loading--wiki');
    expect(css()).not.toContain('page-loading--wiki');
  });

  it('draws nothing until the wait is long enough to be worth admitting', () => {
    const rule = css().match(/\.page-loading__word \{[\s\S]*?\n\}/)?.[0] || '';
    expect(rule).toMatch(/opacity:\s*0/);
    expect(rule).toMatch(/animation:[^;]*\b\d{3,}ms\b[^;]*forwards/);
  });

  it('keeps home out of the code-split routes, because it is needed every time', () => {
    expect(app()).toMatch(/^import WikiFrontPage from '\.\/components\/wiki\/WikiFrontPage';$/m);
    expect(app()).not.toMatch(/lazy\(\(\) => import\('\.\/components\/wiki\/WikiFrontPage'\)\)/);
  });
});
