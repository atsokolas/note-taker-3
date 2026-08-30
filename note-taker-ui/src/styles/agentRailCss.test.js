const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'agent-rail.css'), 'utf8');

describe('Skeptical Partner note motion', () => {
  it('slides one note on compositor-safe properties inside the 220ms house rhythm', () => {
    const proposal = css.match(/\.agent-rail__proposal\s*\{[^}]*\}/s)?.[0] || '';
    expect(proposal).toMatch(/opacity\s+160ms/);
    expect(proposal).toMatch(/transform\s+200ms/);
    expect(proposal).not.toMatch(/transition:[^}]*\b(max-height|height|margin|padding)\b/s);
    expect(css).toMatch(/\.agent-rail__proposal\.is-arriving\s*\{[^}]*220ms/s);
  });

  it('keeps the note in place when reduced motion is requested', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.agent-rail__proposal,[\s\S]*?transform:\s*none/s
    );
  });
});
