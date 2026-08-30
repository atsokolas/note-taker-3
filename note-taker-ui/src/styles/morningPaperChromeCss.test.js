import fs from 'fs';
import path from 'path';

describe('morning paper chrome on wiki', () => {
  const css = () => fs.readFileSync(path.join(__dirname, 'wiki-front-page.css'), 'utf8');

  it('does not keep a collapsed paper-fold that invented readiness', () => {
    expect(css()).not.toMatch(/paper-fold/);
    expect(css()).not.toMatch(/consecutive mornings/);
    expect(css()).not.toMatch(/wiki-front-page__streak/);
  });
});
