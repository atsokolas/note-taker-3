import fs from 'fs';
import path from 'path';

describe('app theme design-system tokens', () => {
  it('defines one versioned semantic package for shell palette, type, spacing, controls, and motion', () => {
    const css = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');
    const rootBlock = css.match(/:root,[\s\S]*?\n\}/)?.[0] || '';

    [
      '--noeis-canvas:',
      '--noeis-paper:',
      '--noeis-thread:',
      '--noeis-font-ui:',
      '--noeis-font-reading:',
      '--noeis-space-4:',
      '--noeis-control-height:',
      '--noeis-motion-base:'
    ].forEach(token => {
      expect(rootBlock).toContain(token);
    });
    expect(css).toContain("html[data-noeis-theme='theme.editorial.dark']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('uses a warm near-black dark palette instead of the old cold blue shell', () => {
    const css = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');
    const darkBlock = css.match(/html\[data-noeis-theme='theme\.editorial\.dark'\] \{[\s\S]*?\n\}/)?.[0] || '';

    expect(darkBlock).toContain('--noeis-canvas: #16140f');
    expect(darkBlock).toContain('--noeis-paper: #211e17');
    expect(darkBlock).toContain('--noeis-paper-sunken: #100f0c');
    expect(darkBlock).not.toContain('#0a0e17');
    expect(darkBlock).not.toContain('#0b1220');
    expect(darkBlock).not.toContain('#111a2a');
    expect(darkBlock).not.toContain('#141a26');
  });

  it('removes superseded token and rebrand layers instead of retaining dead theme authorities', () => {
    const globalCss = fs.readFileSync(path.join(__dirname, 'global.css'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '..', 'App.css'), 'utf8');
    const appEntry = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

    expect(globalCss).not.toMatch(/^:root/m);
    expect(appCss).not.toMatch(/^:root/m);
    expect(appEntry).toContain("import './styles/semantic-theme.css';");
    expect(appEntry).not.toContain("import './styles/tokens.css';");
    expect(fs.existsSync(path.join(__dirname, 'tokens.css'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, 'noeis-rebrand.css'))).toBe(false);
  });

  it('keeps lazy Think styling from taking ownership of the shell theme', () => {
    const thinkCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');
    const dashboardCss = fs.readFileSync(path.join(__dirname, 'dashboard-refresh.css'), 'utf8');

    expect(thinkCss.slice(0, 1600)).toContain('consume the shared semantic shell package');
    expect(thinkCss.slice(0, 1600)).not.toContain('--noeis-canvas:');
    expect(thinkCss).not.toMatch(/\.app-shell-new\s*\{[^}]*background:/);
    expect(thinkCss).not.toMatch(/\.topbar\s*\{[^}]*background:/);
    expect(dashboardCss).not.toMatch(/^:root/m);
  });

  it('defines canonical editorial text role tokens in light and dark palettes', () => {
    const css = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');
    const rootBlock = css.match(/:root,[\s\S]*?\n\}/)?.[0] || '';
    const darkBlock = css.match(/html\[data-noeis-theme='theme\.editorial\.dark'\] \{[\s\S]*?\n\}/)?.[0] || '';

    [
      '--text-primary:',
      '--text-secondary:',
      '--text-muted:',
      '--text-link:',
      '--text-on-accent:',
      '--surface-border:'
    ].forEach((token) => {
      expect(rootBlock).toContain(token);
    });
    expect(darkBlock).toContain('--text-on-accent:');
  });

  it('rejects known cool palette literals from editorial dashboard dark tokens', () => {
    const semanticCss = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');
    const editorialCss = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const wikiFrontCss = fs.readFileSync(path.join(__dirname, 'wiki-front-page.css'), 'utf8');

    expect(semanticCss).not.toContain('#9eb0cf');
    expect(semanticCss).not.toContain('rgba(96, 118, 153');
    expect(editorialCss).not.toContain('--vellum-blue');
    expect(wikiFrontCss).not.toContain('#0d1422');
  });

  it('pins the wiki front page dark surface to the warm editorial palette', () => {
    const css = fs.readFileSync(path.join(__dirname, 'wiki-front-page.css'), 'utf8');
    const editorialCss = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    const semanticCss = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');

    expect(css).toContain("html[data-ui-theme='dark'] body.noeis-editorial.wiki-front-page-route");
    expect(css).toContain('background: var(--vellum-bg, var(--noeis-canvas)) !important');
    expect(css).toContain("html[data-ui-theme='dark'] body.noeis-editorial .wiki-front-page");
    expect(css).not.toContain('#0d1422');
    expect(semanticCss).not.toContain('#0d1422');
    expect(semanticCss).not.toContain('#9eb0cf');
    expect(semanticCss).not.toContain('rgba(96, 118, 153');
    expect(semanticCss).toMatch(/html\[data-noeis-theme='theme\.editorial\.dark'\] \{[\s\S]*--noeis-canvas: #16140f;/);
    expect(editorialCss).toMatch(/html\[data-ui-theme='dark'\] body\.noeis-editorial \{[\s\S]*background: var\(--vellum-bg\) !important;/);
  });

  it('keeps the mobile room label from colliding with shell controls', () => {
    const css = fs.readFileSync(path.join(__dirname, 'semantic-theme.css'), 'utf8');

    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.topbar__primary-link:not\(\.is-active\) \{[\s\S]*display: none;/);
  });

  it('keeps collapsed wiki and concept rails inside their grid tracks', () => {
    const wikiCriticalCss = fs.readFileSync(path.join(__dirname, 'wiki-critical.css'), 'utf8');
    const thinkHomePolishCss = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');
    const editorialCss = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');

    expect(wikiCriticalCss).toContain('grid-template-columns: minmax(160px, 220px) minmax(0, 860px) 48px;');
    expect(wikiCriticalCss).toContain('grid-template-columns: minmax(128px, 180px) minmax(0, 1fr) 48px;');
    expect(wikiCriticalCss).toMatch(/\.wiki-read__rail-toggle--show \{[\s\S]*box-sizing: border-box;[\s\S]*max-width: 100%;/);
    expect(thinkHomePolishCss).toContain('grid-template-columns: minmax(160px, 220px) minmax(0, 860px) 48px;');
    expect(thinkHomePolishCss).toContain('grid-template-columns: minmax(120px, 160px) minmax(0, 1fr) 48px;');
    expect(thinkHomePolishCss).toContain('grid-template-columns: minmax(128px, 180px) minmax(0, 1fr) 48px;');
    expect(thinkHomePolishCss).toMatch(/\.wiki-read__rail-toggle--show \{[\s\S]*box-sizing: border-box;[\s\S]*max-width: 100%;/);
    /* The thing this test is named for. A fourth literal used to be asserted
       here — the 82/96 collapsed rail — and it was removed in a redesign,
       which turned a guard about crushed columns into a guard about one
       snapshot of the design. The columns above still exist and still document
       real breakpoints; what actually protects the reader is that no track
       gets crushed, so that is checked everywhere rather than in one file. */
    [wikiCriticalCss, thinkHomePolishCss, editorialCss].forEach((sheet) => {
      expect(sheet).not.toMatch(/grid-template-columns: minmax\([^;]+\) minmax\([^;]+\) 3[0-9]px;/);
    });
    expect(editorialCss).toMatch(/\.concept-editorial-shell__partner,[\s\S]*\.concept-editorial-shell__stream \{[\s\S]*box-sizing: border-box;/);
    expect(editorialCss).toMatch(/\.concept-editorial-partner \{[\s\S]*box-sizing: border-box;/);
  });

  it('pins the alive composer and presence motion to reduced-motion-safe primitives', () => {
    const css = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');

    expect(css).toContain('@property --composer-angle');
    expect(css).toContain('animation: composer-breathe 7s linear infinite;');
    expect(css).toContain('animation: wikiWorkspacePresenceBreathe 4s ease-in-out infinite;');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.wiki-workspace-chat__composer-field::before {\n    animation: none;');
    expect(css).toContain('.wiki-workspace-chat__presence-dot,\n  .wiki-workspace-chat__presence-dot::after');
    expect(css).toContain('animation: none !important;');
  });
});
