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
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.judgment__index li\.is-forward,[\s\S]*?animation:\s*none/s
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

  it('prints the Greek colophon on the shelf in both themes', () => {
    expect(css).toMatch(/\.judgment-shelf::after\s*\{[^}]*μνήμη · κρίσις/s);
    expect(css).not.toMatch(/html\[data-ui-theme='dark'\][\s\S]*?\.judgment-shelf::after[\s\S]*?display:\s*none/);
  });
});

describe('the judgment ledger', () => {
  it('illuminates replay by opacity and stills itself when motion is reduced', () => {
    expect(css).toMatch(/\.judgment-replay li\.is-open\s*\{\s*opacity:\s*1/);
    expect(css).not.toMatch(/judgment-replay[^}]*bounce/i);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.judgment-trace,[\s\S]*?transition:\s*none/
    );
    expect(css).not.toMatch(/confetti|toast|gamif/i);
  });
});

describe('the living team', () => {
  it('keeps the overlay as ink and stills itself when motion is reduced', () => {
    const room = css.match(/\.living-team\s*\{[^}]*\}/s)?.[0] || '';
    expect(room).toBeTruthy();
    expect(room).not.toMatch(/like-count|toast|backdrop-filter/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.living-team__overlay,[\s\S]*?transition:\s*none/
    );
  });
});
