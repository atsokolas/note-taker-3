const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'judgment.css'), 'utf8');

describe('overnight as a note under the door', () => {
  it('shares one paper edge for overnight and the library inbox', () => {
    expect(css).toMatch(/\.judgment-slip\s*\{[^}]*margin-left:\s*-0\.55rem/s);
    expect(css).toMatch(/\.judgment-slip\s*\{[^}]*border-left:\s*1px solid/s);
    expect(css).toMatch(/\.judgment-slip\s*\{[^}]*--ink-agent/s);
    expect(css).toMatch(/\.judgment-slip\s*\{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/\.judgment-slip\s*\{[^}]*box-shadow:\s*none/s);
    expect(css).toMatch(/\.judgment-slip\s*\{[^}]*border-radius:\s*0/s);
  });

  it('does not paint overnight or the inbox as a card or glass tray', () => {
    const slip = css.match(/\.judgment-slip\s*\{[^}]*\}/s)?.[0] || '';
    expect(slip).not.toMatch(/backdrop-filter/);
    expect(slip).not.toMatch(/rgba?\([^)]*0\.\d+\s*\)/);
    expect(css).not.toMatch(/\.judgment__proposal[^{]*\{[^}]*box-shadow:\s*(?!none)[^;]+/s);
    expect(css).not.toMatch(/\.judgment-inbox\s*\{[^}]*box-shadow:\s*(?!none)[^;]+/s);
  });

  it('lets overnight evaporate instantly when motion is reduced', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.judgment__proposal,[\s\S]*?transition:\s*none/
    );
  });

  it('moves notes with compositor-safe properties inside the 220ms house rhythm', () => {
    const proposal = css.match(/\.judgment__proposal\s*\{[^}]*\}/s)?.[0] || '';
    const inboxLine = css.match(/\.judgment-inbox__line\s*\{[^}]*\}/s)?.[0] || '';
    expect(proposal).not.toMatch(/transition:[^}]*\b(max-height|margin|padding)\b/s);
    expect(inboxLine).not.toMatch(/transition:[^}]*\b(max-height|margin|padding)\b/s);
    expect(css).toMatch(/\.judgment-log__row\.is-arriving\s*\{[^}]*220ms/s);
    expect(css).not.toMatch(/judgment-log-arrive\s+640ms/);
  });

  it('lets the hold words sit as quiet ink, not a score or chip', () => {
    const hold = css.match(/\.judgment-inbox__hold\s*\{[^}]*\}/s)?.[0] || '';
    expect(hold).toMatch(/var\(--text-muted/);
    expect(hold).not.toMatch(/box-shadow/);
    expect(hold).not.toMatch(/border-radius/);
    expect(hold).not.toMatch(/badge|score/i);
  });
});
