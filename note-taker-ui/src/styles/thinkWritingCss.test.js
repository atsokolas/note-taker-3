import fs from 'fs';
import path from 'path';

describe('Think writing focus mode', () => {
  const css = fs.readFileSync(path.join(__dirname, 'think-writing.css'), 'utf8');

  it('retreats both rails into named handles while writing', () => {
    expect(css).toContain("grid-template-columns: 30px minmax(420px, 1fr) 30px;");
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

  it('makes reduced motion instant instead of a half-animated fade', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*body:is\(\.think-rails-away, \.think-focus-held\) \[data-writing-rail\]::after[\s\S]*transition: none;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\[data-writing-rail\] > \*[\s\S]*transform: none[\s\S]*transition: none;/);
    expect(css).not.toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: opacity 80ms/);
  });
});
