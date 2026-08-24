import fs from 'fs';
import path from 'path';

describe('stitch editorial CSS tokens', () => {
  // The shell is `height: 100vh; overflow-y: hidden` by default and grants
  // scrolling per page through a `:has()` allowlist. A page missing from that
  // list loses everything below the fold with no way to reach it — verified in
  // production, where window.scrollBy(0, 600) moved zero pixels. Every
  // full-height surface has to be listed, so assert the list rather than trust
  // the next person to remember.
  it('scrolls the shell by default, so a new surface cannot lose its lower half', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    // This used to be an allowlist: the shell clamped to 100vh with overflow
    // hidden and handed scrolling back page by page, so any surface nobody
    // remembered to name lost everything below the fold. Think and Library
    // both did. Scrolling is the default now and a surface opts out of it.
    const base = css.match(/body\.noeis-editorial \.app-shell-new--stitch \.app-shell-new__body \{[\s\S]*?\n\}/)?.[0] || '';
    expect(base).toContain('min-height: 100vh');
    expect(base).toContain('overflow-y: auto');
    expect(base).not.toContain('overflow: hidden');
    // Not min-height — a bare height would clamp it shut again.
    expect(base).not.toMatch(/(^|[^-])\bheight: 100vh/m);
  });

  it('lets only the wiki workspace opt out, because its panes scroll themselves', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    const optOut = css.match(/\.app-shell-new__body:has\(\.wiki-workspace\) \{[\s\S]*?\n\}/)?.[0] || '';
    expect(optOut).toContain('height: 100vh');
    expect(optOut).toContain('overflow: hidden');

    // Nothing else clamps: the old per-page grants are gone rather than
    // sitting there looking load-bearing.
    ['.paper', '.judgment', '.wiki-page'].forEach((page) => {
      expect(css).not.toContain(`.app-shell-new__body:has(${page}) {`);
    });
  });

  it('defines the accent tokens used by interactive trace states in light and dark palettes', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const lightPalette = css.match(/body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';
    const darkPalette = css.match(/html\[data-ui-theme='dark'\] body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';

    expect(lightPalette).toContain('--vellum-cyan:');
    expect(darkPalette).toContain('--vellum-cyan:');
    expect(css).not.toContain('var(--vellum-cyan,');
  });

  it('defines wiki graph semantic tokens in light and dark palettes', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const lightPalette = css.match(/body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';
    const darkPalette = css.match(/html\[data-ui-theme='dark'\] body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';

    [
      '--wiki-graph-node-overview:',
      '--wiki-graph-node-question:',
      '--wiki-graph-edge-shared_source:',
      '--wiki-graph-edge-contradicts:',
      '--wiki-graph-label-backdrop:',
      '--wiki-graph-label-text:',
      '--wiki-graph-node-stroke:'
    ].forEach(token => {
      expect(lightPalette).toContain(token);
      expect(darkPalette).toContain(token);
    });
  });

  it('defines an editorial theme-flip transition with a reduced-motion escape hatch', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('body.noeis-editorial .agent-ticker');
    expect(css).toContain('background-color var(--noeis-motion-base) var(--noeis-ease-standard)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition: none;');
  });

  it('defines concrete magnetic dropzone tokens in light and dark palettes', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const darkPalette = css.match(/html\[data-ui-theme='dark'\] body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';

    [
      '--dropzone-border-idle:',
      '--dropzone-border-active:',
      '--dropzone-border-hover:',
      '--dropzone-surface-idle:',
      '--dropzone-surface-active:',
      '--dropzone-surface-hover:',
      '--dropzone-shadow-hover:',
      '--dropzone-inset-active:',
      '--dropzone-inset-hover:',
      '--dropzone-ink-idle:',
      '--dropzone-ink-hover:',
      '--dropzone-text:',
      '--dropzone-text-quiet:'
    ].forEach(token => {
      expect(css).toContain(token);
      expect(darkPalette).toContain(token);
    });

    expect(css).not.toMatch(/^\s*--dropzone-[^:]+:\s*var\(--dropzone-/m);
  });

  it('keeps settings and connections scrolling on their own document height', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const documentScrollBlock = css.match(/body\.noeis-editorial \.settings-page,[\s\S]*?overflow-y: auto;\n\}/)?.[0] || '';

    expect(documentScrollBlock).toContain('.app-shell-new__body:has(.settings-page)');
    expect(documentScrollBlock).toContain('.app-shell-new__body:has(.integrations-page)');
    expect(documentScrollBlock).toContain('.app-shell-new__body:has(.data-integrations-page)');
    expect(documentScrollBlock).toContain('height: auto;');
    expect(documentScrollBlock).toContain('overflow-y: auto;');
  });

  it('wires editorial magnetic row bloom to --row-bloom vars with reduced-motion off', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('body.noeis-editorial .library-article-row.is-magnetic::before');
    expect(css).toContain('var(--row-bloom-x, 50%) var(--row-bloom-y, 50%)');
    expect(css).toMatch(/library-article-row\.is-magnetic:hover,[\s\S]*?library-article-row\.is-magnetic:focus-within[\s\S]*?transform: translate3d\(4px, -2px, 0\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?library-article-row\.is-magnetic::before/);
    expect(css).not.toContain('.three-pane--library');
  });

  it('keeps mobile editorial chrome compact while preserving essential utility links', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?body\.noeis-editorial \.topbar__content[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?body\.noeis-editorial \.topbar__utility-button:not\(\.topbar__utility-button--essential\)[\s\S]*?display: none !important;/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?body\.noeis-editorial \.app-shell-new--stitch \.app-shell-new__body[\s\S]*?padding-top: 76px;/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?body\.noeis-editorial \.topbar__content[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?body\.noeis-editorial \.topbar__right[\s\S]*?justify-content: space-between;/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?body\.noeis-editorial \.app-shell-new--stitch \.app-shell-new__body[\s\S]*?padding-top: 112px;/);
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.topbar__primary-link:not\(\.is-active\)[\s\S]*?display: none;/);
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.topbar__menu-item--mobile-room[\s\S]*?display: flex;/);
    expect(css).toContain('.topbar__menu-popover--portal');
  });

  it('puts the active Think move before the corpus shelf on single-column layouts', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toMatch(/@media \(max-width: 1120px\)[\s\S]*?think-home-editorial-shell__main \{[\s\S]*?order: 1;/);
    expect(css).toMatch(/@media \(max-width: 1120px\)[\s\S]*?think-home-editorial-shell__left \{[\s\S]*?order: 2;/);
    expect(css).toMatch(/@media \(max-width: 1120px\)[\s\S]*?think-home-editorial-shell__right \{[\s\S]*?order: 3;/);
  });

  it('maps vellum aliases to canonical text role tokens', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const lightPalette = css.match(/body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';
    const darkPalette = css.match(/html\[data-ui-theme='dark'\] body\.noeis-editorial \{[\s\S]*?\n\}/)?.[0] || '';

    expect(lightPalette).toContain('--vellum-ink: var(--text-primary');
    expect(lightPalette).toContain('--vellum-muted: var(--text-secondary');
    expect(lightPalette).toContain('--vellum-subtle: var(--text-muted');
    expect(darkPalette).toContain('--vellum-ink: var(--text-primary)');
    expect(darkPalette).toContain('--vellum-muted: var(--text-secondary)');
    expect(darkPalette).toContain('--vellum-subtle: var(--text-muted)');
    expect(css).not.toContain('--vellum-blue');
  });

  it('promotes wiki workspace destinations into a secondary nav block', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-front-page.css'), 'utf8');

    expect(css).toContain('.wiki-front-page__secondary-nav');
    expect(css).not.toContain('.wiki-front-page__hairline');
  });

  it('aligns wiki facet rail and list rows with library cabinet grammar', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('body.noeis-editorial .wiki-facet-rail.library-cabinet');
    expect(css).toContain('body.noeis-editorial .wiki-index__list.library-article-list');
    expect(css).toContain('body.noeis-editorial .wiki-index__list .library-article-row:last-child');
    expect(css).not.toContain('body.noeis-editorial .wiki-facet-rail--deep');
    expect(css).toMatch(/@media \(max-width: 960px\)[\s\S]*?wiki-index__faceted-main[\s\S]*?order: 2;/);
  });

  it('keeps library and wiki index rows out of the legacy card cascade', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('body.noeis-editorial .library-page-shell .library-article-row,');
    expect(css).toContain('body.noeis-editorial .wiki-index__list .library-article-row {');
    expect(css).toMatch(/library-page-shell \.library-article-row,[\s\S]*?wiki-index__list \.library-article-row \{[\s\S]*?border-radius: 0 !important;/);
    expect(css).toMatch(/library-page-shell \.library-article-row,[\s\S]*?wiki-index__list \.library-article-row \{[\s\S]*?background: transparent !important;/);
    expect(css).toMatch(/library-page-shell \.library-article-row,[\s\S]*?wiki-index__list \.library-article-row \{[\s\S]*?box-shadow: none !important;/);
    expect(css).toMatch(/library-page-shell \.library-article-row-title,[\s\S]*?wiki-index__list \.library-article-row-title \{[\s\S]*?font-size: clamp\(1\.2rem, 1\.35vw, 1\.46rem\) !important;/);
  });

  it('styles connection cards with grayscale-safe state hierarchy', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('connections-return-loop__feed--connected');
    expect(css).toContain('connections-return-loop__feed--warning');
    expect(css).toContain('import-source-card--connected');
    expect(css).toContain('import-source-card--warning');
  });

  it('keeps connection statuses from breaking mid-word on narrow cards', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('body.noeis-editorial .connections-return-loop__feed strong');
    expect(css).toMatch(/connections-return-loop__feed strong,[\s\S]*?overflow-wrap: normal;/);
    expect(css).toMatch(/connections-return-loop__feed p,[\s\S]*?overflow-wrap: break-word;/);
  });
});
