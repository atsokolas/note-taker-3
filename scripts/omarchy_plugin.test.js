/* The Omarchy plugin's decisions, run in node as the shell runs them: the
   panel's Model.js is a QML JavaScript library, loaded here as one. */
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
assert.deepStrictEqual(plain(results.map(r => [r.kind, r.title, r.detail, r.path])), [
  ['View', 'Slope beats intercept.', 'Hiring bar', '/judgment/j1'],
  ['View', 'Slope beats intercept.', '', '/judgment/j2'],
  ['View', 'Referrals hire best.', 'Set aside', '/judgment/j3'],
  ['Wiki', 'Hiring', 'What we learned hiring.', '/wiki/workspace?page=w1'],
  ['Source', 'Hiring', 'Most hiring mistakes', '/library?articleId=a1'],
  ['Passage', 'Hire for slope.', 'Who', '/library?articleId=a2&highlightId=h1'],
  ['Note', 'Untitled note', 'Slow down the yes.', '/think?tab=notebook&entryId=n1']
]);
assert.strictEqual(Model.searchResults({}, null, 8).length, 0, 'nothing found is nothing shown');
assert.strictEqual(Model.searchResults({}, { error: 'x' }, 8).length, 0, 'a refused Wiki is nothing shown');
const crowded = Model.searchResults({ articles: Array(9).fill({ _id: 'a' }) }, [{ _id: 'j', judgment: { currentJudgment: 'A view.' } }], 8);
assert.strictEqual(crowded.length, 8);
assert.strictEqual(crowded[0].kind, 'View', 'a search full of sources still shows the view it touches');
assert.strictEqual(Model.trimmed('word '.repeat(40), 20), 'word word word word…');

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
assert.deepStrictEqual(plain(Model.nightstandRows({ items: [
  { _id: 'a1', title: 'The slow web', siteName: 'Stratechery' },
  { _id: 'a2', title: '', author: 'Robin Sloan' }
] })), [
  { kind: 'Nightstand', title: 'The slow web', detail: 'Stratechery', path: '/library?articleId=a1' },
  { kind: 'Nightstand', title: 'Untitled', detail: 'Robin Sloan', path: '/library?articleId=a2' }
]);
assert.deepStrictEqual(plain(Model.nightstandRows(null)), [], 'an empty nightstand is no rows');

// What the shell loads is what the manifest names.
const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'manifest.json'), 'utf8'));
for (const entry of Object.values(manifest.entryPoints)) assert.ok(fs.existsSync(path.join(plugin, entry)), `${entry} exists`);

console.log('omarchy plugin: ok');
