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

  it('fades rails in and out instead of snapping them away', () => {
    expect(css).toMatch(/\[data-writing-rail\] > \*[\s\S]*?transition:[\s\S]*?opacity 680ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    expect(css).toMatch(/body\.think-rails-away \[data-writing-rail\] > \*[\s\S]*?opacity: 0;[\s\S]*?opacity 540ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    expect(css).toMatch(/grid-template-columns 720ms var\(--noeis-ease-standard/);
    expect(css).toContain('--think-rail-retreat: -4px;');
    expect(css).toContain('--think-rail-retreat: 4px;');
    expect(css).not.toMatch(/opacity 280ms/);
    expect(css).not.toContain('--think-rail-retreat: -14px;');
  });

  it('staggers the two rails so they do not dissolve as one slab', () => {
    expect(css).toMatch(/\[data-writing-rail='right'\] > \*[\s\S]*?transition-delay: 48ms;/);
    expect(css).toMatch(/body\.think-rails-away \[data-writing-rail\]:is\(:hover, :focus-within\) > \*[\s\S]*?transition-delay: 0ms;/);
  });

  it('keeps a short opacity fade under reduced motion and skips rail retreat motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*body\.think-rails-away \[data-writing-rail\]::after/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: opacity 80ms/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transform: none/);
  });
});
