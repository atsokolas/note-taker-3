import fs from 'fs';
import path from 'path';

describe('Think writing focus mode', () => {
  const css = fs.readFileSync(path.join(__dirname, 'think-writing.css'), 'utf8');

  it('retreats both rails into named handles while writing', () => {
    expect(css).toContain('grid-template-columns: 220px minmax(420px, 1fr) 280px;');
    expect(css).toContain('grid-template-columns: 30px minmax(420px, 1fr) 30px;');
    expect(css).toContain("content: attr(data-writing-rail-label);");
    expect(css).toContain("[data-writing-rail='left']:is(:hover, :focus-within)");
    expect(css).toContain("[data-writing-rail='right']:is(:hover, :focus-within)");
  });

  it('uses one shared push for typing and held focus', () => {
    expect(css).toContain('--think-rail-push: var(--noeis-motion-deliberate, 320ms) var(--noeis-ease-standard, cubic-bezier(0.2, 0.8, 0.2, 1));');
    expect(css).toMatch(/grid-template-columns var\(--think-rail-push\)/);
    expect(css).toMatch(/\[data-writing-rail\] > \*[\s\S]*?transition: opacity var\(--think-rail-push\)/);
    expect(css).toContain('body:is(.think-rails-away, .think-focus-held) [data-writing-rail] > *');
    expect(css).toContain('min-width: var(--think-rail-rest);');
    expect(css).toContain('overflow-x: hidden;');
    expect(css).toContain('body.noeis-editorial .think-home-editorial-shell');
    expect(css).toContain('body.noeis-editorial .concept-index-editorial-shell');
    expect(css).not.toMatch(/transition-delay:\s*48ms/);
    expect(css).not.toContain('--think-rail-retreat');
    expect(css).not.toMatch(/opacity 680ms/);
    expect(css).not.toMatch(/opacity 540ms/);
    expect(css).not.toMatch(/grid-template-columns 720ms/);
  });

  it('keeps leave-focus on the same interpolable properties as enter', () => {
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    expect(css).toMatch(/\[data-writing-rail\]::after[\s\S]*?content: attr\(data-writing-rail-label\);/);
    expect(css).not.toContain('body:is(.think-rails-away, .think-focus-held) .think-notes__note');
    const collapsedRail = css.match(/body:is\(\.think-rails-away, \.think-focus-held\) \[data-writing-rail\] \{[^}]+\}/);
    expect(collapsedRail?.[0]).toContain('cursor: pointer');
    expect(collapsedRail?.[0]).not.toMatch(/position:\s*relative/);
    expect(collapsedRail?.[0]).not.toMatch(/overflow-y:\s*hidden/);
    expect(css).toContain('.think-notes__shelf [data-writing-rail]');
    expect(css).not.toMatch(/\.think-notes \[data-writing-rail\] \{\s*position:\s*relative;/);
    const notes = fs.readFileSync(path.join(__dirname, 'think-notes.css'), 'utf8');
    expect(notes).toMatch(/\.think-notes__partner \{[\s\S]*?position:\s*sticky;/);
  });

  it('outranks stitch-editorial resting columns so focus can close the rails', () => {
    expect(css).toContain('body.noeis-editorial:is(.think-rails-away, .think-focus-held) .notebook-editorial-shell');
    expect(css).toContain('body.noeis-editorial:is(.think-rails-away, .think-focus-held) .think-home-editorial-shell');
    expect(css).toContain('body.noeis-editorial:is(.think-rails-away, .think-focus-held) .concept-index-editorial-shell');
    const stitch = fs.readFileSync(path.join(__dirname, 'stitch-editorial.css'), 'utf8');
    expect(stitch).toContain('grid-template-columns: 250px minmax(0, 1fr) 300px;');
    expect(stitch).toContain('grid-template-columns: 260px minmax(0, 1fr) 320px;');
  });

  it('keeps notebook arrangement as a hover bar on the current passage', () => {
    expect(css).toContain('.notebook-arrangement {');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('transform: translateY(calc(-100% - 6px));');
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(css).toContain('animation: notebook-arrangement-in');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.notebook-arrangement,[\s\S]*animation: none !important;/);
    expect(css).not.toContain('.notebook-arrangement__kicker');
    expect(css).not.toContain('.notebook-arrangement__pieces');
    expect(css).not.toContain('.notebook-arrangement__copy');
  });
});
