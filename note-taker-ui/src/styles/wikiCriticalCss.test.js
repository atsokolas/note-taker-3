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

  it('does not collapse the wiki workspace before the mobile tab breakpoint', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const tabletBlock = css.match(/@media \(max-width: 980px\) \{[\s\S]*?\n\}/)?.[0] || '';
    const mobileBlock = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\.wiki-workspace__resizer[\s\S]*?\n\}/)?.[0] || '';

    expect(tabletBlock).not.toContain('.wiki-workspace');
    expect(mobileBlock).toContain('.wiki-workspace');
    expect(mobileBlock).toContain('.wiki-workspace__mobile-tabs');
    expect(mobileBlock).toContain('.wiki-workspace__pane--inactive');
  });

  it('keeps desktop wiki workspace scrolling inside panes', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const workspaceBlock = css.match(/\.wiki-workspace \{[\s\S]*?\n\}/)?.[0] || '';
    const rightPaneBlocks = Array.from(css.matchAll(/\.wiki-workspace__right-pane \{[\s\S]*?\n\}/g))
      .map(match => match[0]);

    expect(workspaceBlock).toContain('height: calc(100dvh - 96px)');
    expect(workspaceBlock).toContain('overflow: hidden');
    expect(rightPaneBlocks.some(block => block.includes('overflow: auto'))).toBe(true);
  });
});
