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

  it('keeps focus-mode motion removable', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*body\.think-writing-active \[data-writing-rail\]::after/);
  });
});
