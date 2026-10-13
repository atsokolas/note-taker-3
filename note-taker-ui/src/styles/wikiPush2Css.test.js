import fs from 'fs';
import path from 'path';

const readCss = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('wiki push-2 CSS', () => {
  it('caps wiki read body measure at ~68ch without changing font size', () => {
    const critical = readCss('wiki-critical.css');
    const wiki = readCss('wiki.css');

    expect(critical).toMatch(/\.wiki-read__body\s*\{[\s\S]*?max-width:\s*68ch;/);
    expect(critical).toMatch(/\.wiki-read__references\s*\{[\s\S]*?max-width:\s*68ch;/);
    expect(wiki).toMatch(/\.wiki-read__body\s*\{[\s\S]*?max-width:\s*68ch;/);
    expect(critical).toMatch(/\.wiki-read__body\s*\{[\s\S]*?font-size:\s*1\.12rem;/);
  });
});
