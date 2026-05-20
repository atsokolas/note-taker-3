import fs from 'fs';
import path from 'path';

const srcRoot = path.resolve(__dirname, '..');

describe('wiki critical CSS loading', () => {
  it('keeps the wiki critical stylesheet under the first-paint budget', () => {
    const cssPath = path.join(__dirname, 'wiki-critical.css');
    const cssBytes = fs.statSync(cssPath).size;

    expect(cssBytes).toBeLessThan(30 * 1024);
  });

  it('defers the full polish stylesheet out of the root CSS bundle', () => {
    const appSource = fs.readFileSync(path.join(srcRoot, 'App.js'), 'utf8');

    expect(appSource).not.toMatch(/import\s+['"]\.\/styles\/think-home-polish\.css['"]/);
    expect(appSource).toContain("import('./styles/think-home-polish.css')");
  });

  it('loads critical wiki CSS from both wiki route entrypoints', () => {
    const wikiRoute = fs.readFileSync(path.join(srcRoot, 'pages', 'Wiki.jsx'), 'utf8');
    const wikiProductIndex = fs.readFileSync(path.join(srcRoot, 'components', 'wiki', 'WikiProductIndex.jsx'), 'utf8');

    expect(wikiRoute).toContain("import '../styles/wiki-critical.css'");
    expect(wikiProductIndex).toContain("import '../../styles/wiki-critical.css'");
  });
});
