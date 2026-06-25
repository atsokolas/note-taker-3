import fs from 'fs';
import path from 'path';

describe('stitch editorial CSS tokens', () => {
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
    expect(css).toContain('background-color 260ms cubic-bezier(0.2, 0.8, 0.2, 1)');
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

  it('lets settings and connection pages scroll inside the editorial shell', () => {
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
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?library-article-row\.is-magnetic::before/);
    expect(css).not.toContain('.three-pane--library .library-article-row::before');
  });

  it('keeps mobile editorial chrome compact and moves utility links behind More', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?body\.noeis-editorial \.topbar__content[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?body\.noeis-editorial \.topbar__utility-button[\s\S]*?display: none !important;/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?body\.noeis-editorial \.app-shell-new--stitch \.app-shell-new__body[\s\S]*?padding-top: 76px;/);
  });

  it('keeps connection statuses from breaking mid-word on narrow cards', () => {
    const css = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(css).toContain('body.noeis-editorial .connections-return-loop__feed strong');
    expect(css).toMatch(/connections-return-loop__feed strong,[\s\S]*?overflow-wrap: normal;/);
    expect(css).toMatch(/connections-return-loop__feed p,[\s\S]*?overflow-wrap: break-word;/);
  });
});
