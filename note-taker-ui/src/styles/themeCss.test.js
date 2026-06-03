import fs from 'fs';
import path from 'path';

describe('app theme design-system tokens', () => {
  it('defines the semantic surface tokens used by the architecture and motion specs', () => {
    const css = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8');
    const rootBlock = css.match(/:root \{[\s\S]*?\n\}/)?.[0] || '';
    const darkBlock = css.match(/html\[data-ui-theme='dark'\] \{[\s\S]*?\n\}/)?.[0] || '';

    [
      '--canvas:',
      '--raised:',
      '--sunken:',
      '--spark:',
      '--reading-text:',
      '--working-text:',
      '--theme-transition:'
    ].forEach(token => {
      expect(rootBlock).toContain(token);
      expect(darkBlock).toContain(token);
    });
  });

  it('uses a warm near-black dark palette instead of the old cold blue shell', () => {
    const css = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8');
    const darkBlock = css.match(/html\[data-ui-theme='dark'\] \{[\s\S]*?\n\}/)?.[0] || '';

    expect(darkBlock).toContain('--canvas: #16140f');
    expect(darkBlock).toContain('--raised: #211e17');
    expect(darkBlock).toContain('--sunken: #100f0c');
    expect(darkBlock).not.toContain('#0a0e17');
    expect(darkBlock).not.toContain('#0b1220');
    expect(darkBlock).not.toContain('#111a2a');
    expect(darkBlock).not.toContain('#141a26');
  });

  it('keeps global and app CSS aliases attached to semantic tokens in dark mode', () => {
    const globalCss = fs.readFileSync(path.join(__dirname, 'global.css'), 'utf8');
    const appCss = fs.readFileSync(path.join(__dirname, '..', 'App.css'), 'utf8');
    const globalDarkBlock = globalCss.match(/html\[data-ui-theme='dark'\] \{[\s\S]*?\n\}/)?.[0] || '';
    const appDarkBlock = appCss.match(/html\[data-ui-theme='dark'\] \{[\s\S]*?\n\}/)?.[0] || '';

    expect(globalDarkBlock).toContain('var(--reading-text');
    expect(globalDarkBlock).toContain('var(--working-text');
    expect(appDarkBlock).toContain('var(--canvas');
    expect(appDarkBlock).toContain('var(--raised');
    expect(appDarkBlock).toContain('var(--spark');
    expect(appDarkBlock).not.toContain('#0f172a');
    expect(appDarkBlock).not.toContain('#111827');
  });

  it('keeps the Think/Wiki polish layer on the shared semantic palette', () => {
    const css = fs.readFileSync(path.join(__dirname, 'think-home-polish.css'), 'utf8');
    const topBlocks = css.slice(0, 1600);

    expect(topBlocks).toContain('--nt-app-bg: var(--canvas');
    expect(topBlocks).toContain('--nt-surface-1: var(--raised');
    expect(topBlocks).toContain('--nt-surface-2: var(--sunken');
    expect(topBlocks).toContain('--nt-divider: var(--hairline');
    expect(topBlocks).toContain('var(--spark');
    expect(topBlocks).not.toContain('#0a1020');
    expect(topBlocks).not.toContain('rgba(19, 28, 46');
    expect(topBlocks).not.toContain('rgba(16, 24, 40');
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
