const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnexNotes } = require('./evernoteTransform');

test('an Evernote export reads into notes with their titles, tags, lines and source', () => {
  const [note, second] = parseEnexNotes('<en-export><note><title>A &amp; B</title><content><![CDATA[<en-note><div>Hi</div><div>there</div></en-note>]]></content><created>20200101T000000Z</created><tag>x</tag><tag>y</tag><note-attributes><source-url>https://a.b</source-url></note-attributes></note><note><title>Two</title><content>plain</content></note></en-export>');
  assert.deepEqual(note, { title: 'A & B', created: '20200101T000000Z', updated: '', tags: ['x', 'y'], contentLines: ['Hi', 'there'], sourceUrl: 'https://a.b' });
  assert.equal(second.title, 'Two');
});

test('an export of unclosed tags reads in a moment, not hours', () => {
  const startedAt = Date.now();
  parseEnexNotes('<note>'.repeat(2e6));
  parseEnexNotes(`<note><content>${'<'.repeat(5e6)}</content></note>`);
  assert.ok(Date.now() - startedAt < 2000);
});
