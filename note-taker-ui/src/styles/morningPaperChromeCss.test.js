import fs from 'fs';
import path from 'path';

describe('morning paper chrome on wiki', () => {
  const css = () => fs.readFileSync(path.join(__dirname, 'wiki-front-page.css'), 'utf8');

  it('does not keep a collapsed paper-fold that invented readiness', () => {
    expect(css()).not.toMatch(/paper-fold/);
    expect(css()).not.toMatch(/consecutive mornings/);
    expect(css()).not.toMatch(/wiki-front-page__streak/);
    expect(css()).not.toMatch(/broadsheet/);
  });

  it('settles mono readouts inside 400ms and keeps the lead instant', () => {
    const block = css().match(
      /\.paper-open\.is-settling \.paper-open__masthead,[\s\S]*?\{([^}]+)\}/
    )?.[1] || '';
    const duration = Number((block.match(/paper-open-settle\s+(\d+)ms/) || [])[1]);
    const delay = Number((block.match(/1\)\s+(\d+)ms both/) || block.match(/,\s*(\d+)ms both/) || [])[1]);
    expect(duration).toBeGreaterThan(0);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(duration + delay).toBeLessThanOrEqual(400);
    expect(css()).toMatch(
      /\.paper-open\.is-settling \.paper-open__lead\s*\{[^}]*animation:\s*none/s
    );
    expect(css()).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.paper-open\.is-settling \.paper-open__masthead,[\s\S]*?animation:\s*none/s
    );
  });
});
