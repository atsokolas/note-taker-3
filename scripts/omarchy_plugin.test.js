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

// Every `omarchy-shell noeis <call>` the scripts and README name is one the
// Service answers.
const answers = new Set([...read('Service.qml').matchAll(/function (\w+)\([^)]*\): void/g)].map(m => m[1]));
const named = ['bin/noeis-open', 'bin/noeis-setup', 'README.md', 'Service.qml'].flatMap(file => [...read(file).matchAll(/omarchy-shell"?,? "?noeis"?,? "?(\w+)/g)].map(m => m[1]));
assert.ok(named.length >= 4);
for (const call of named) assert.ok(answers.has(call), `noeis ${call} is answered`);

console.log('omarchy plugin: ok');
