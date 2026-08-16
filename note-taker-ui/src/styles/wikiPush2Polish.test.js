import fs from 'fs';
import path from 'path';

const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('wiki push-2 polish CSS', () => {
  it('caps wiki read body measure at ~68ch without changing font size', () => {
    const critical = readCss('wiki-critical.css');
    const polish = readCss('think-home-polish.css');

    expect(critical).toMatch(/\.wiki-read__body\s*\{[\s\S]*?max-width:\s*68ch;/);
    expect(critical).toMatch(/\.wiki-read__references\s*\{[\s\S]*?max-width:\s*68ch;/);
    expect(polish).toMatch(/\.wiki-read__body\s*\{[\s\S]*?max-width:\s*68ch;/);
    expect(critical).toMatch(/\.wiki-read__body\s*\{[\s\S]*?font-size:\s*1\.12rem;/);
  });

  it('widens the front-page build composer at 1280 and 1440', () => {
    const css = readCss('wiki-front-page.css');

    expect(css).toContain('.wiki-front-page__composer .wiki-build-page__row input');
    expect(css).toMatch(/@media \(min-width:\s*1280px\)[\s\S]*?max-width:\s*min\(100%,\s*720px\)/);
    expect(css).toMatch(/@media \(min-width:\s*1440px\)[\s\S]*?max-width:\s*min\(100%,\s*760px\)/);
  });

  it('renders a warm, static knowledge-graph motif without ambient drift', () => {
    const css = readCss('wiki-front-page.css');

    expect(css).toContain('.wiki-front-page__graph-motif');
    expect(css).toContain('.wiki-front-page__graph-motif-edges line');
    expect(css).toContain('var(--wiki-warm-accent');
    expect(css).toContain('body.noeis-editorial.wiki-front-page-route .brand-gradient');
    expect(css).toContain('mask-image:');
    expect(css).not.toContain('animation: wfp-graph-drift');
    expect(css).not.toContain('@keyframes wfp-graph-drift');
  });

  it('keeps front-page motion short, pointer-gated, and accessibility-aware', () => {
    const css = readCss('wiki-front-page.css');

    expect(css).toContain('animation: wfp-enter 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards;');
    // The paper is one column now, so the expanding watcher list that carried
    // `transform-origin: top left` is gone. A return to the paper crossfades
    // rather than re-staggering, which is the motion that replaced it.
    expect(css).toContain('.wiki-front-page__return');
    expect(css).toContain('animation: wfp-materialize 180ms cubic-bezier(0.16, 1, 0.3, 1);');
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)');
    expect(css).not.toContain('animation: wfp-breathe');
  });
});
