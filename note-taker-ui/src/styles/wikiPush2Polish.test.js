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
});
