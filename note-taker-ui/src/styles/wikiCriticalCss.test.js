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

  it('keeps the mobile wiki reader article-first with a readable measure', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const polishCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');
    const tabletBlock = css.match(/@media \(max-width: 980px\) \{[\s\S]*?@media \(max-width: 1280px\)/)?.[0] || '';
    const mobileBlock = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\.wiki-workspace__resizer[\s\S]*?\n\}/)?.[0] || '';

    expect(tabletBlock).toContain('.wiki-read__article');
    expect(tabletBlock).toContain('order: 1');
    expect(mobileBlock).toContain('width: min(100% - 24px, 720px)');
    expect(mobileBlock).toContain('.wiki-workspace .wiki-read__layout');
    expect(mobileBlock).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(mobileBlock).toContain('font-size: 3em');
    expect(polishCss).not.toContain('minmax(64px, 72px) minmax(0, 1fr) minmax(104px, 120px)');
  });

  it('darkens long-form wiki body text independent of the softer UI token', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const readBlock = css.match(/\.wiki-read \{[\s\S]*?\n\}/)?.[0] || '';
    const bodyBlock = css.match(/\.wiki-read__body \{[\s\S]*?\n\}/)?.[0] || '';

    expect(readBlock).toContain('--wiki-reading-ink: #3f3a34');
    expect(bodyBlock).toContain('color: var(--wiki-reading-ink)');
  });

  it('keeps desktop citation marginalia inside the reader grid instead of beyond the viewport', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const desktopBlock = css.match(/@media \(min-width: 1280px\) \{[\s\S]*?\.wiki-read__margin-note \{/)?.[0] || '';

    expect(desktopBlock).toContain('.wiki-read__article-panel');
    expect(desktopBlock).toContain('grid-template-columns: minmax(0, 1fr) 184px');
    expect(desktopBlock).toContain('position: sticky');
    expect(desktopBlock).not.toContain('left: calc(100% + 24px)');
  });

  it('guards the living-agent composer breathing border primitives', () => {
    const polishCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');

    expect(polishCss).toContain('@property --composer-angle');
    expect(polishCss).toContain("syntax: '<angle>'");
    expect(polishCss).toContain('initial-value: 0deg');
    expect(polishCss).toContain('.wiki-workspace-chat__composer-field::before');
    expect(polishCss).toContain('conic-gradient(');
    expect(polishCss).toContain('animation: composer-breathe 7s linear infinite');
    expect(polishCss).toContain(".wiki-workspace-chat__composer[data-streaming='true'] .wiki-workspace-chat__composer-field::before");
    expect(polishCss).toContain('animation-duration: 2.2s');
    expect(polishCss).toContain('@keyframes composer-breathe');
    expect(polishCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(polishCss).toContain('animation: none');
  });

  it('guards animated tabular rail metrics for the editorial reader', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const polishCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');

    expect(css).toContain('.wiki-numeric-value');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(polishCss).toContain('.wiki-numeric-value.is-counting');
    expect(polishCss).toContain('@keyframes wikiMetricCountPulse');
    expect(polishCss).toContain('.wiki-numeric-value.is-counting');
  });

  it('guards AT-291 tap-target floors for wiki reader and agent controls', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const polishCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');
    const pageActionsBlock = css.match(/\.wiki-index__page-more,[\s\S]*?\.wiki-index__page-menu/)?.[0] || '';
    const tabBlock = css.match(/\.wiki-read__tabs button \{[\s\S]*?\n\}/)?.[0] || '';
    const finalTapFloorBlock = polishCss.match(/\/\* AT-291: final tap-target floor[\s\S]*?button\[type='submit'\] \{[\s\S]*?\n\}/)?.[0] || '';

    expect(pageActionsBlock).toContain('min-height: 44px');
    expect(pageActionsBlock).toContain('min-width: 44px');
    expect(tabBlock).toContain('min-height: 44px');
    expect(tabBlock).toContain('min-width: 44px');
    expect(finalTapFloorBlock).toContain('.wiki-workspace-chat__build-button');
    expect(finalTapFloorBlock).toContain('.wiki-workspace-chat__send');
    expect(finalTapFloorBlock).toContain('.wiki-ask-composer__suggestion');
    expect(finalTapFloorBlock).toContain('min-height: 44px');
    expect(finalTapFloorBlock).toContain('min-width: 44px');
  });

  it('keeps the wiki/editorial style layer off Inter font loading', () => {
    const blocked = ['In', 'ter'].join('');
    const styleFiles = [
      path.join(__dirname, 'global.css'),
      path.join(__dirname, 'wiki-critical.css'),
      path.join(__dirname, 'think-home-polish.css'),
      path.join(srcRoot, 'index.css'),
      path.join(srcRoot, 'App.css')
    ];

    const matches = styleFiles
      .filter(filePath => fs.existsSync(filePath))
      .filter(filePath => fs.readFileSync(filePath, 'utf8').includes(blocked))
      .map(filePath => path.relative(srcRoot, filePath));

    expect(matches).toEqual([]);
  });

  it('guards the workspace reader against the old crushed 464px article column', () => {
    const polishCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');

    expect(polishCss).toContain('container-name: wikiread');
    expect(polishCss).toContain('@container wikiread (max-width: 1200px)');
    expect(polishCss).toContain('.wiki-workspace .wiki-read__layout--rail-collapsed');
    expect(polishCss).toContain('grid-template-columns: minmax(82px, 96px) minmax(0, 1fr) 34px');
    expect(polishCss).not.toContain('grid-template-columns: 200px 464px 300px');
  });
});
