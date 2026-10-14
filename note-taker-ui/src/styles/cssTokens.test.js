import fs from 'fs';
import path from 'path';

/*
 * A colour written as a token's fallback is a colour that shows whenever the
 * token is missing. When the token is defined nowhere, that is every theme:
 * a light hex dropped onto Dracula or Nord as a pale patch. Every token a
 * stylesheet leans on for colour has to exist somewhere.
 */
const SRC = path.join(__dirname, '..');

const stylesheets = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return stylesheets(full);
  return entry.name.endsWith('.css') ? [full] : [];
});

describe('colour tokens', () => {
  it('never falls back to a literal colour for a token no theme defines', () => {
    const files = stylesheets(SRC).map((file) => [path.relative(SRC, file), fs.readFileSync(file, 'utf8')]);
    const scripts = fs.readdirSync(SRC, { recursive: true })
      .filter((name) => /\.jsx?$/.test(name))
      .map((name) => fs.readFileSync(path.join(SRC, name), 'utf8'))
      .join('\n');
    const defined = new Set(files.flatMap(([, css]) => [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
    const setInScript = (token) => scripts.includes(`'${token}'`) || scripts.includes(`"${token}"`);

    const leaks = files.flatMap(([file, css]) => (
      [...css.matchAll(/var\((--[\w-]+)\s*,\s*(#[0-9a-f]{3,8}\b|rgba?\(|white\b|black\b)/gi)]
        .filter(([, token]) => !defined.has(token) && !setInScript(token))
        .map(([match]) => `${file}: ${match}`)
    ));

    expect(leaks).toEqual([]);
  });
});
