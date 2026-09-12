const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'editions.css'), 'utf8');

describe('edition columns follow the configuration', () => {
  it('does not default the stand to a three-column evidence layout', () => {
    expect(css).not.toMatch(/grid-template-columns:\s*repeat\(3,/);
    expect(css).toMatch(/grid-template-columns:\s*repeat\(var\(--edition-columns\)/);
  });

  it('narrows from the configured count at tablet, then stacks on a phone', () => {
    expect(css).toMatch(
      /@media \(max-width: 920px\)[\s\S]*?\.columns\s*\{[^}]*var\(--edition-columns-narrow/s
    );
    expect(css).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
    );
  });
});

describe('edition motion stays calm', () => {
  it('keeps issue and fold motion on fine pointers only', () => {
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.issue\s*\{[^}]*transition:/s
    );
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.story__body\s*\{[^}]*transition:/s
    );
  });

  it('drops those transitions when the reader prefers less motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.issue,[\s\S]*?transition:\s*none/s
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.edition-sources__summary::before \{\s*transition:\s*none/s
    );
  });

  it('keeps section-flag and source-caret extras on fine pointers only', () => {
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.column__head::after\s*\{[^}]*transition:/s
    );
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.edition-sources__summary::before\s*\{[^}]*transition:/s
    );
  });
});
