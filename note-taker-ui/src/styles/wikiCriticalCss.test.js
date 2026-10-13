import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const srcRoot = path.resolve(__dirname, '..');

describe('wiki critical CSS loading', () => {
  /* This guard exists so nobody quietly drops a stylesheet into the first
     paint. It was measuring raw source bytes, which counts indentation and
     line breaks — formatting the browser never receives. The sheet crossed
     32KB of source while the thing it is guarding, what actually goes over the
     wire, is under 6KB compressed.

     Measure the cost, not the formatting. The budget is deliberately close to
     today's number: a real regression trips it, reflowing the file does not. */
  it('keeps the wiki critical stylesheet under the first-paint budget', () => {
    const cssPath = path.join(__dirname, 'wiki-critical.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const transferred = zlib.gzipSync(css).length;

    expect(transferred).toBeLessThan(8 * 1024);
  });

  it('defers the full wiki stylesheet out of the root CSS bundle', () => {
    const appSource = fs.readFileSync(path.join(srcRoot, 'App.js'), 'utf8');

    expect(appSource).not.toMatch(/import\s+['"]\.\/styles\/wiki\.css['"]/);
    expect(appSource).toContain("import('./styles/wiki.css')");
  });

  it('loads critical wiki CSS from every wiki route entrypoint', () => {
    // WikiProductIndex was the second entrypoint. It duplicated the morning
    // paper and was removed, so the front page takes its place here.
    const wikiRoute = fs.readFileSync(path.join(srcRoot, 'pages', 'Wiki.jsx'), 'utf8');
    const wikiFrontPage = fs.readFileSync(path.join(srcRoot, 'components', 'wiki', 'WikiFrontPage.jsx'), 'utf8');

    expect(wikiRoute).toContain("import '../styles/wiki-critical.css'");
    expect(wikiFrontPage).toContain("import '../../styles/wiki-critical.css'");
  });

  it('keeps the workspace one canvas, releasing pane scrolling only on mobile', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');
    const workspaceBlock = css.match(/\.wiki-workspace \{[\s\S]*?\n\}/)?.[0] || '';
    const tabletBlock = css.match(/@media \(max-width: 980px\) \{[\s\S]*?\n\}/)?.[0] || '';
    const mobileBlock = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\.wiki-workspace__right-pane \{[\s\S]*?\n\}/)?.[0] || '';

    expect(workspaceBlock).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(tabletBlock).not.toContain('.wiki-workspace');
    expect(mobileBlock).toContain('display: block');
    [css, wikiCss].forEach(source => expect(source).not.toContain('wiki-workspace-chat'));
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
    const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');
    const tabletBlock = css.match(/@media \(max-width: 980px\) \{[\s\S]*?@media \(max-width: 1280px\)/)?.[0] || '';
    const mobileBlock = css.match(/@media \(max-width: 720px\) \{[\s\S]*?\.wiki-workspace__right-pane \{[\s\S]*?\n\}/)?.[0] || '';

    expect(tabletBlock).toContain('.wiki-read__article');
    expect(tabletBlock).toContain('order: 1');
    expect(mobileBlock).toContain('width: min(100% - 24px, 720px)');
    expect(mobileBlock).toContain('.wiki-workspace .wiki-read__layout');
    expect(mobileBlock).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(mobileBlock).toContain('font-size: 3em');
    expect(wikiCss).not.toContain('minmax(64px, 72px) minmax(0, 1fr) minmax(104px, 120px)');
  });

  it('darkens long-form wiki body text independent of the softer UI token', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const readBlock = css.match(/\.wiki-read \{[\s\S]*?\n\}/)?.[0] || '';
    const bodyBlock = css.match(/\.wiki-read__body \{[\s\S]*?\n\}/)?.[0] || '';

    expect(readBlock).toContain('--wiki-reading-ink: #3f3a34');
    expect(bodyBlock).toContain('color: var(--wiki-reading-ink)');
  });

  it('shows citation marginalia only when the reader itself has room for it', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');
    const readBlock = css.match(/\.wiki-read \{[\s\S]*?\n\}/)?.[0] || '';
    const desktopBlock = css.match(/@container wikiread \(min-width: 1120px\) \{[\s\S]*?\.wiki-read__margin-note \{/)?.[0] || '';

    expect(readBlock).toContain('container: wikiread / inline-size');
    expect(desktopBlock).toContain('.wiki-read__article-panel');
    expect(desktopBlock).toContain('grid-template-columns: minmax(0, 1fr) 184px');
    expect(desktopBlock).toContain('position: sticky');
    expect(desktopBlock).not.toContain('left: calc(100% + 24px)');
    expect(css).not.toMatch(/@media \(min-width: 1280px\) \{[\s\S]*?\.wiki-read__marginalia/);
    expect(wikiCss).not.toMatch(/@media \(min-width: 1280px\) \{[\s\S]*?\.wiki-read__marginalia/);
    expect(wikiCss).not.toContain('left: calc(100% + 24px)');
  });

  it('guards animated tabular rail metrics for the editorial reader', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');

    expect(css).toContain('.wiki-numeric-value');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(wikiCss).toContain('.wiki-numeric-value.is-counting');
    expect(wikiCss).toContain('@keyframes wikiMetricCountPulse');
    expect(wikiCss).toContain('.wiki-numeric-value.is-counting');
  });

  it('guards AT-291 tap-target floors for wiki reader controls', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');
    const pageActionsBlock = css.match(/\.wiki-index__page-more,[\s\S]*?\.wiki-index__page-menu/)?.[0] || '';
    const tabBlock = css.match(/\.wiki-read__actions button \{[\s\S]*?\n\}/)?.[0] || '';
    const finalTapFloorBlock = wikiCss.match(/\/\* AT-291: final tap-target floor[\s\S]*?\n\}/)?.[0] || '';

    expect(pageActionsBlock).toContain('min-height: 44px');
    expect(pageActionsBlock).toContain('min-width: 44px');
    expect(tabBlock).toContain('min-height: 44px');
    expect(tabBlock).toContain('min-width: 44px');
    expect(finalTapFloorBlock).toContain('.wiki-index__page-more');
    expect(finalTapFloorBlock).toContain('min-height: 44px');
    expect(finalTapFloorBlock).toContain('min-width: 44px');
  });

  it('keeps the wiki/editorial style layer off Inter font loading', () => {
    const blocked = ['In', 'ter'].join('');
    const styleFiles = [
      path.join(__dirname, 'global.css'),
      path.join(__dirname, 'wiki-critical.css'),
      path.join(__dirname, 'wiki.css'),
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
    const wikiCss = fs.readFileSync(path.join(__dirname, 'wiki.css'), 'utf8');
    const workspaceCss = fs.readFileSync(path.join(__dirname, 'wiki-workspace-column.css'), 'utf8');

    expect(wikiCss).toContain('container-name: wikiread');
    expect(workspaceCss).toContain('@container wikiread (max-width: 1280px)');
    expect(workspaceCss).toContain('body.noeis-editorial .wiki-workspace .wiki-read .wiki-read__layout--rail-collapsed');
    expect(workspaceCss).toContain('grid-template-columns: minmax(164px, 200px) minmax(0, 1fr)');
    expect(workspaceCss).toContain('grid-column: 2');
    expect(workspaceCss).not.toContain('grid-template-columns: 200px 464px 300px');
    expect(wikiCss).not.toContain('AT-295');
  });
});
