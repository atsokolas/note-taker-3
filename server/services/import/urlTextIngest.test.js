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
