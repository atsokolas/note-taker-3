const assert = require('assert');
const {
  deriveConceptTitleFromText,
  extractReadableText,
  extractTitle,
  fetchUrlForIngest,
  normalizeIngestText,
  stripHtml
} = require('./urlTextIngest');

const run = async () => {
  // Zero-padded numeric references are what Wikipedia emits. The old decoder
  // matched &#39; but not &#039;, so a new user's first page was titled
  // "Goodhart&#039;s law - Wikipedia" on production.
  assert.strictEqual(
    extractTitle('<title>Goodhart&#039;s law - Wikipedia</title>'),
    "Goodhart's law - Wikipedia"
  );
  assert.strictEqual(extractTitle('<title>Caf&#233; culture</title>'), 'Café culture');
  assert.strictEqual(extractTitle('<title>&#x27;Hex&#x27; escapes</title>'), "'Hex' escapes");
  assert.strictEqual(extractTitle('<title>Tom &amp; Jerry</title>'), 'Tom & Jerry');
  // An escaped ampersand must not be decoded twice into a live entity.
  assert.strictEqual(extractTitle('<title>&amp;#039; stays literal</title>'), '&#039; stays literal');

  const html = `
    <html>
      <head><title>Example &amp; Test</title><style>.x{}</style></head>
      <body>
        <nav>Ignore nav</nav>
        <article><h1>Example</h1><p>First paragraph.</p><p>Second &amp; third.</p></article>
      </body>
    </html>
  `;
  assert.strictEqual(extractTitle(html), 'Example & Test');
  assert.ok(extractReadableText(html).includes('First paragraph.'));
  assert.ok(!extractReadableText(html).includes('.x{}'));
  assert.strictEqual(stripHtml('<p>A&nbsp;B&amp;C</p>'), 'A B&C');
  assert.strictEqual(normalizeIngestText(' a \r\n b '), 'a\n b');
  assert.strictEqual(
    deriveConceptTitleFromText('Spaced repetition is a learning technique where reviews are timed.'),
    'Spaced Repetition'
  );
  assert.strictEqual(
    deriveConceptTitleFromText('Opportunity cost is the price of the best alternative not taken.'),
    'Opportunity Cost'
  );

  const result = await fetchUrlForIngest({
    url: 'https://example.com/post',
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => html
    })
  });
  assert.strictEqual(result.url, 'https://example.com/post');
  assert.strictEqual(result.title, 'Example & Test');
  assert.ok(result.text.includes('Second & third.'));

  await assert.rejects(
    () => fetchUrlForIngest({ url: 'file:///tmp/x' }),
    /http and https/
  );

  console.log('urlTextIngest tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
