/* The Omarchy plugin's decisions, run in node as the shell runs them: its
   Model.js is a QML JavaScript library, loaded here as one. Then the house
   rules for its QML and scripts. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plugin = path.join(__dirname, '..', 'plugins', 'omarchy');
const Model = {};
vm.runInNewContext(
  fs.readFileSync(path.join(plugin, 'Model.js'), 'utf8').replace('.pragma library', ''),
  Model
);
// Values made in the plugin's own context compare as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value));

// A link, or a search: the one field has to tell them apart.
assert.strictEqual(Model.linkFrom(' https://example.com/a?b=1#c '), 'https://example.com/a?b=1#c');
assert.strictEqual(Model.linkFrom('<example.com/slow>'), 'https://example.com/slow', 'a bare domain becomes a link');
assert.strictEqual(Model.linkFrom('stratechery.com'), 'https://stratechery.com');
for (const words of ['hiring', 'e.g.', 'what I read about hiring', 'v1.2', 'ftp://example.com', '']) {
  assert.strictEqual(Model.linkFrom(words), '', `"${words}" is a search`);
}

// A session is a token that has not expired.
const token = exp => ['e30', Buffer.from(JSON.stringify({ id: 'u1', exp })).toString('base64url'), 'sig'].join('.');
const now = Date.UTC(2026, 9, 18);
const live = token(now / 1000 + 60);
assert.deepStrictEqual(plain(Model.sessionFrom(JSON.stringify({ token: live }), now)), { token: live, ended: false });
assert.deepStrictEqual(plain(Model.sessionFrom(JSON.stringify({ token: token(now / 1000 - 1) }), now)),
  { token: '', ended: true }, 'an expired token is no session, and says it ended');
assert.deepStrictEqual(plain(Model.sessionFrom(JSON.stringify({ token: 'ntk_at_abc' }), now)),
  { token: 'ntk_at_abc', ended: false }, 'a connection token lasts until it is revoked');
assert.strictEqual(Model.sessionFrom('{}', now).ended, false, 'signed out is not ended');
assert.strictEqual(Model.sessionFrom('not json', now).token, '');

// Search answers with what you hold, then the Wiki, then your reading, each
// opening where it lives.
const results = Model.searchResults({
  articles: [{ _id: 'a1', title: 'Hiring', content: '<p>Most  hiring</p> mistakes' }],
  highlights: [{ _id: 'h1', articleId: 'a2', articleTitle: 'Who', text: 'Hire for slope.' }],
  notebook: [{ _id: 'n1', title: '', content: 'Slow down the yes.' }]
}, [
  { _id: 'w1', title: 'Hiring', plainText: 'What we learned hiring.' },
  { _id: 'j1', title: 'Hiring bar', judgment: { currentJudgment: 'Slope beats intercept.', status: 'monitoring' } },
  { _id: 'j2', title: 'Slope beats intercept.', judgment: { currentJudgment: 'Slope beats intercept.' } },
  { _id: 'j3', title: 'Referrals', judgment: { currentJudgment: 'Referrals hire best.', status: 'parked' } }
], 8);
assert.deepStrictEqual(plain(results.map(r => [r.kind, r.id, r.title, r.detail, r.path])), [
  ['View', 'j1', 'Slope beats intercept.', 'Hiring bar', '/judgment/j1'],
  ['View', 'j2', 'Slope beats intercept.', '', '/judgment/j2'],
  ['View', 'j3', 'Referrals hire best.', 'Set aside', '/judgment/j3'],
  ['Wiki', 'w1', 'Hiring', 'What we learned hiring.', '/wiki/workspace?page=w1'],
  ['Source', 'a1', 'Hiring', 'Most hiring mistakes', '/library?articleId=a1'],
  ['Passage', 'a2', 'Hire for slope.', 'Who', '/library?articleId=a2&highlightId=h1'],
  ['Note', 'n1', 'Untitled note', 'Slow down the yes.', '/think?tab=notebook&entryId=n1']
]);
assert.strictEqual(Model.searchResults({}, null, 8).length, 0, 'nothing found is nothing shown');
assert.strictEqual(Model.searchResults({}, { error: 'x' }, 8).length, 0, 'a refused Wiki is nothing shown');
const crowded = Model.searchResults({ articles: Array(9).fill({ _id: 'a' }) }, [{ _id: 'j', judgment: { currentJudgment: 'A view.' } }], 8);
assert.strictEqual(crowded.length, 8);
assert.strictEqual(crowded[0].kind, 'View', 'a search full of sources still shows the view it touches');
assert.strictEqual(Model.trimmed('word '.repeat(40), 20), 'word word word word…');
assert.strictEqual(Model.trimmed('Fish &amp; chips&#8217; &mdash; &#x2019;', 40), 'Fish & chips\u2019 \u2014 \u2019', 'entities read as text');

// A receipt says where the server put the piece, nothing more.
assert.strictEqual(Model.saveReceipt({ existing: false, article: { title: 'On Slow Reading' } }),
  'Saved to your Library: On Slow Reading');
assert.strictEqual(Model.saveReceipt({ existing: false, article: { title: 'On Slow Reading', placement: 'later' } }),
  'On your nightstand: On Slow Reading');
assert.strictEqual(Model.saveReceipt({ existing: true, article: { title: 'On Slow Reading', createdAt: '2026-03-04T12:00:00Z', placement: 'setAside' } }),
  'Already yours since March 4, on your desk: On Slow Reading');
assert.strictEqual(Model.saveReceipt({ existing: true, article: {} }), 'Already yours: Untitled');

// Failures read as sentences.
assert.match(Model.problem(0), /could not be reached/);
assert.strictEqual(Model.problem(410, null, 'connect'), 'That approval ran out of time. Connect again.');
assert.strictEqual(Model.problem(401, null, 'search'), 'Noeis no longer knows this desktop. Connect again.');
assert.match(Model.problem(422, { error: 'Could not extract readable text from that URL.' }, 'save'), /could not read that page/);
assert.strictEqual(Model.problem(500, { error: 'Failed to perform search.' }, 'search'), 'Failed to perform search.');
assert.strictEqual(Model.problem(503, null, 'search'), 'That did not work just now. Try it again.');

// The nightstand opens each piece where it waits, and says where it came from.
const nightstand = Model.nightstandRows({ items: [
  { _id: 'a1', title: 'The slow web', siteName: 'Stratechery', minutes: 40 },
  { _id: 'a2', title: '', author: 'Robin Sloan', minutes: 6 },
  { _id: 'a3', title: 'Notes on craft', minutes: 12 }
] });
assert.deepStrictEqual(plain(nightstand.slice(0, 2)), [
  { kind: 'Nightstand', id: 'a1', title: 'The slow web', detail: 'Stratechery', minutes: 40, path: '/library?articleId=a1' },
  { kind: 'Nightstand', id: 'a2', title: 'Untitled', detail: 'Robin Sloan', minutes: 6, path: '/library?articleId=a2' }
]);
assert.deepStrictEqual(plain(Model.nightstandRows(null)), [], 'an empty nightstand is no rows');

// The evening counts what is short, offers the one that waited longest
// (the list is newest first), and says nothing when nothing short waits.
// (Read as text: the plugin's CI installs nothing the server needs.)
const serverNightstand = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'nightstand.js'), 'utf8');
assert.strictEqual(String(Model.TONIGHT_MINUTES), /TONIGHT_MINUTES = (\d+)/.exec(serverNightstand)[1],
  'short means what the server means');
assert.deepStrictEqual(plain(Model.tonight(nightstand)),
  { id: 'a3', text: 'Two short pieces fit tonight. Notes on craft has waited longest, 12 min.' });
assert.strictEqual(Model.tonight(nightstand.slice(0, 2)).text, 'One short piece fits tonight. Untitled has waited longest, 6 min.');
assert.strictEqual(Model.tonight(nightstand.slice(0, 1)), null, 'a long piece is not offered for tonight');
const evening = new Date(2026, 9, 19, 19, 30).getTime();
assert.strictEqual(Model.untilHour(20, evening), 30 * 60000);
assert.strictEqual(Model.untilHour(19, evening), 23.5 * 3600000, 'an hour gone comes round tomorrow');

// The reading window: a piece's HTML as headings, paragraphs, quotes and
// list items; plain text by its blank lines.
assert.deepStrictEqual(plain(Model.blocksOf(
  '<h2>On <em>slow</em> reading</h2><p>First &amp; best.<br>Still first.</p>' +
  '<blockquote><p>Read less.</p></blockquote><ul><li>One</li><li>Two</li></ul><script>x()</script><div>Loose text</div>'
)), [
  { kind: 'heading', text: 'On slow reading' },
  { kind: 'paragraph', text: 'First & best.' },
  { kind: 'paragraph', text: 'Still first.' },
  { kind: 'quote', text: 'Read less.' },
  { kind: 'item', text: 'One' },
  { kind: 'item', text: 'Two' },
  { kind: 'paragraph', text: 'Loose text' }
]);
assert.deepStrictEqual(plain(Model.blocksOf('A pasted line.\n\nAnother.')).map(b => b.text), ['A pasted line.', 'Another.']);

// Every row a search finds can be read in the window, each from its own place.
assert.deepStrictEqual(plain(results.map(r => Model.pieceSource(r))), [
  '/api/wiki/pages/j1?reader=1', '/api/wiki/pages/j2?reader=1', '/api/wiki/pages/j3?reader=1', '/api/wiki/pages/w1?reader=1',
  '/articles/a1', '/articles/a2', '/api/notebook/n1'
]);
const passage = Model.pieceFrom(results[5], { title: 'Who', siteName: 'Essays', content: '<p>Intro.</p><p>Then: Hire for slope. Always.</p>' });
assert.deepStrictEqual(plain(passage), { title: 'Who', byline: 'Essays', cursor: 1,
  blocks: [{ kind: 'paragraph', text: 'Intro.' }, { kind: 'paragraph', text: 'Then: Hire for slope. Always.' }] },
  'a passage opens at the paragraph that holds it');
const view = Model.pieceFrom(results[0], { title: 'Hiring bar', judgment: { currentJudgment: 'Slope beats intercept.' },
  body: { type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Why' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Growth ' }, { type: 'text', text: 'compounds' }] }] }] }
  ] } });
assert.deepStrictEqual(plain(view.blocks), [
  { kind: 'quote', text: 'Slope beats intercept.' }, { kind: 'heading', text: 'Why' }, { kind: 'item', text: 'Growth compounds' }
], 'a view leads with what you hold');
assert.deepStrictEqual(plain(Model.pieceFrom(results[6], { title: 'Hiring', blocks: [
  { type: 'heading', text: 'Yes' }, { type: 'highlight_embed', text: 'Hire for slope.' }, { type: 'paragraph', text: '' }
] }).blocks), [{ kind: 'heading', text: 'Yes' }, { kind: 'quote', text: 'Hire for slope.' }]);

// The theme, or Tokyo Night until there is one.
assert.deepStrictEqual(plain(Model.parseColors('accent = "#7AA2F7"\nbackground = "#1a1b26"\nforeground = "#a9b1d6"\nred = "#f7768e"')),
  { background: '#1a1b26', foreground: '#a9b1d6', accent: '#7aa2f7', selection: '#1a1b26', urgent: '#f7768e' });
assert.strictEqual(Model.parseColors(''), Model.TOKYO_NIGHT);

// What the server sends is shown as typed: control and direction-override
// characters gone, titles and paragraphs clipped, markup read as text.
const loud = Model.nightstandRows({ items: [{ _id: 'x', title: 'On\u202e Slow\u0007 Reading\n' + 'very '.repeat(200), siteName: 'Essays\u0000' }] })[0];
assert.ok(loud.title.startsWith('On Slow Reading very'), 'controls become spaces');
assert.ok(loud.title.length <= Model.TITLE_CHARS + 1 && loud.title.endsWith('…'), 'a long title is clipped');
assert.strictEqual(loud.detail, 'Essays');
assert.deepStrictEqual(plain(Model.blocksOf('<p>Look<img src="https://example.com/x.png">here</p><p>&lt;img src=x&gt;</p>')).map(b => b.text),
  ['Look here', '<img src=x>'], 'an image is dropped, and markup written as text stays text');
const long = Model.pieceFrom({ kind: 'Source', id: 'a' }, { title: 'A', content: '<p>' + 'word '.repeat(10000) + '</p>' + '<p>x</p>'.repeat(Model.MAX_BLOCKS + 5) });
assert.ok(long.blocks[0].text.length <= Model.BLOCK_CHARS + 1, 'a paragraph is clipped');
assert.strictEqual(long.blocks.length, Model.MAX_BLOCKS, 'a piece is clipped');
assert.strictEqual(Model.problem(500, { error: '<b>x</b>\u0007'.repeat(100) }).length <= Model.TITLE_CHARS + 1, true, 'a server error is clipped');
assert.strictEqual(Model.escaped('Fish & <b>chips</b>'), 'Fish &amp; &lt;b&gt;chips&lt;/b&gt;', 'a notification body reads as typed');

// Only https leaves the machine.
assert.strictEqual(Model.httpsOr('https://staging.noeis.io/', Model.API), 'https://staging.noeis.io');
for (const url of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'https://', 'https://a b', '', undefined]) {
  assert.strictEqual(Model.httpsOr(url, Model.API), Model.API, `${url} is refused`);
}

// What the shell loads is what the manifest names.
const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'manifest.json'), 'utf8'));
for (const entry of Object.values(manifest.entryPoints)) assert.ok(fs.existsSync(path.join(plugin, entry)), `${entry} exists`);
for (const field of manifest.barWidget.schema) assert.strictEqual(manifest.barWidget.defaults[field.key], field.defaultValue, `${field.key} has one default`);

// House rules for the QML: the shell's Color singleton is undefined in
// plugins (colours come from the Service's palette), and a property an Item
// already has cannot be declared again.
const read = file => fs.readFileSync(path.join(plugin, file), 'utf8');
const qml = fs.readdirSync(plugin).filter(file => file.endsWith('.qml'));
for (const file of qml) {
  assert.doesNotMatch(read(file), /\bColor\./, `${file} takes its colours from the palette`);
  assert.doesNotMatch(read(file), /property \w+ (data|top|state|enabled|visible|width|height|children)\b/, `${file} redeclares no Item property`);
}

// The plain-text contract: every Text sets PlainText, so nothing the server
// sends is read as markup, and nothing in the plugin loads an image.
for (const file of qml) {
  const source = read(file);
  for (const match of source.matchAll(/\bText\s*\{/g)) {
    let depth = 0, end = match.index + match[0].length - 1;
    do { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; } while (depth);
    assert.match(source.slice(match.index, end), /textFormat: Text\.PlainText/, `${file}:${source.slice(0, match.index).split('\n').length} is plain text`);
  }
  assert.doesNotMatch(source, /\b(Image|AnimatedImage|BorderImage)\s*\{|RichText|StyledText|MarkdownText/, `${file} loads no image and renders no markup`);
}

// The bar wears the logo noeis.io does.
const strands = text => [...text.matchAll(/(?: d=|path: )"([^"]+)"/g)].map(m => m[1]);
assert.deepStrictEqual(strands(read('NoeisMark.qml')),
  strands(fs.readFileSync(path.join(__dirname, '..', 'note-taker-ui', 'src', 'assets', 'noeis-mark.svg'), 'utf8')), 'the mark is the woven N');

// Every network call from the scripts is https only, with a deadline; the
// session is written by one private writer, never by FileView.
for (const file of ['bin/noeis-open', 'bin/noeis-setup']) {
  for (const call of read(file).match(/\bcurl -(\\\n|[^\n])*/g) || []) {
    assert.match(call, /--proto =https/, `${file}: curl is https only`);
    assert.match(call, /--max-time \d+/, `${file}: curl has a deadline`);
  }
}
assert.doesNotMatch(read('Service.qml'), /setText\(/, 'the session is written only by its private writer');
assert.match(read('Service.qml'), /umask 077 [^\n]*chmod 700 [^\n]*mktemp [^\n]*chmod 600 [^\n]*read -r[^\n]*mv -f /, 'the token goes into a new private file that replaces the session, never into the old one');

// noeis-open hands the app to omarchy-launch-or-focus, which evals it: the app
// is a bare https origin, a page only a path, and the command is quoted.
{
  const open = read('bin/noeis-open');
  assert.match(open, /APP =~ \^https:\/\/\[A-Za-z0-9\.-\]\+/, 'noeis-open takes the app only as a bare https origin');
  assert.match(open, /page =~ \^\/\[\^\[:space:\]\]\*\$/, 'a page is a path on the app and nothing else');
  assert.match(open, /launch-or-focus [^\n]*printf '%q'/, 'the evaled launch command is shell-quoted');
  assert.doesNotMatch(open, /launch-webapp '\$APP/, 'the app is not pasted into single quotes');
}

// Every `omarchy-shell noeis <call>` the scripts and README name is one the
// Service answers.
const answers = new Set([...read('Service.qml').matchAll(/function (\w+)\([^)]*\): void/g)].map(m => m[1]));
const named = ['bin/noeis-open', 'bin/noeis-setup', 'README.md', 'Service.qml'].flatMap(file => [...read(file).matchAll(/omarchy-shell"?,? "?noeis"?,? "?(\w+)/g)].map(m => m[1]));
assert.ok(named.length >= 4);
for (const call of named) assert.ok(answers.has(call), `noeis ${call} is answered`);

// The scripts run against a throwaway home, with stand-ins for what they call.
const { execFileSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const script = name => path.join(plugin, 'bin', name);
function inThrowawayHome(stubs, run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-'));
  const at = file => path.join(home, file);
  const write = (file, text, mode) => { fs.mkdirSync(path.dirname(at(file)), { recursive: true }); fs.writeFileSync(at(file), text, { mode }); };
  for (const [name, body] of Object.entries(stubs)) write(`stub/${name}`, `#!/bin/bash\n${body}\n`, 0o755);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: at('.config'), PATH: `${at('stub')}:${process.env.PATH}` };
  try { run({ at, write, env, home }); } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

// A file's name is its own, never curl's syntax: curl is asked (--libcurl)
// which files it would send, and a name with commas, semicolons, quotes and
// backslashes is the one file it names.
const curl = execFileSync('bash', ['-c', 'command -v curl'], { encoding: 'utf8' }).trim();
inThrowawayHome({
  curl: `exec ${curl} "$@" --libcurl "$HOME/sent.c"`,
  'omarchy-notification-send': ':'
}, ({ at, write, env, home }) => {
  write('.config/noeis/omarchy.json', '{"token":"t"}');
  write('private.txt', 'private');
  for (const name of ['book.epub', 'book.epub,private.txt', 'book.epub;type=text/html', 'say "hi".md', 'back\\slash.md', 'q\\",private.txt']) {
    write(name, name);
    fs.rmSync(at('sent.c'), { force: true });
    spawnSync('bash', [script('noeis-open'), name], { cwd: home, env: { ...env, NOEIS_API_URL: 'https://127.0.0.1:1' } });
    const sent = [...fs.readFileSync(at('sent.c'), 'utf8').matchAll(/curl_mime_filedata\(\w+, ("(?:[^"\\]|\\.)*")\)/g)].map(m => JSON.parse(m[1]));
    assert.deepStrictEqual(sent, [name], `${name} is the one file sent`);
  }
});

// Text read off the screen is what OCR printed and nothing else: letting the
// region go prints nothing, and the clipboard is never read or written.
assert.doesNotMatch(read('Service.qml'), /omarchy-capture-text/, 'screen text does not pass through the clipboard');
for (const [what, slurp, tesseract, status, text] of [
  ['a region', 'echo "1,2 3x4"', 'echo "Read me"', 0, 'Read me'],
  ['a region let go', 'exit 1', 'echo "Read me"', 0, ''],
  ['a blank region', 'echo "1,2 3x4"', 'echo " "', 1, ''],
  ['OCR that fails partway', 'echo "1,2 3x4"', 'echo "Half"; exit 1', 1, '']
]) {
  inThrowawayHome({
    slurp, tesseract: `cat >/dev/null; ${tesseract}`, grim: 'echo png', hyprpicker: 'exec sleep 5',
    'wl-copy': 'touch "$HOME/clipboard"', 'wl-paste': 'touch "$HOME/clipboard"; echo private'
  }, ({ at, env }) => {
    const ran = spawnSync('bash', [script('noeis-screen-text')], { env, encoding: 'utf8' });
    assert.deepStrictEqual([ran.status, ran.stdout], [status, text], what);
    assert.ok(!fs.existsSync(at('clipboard')), `${what} leaves the clipboard alone`);
  });
}

// noeis-setup: --dry-run changes nothing, a second run changes nothing, it
// never loads anything into the browser (and takes out the old bundled
// extension), and --remove leaves every file as it found it.
inThrowawayHome({
  'omarchy-webapp-install': 'mkdir -p "$HOME/.local/share/applications" && : >"$HOME/.local/share/applications/$1.desktop"',
  'omarchy-webapp-remove': 'rm -f "$HOME/.local/share/applications/$1.desktop"'
}, ({ at, write, env, home }) => {
  const bindings = 'o.bind("SUPER + RETURN", "Terminal", "xdg-terminal-exec")\n';
  const menu = '{\n  // mine\n  "personal": {"label":"Personal"},\n}\n';
  write('.config/hypr/bindings.lua', bindings);
  write('.config/omarchy/extensions/omarchy-menu.jsonc', menu);
  write('.config/chromium-flags.conf', `--ozone-platform=wayland\n--load-extension=/mine,${home}/.config/omarchy/plugins/io.noeis/browser/chromium\n`);
  const files = () => ['.config/hypr/bindings.lua', '.config/omarchy/extensions/omarchy-menu.jsonc', '.config/chromium-flags.conf'].map(f => fs.readFileSync(at(f), 'utf8'));
  const setup = (...args) => execFileSync('bash', [script('noeis-setup'), ...args], { env, encoding: 'utf8' });
  const before = files();
  assert.match(setup('--dry-run'), /would: /);
  assert.deepStrictEqual(files(), before, '--dry-run changes nothing');
  setup();
  const [keys, share, flags] = files();
  assert.strictEqual((keys.match(/^o\.bind\(.*Noeis/gm) || []).length, 6, 'six keys under -- Noeis');
  assert.match(share, /"trigger\.share\.noeis"[^\n]*\n}\n$/, 'Share → Noeis goes in before the closing brace');
  assert.strictEqual(flags, '--ozone-platform=wayland\n--load-extension=/mine\n', 'nothing of Noeis is loaded into Chromium; the rest is kept');
  assert.match(setup(), /nothing to change/, 'a second run changes nothing');
  setup('--remove');
  assert.deepStrictEqual(files(), [bindings, menu, flags], '--remove undoes every change');
  assert.ok(!fs.existsSync(at('.local/bin/noeis-open')) && fs.readdirSync(at('.local/share/applications')).length === 0, '--remove takes out the link and launcher entries');
});

console.log('omarchy plugin: ok');
