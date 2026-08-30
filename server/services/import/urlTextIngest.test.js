const assert = require('assert');
const {
  extractReadableText,
  extractTitle,
  fetchUrlForIngest,
  normalizeIngestText,
  stripHtml,
  stripSiteSuffix
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

  // A page titles itself for a browser tab. A library of "X - Wikipedia" reads as
  // a shelf of Wikipedia rather than a shelf of ideas, so the publication comes off
  // the end — but only when something actually claims that half is a publication.
  assert.strictEqual(
    stripSiteSuffix('Survivorship bias - Wikipedia', { siteName: 'Wikipedia', hostname: 'en.wikipedia.org' }),
    'Survivorship bias'
  );

  // The host answers it when the page never names itself.
  assert.strictEqual(
    stripSiteSuffix('The Tail End | Wait But Why', { hostname: 'waitbutwhy.com' }),
    'The Tail End'
  );

  // A subtitle is part of the work. Nothing claims this half is a publisher.
  assert.strictEqual(
    stripSiteSuffix('Fooled by Randomness - The Hidden Role of Chance', {
      siteName: 'Penguin Random House', hostname: 'penguinrandomhouse.com'
    }),
    'Fooled by Randomness - The Hidden Role of Chance'
  );

  ['-', '|', '\u2013', '\u2014', ':', '\u00b7'].forEach((separator) => {
    assert.strictEqual(
      stripSiteSuffix(`Goodhart's law ${separator} Wikipedia`, { siteName: 'Wikipedia', hostname: 'en.wikipedia.org' }),
      "Goodhart's law",
      `separator ${separator} left the publication attached`
    );
  });

  // Stripping a title down to nothing is worse than leaving the suffix on.
  assert.strictEqual(
    stripSiteSuffix('Wikipedia', { siteName: 'Wikipedia', hostname: 'en.wikipedia.org' }),
    'Wikipedia'
  );

  // With no idea what the publication is, guessing would eat real titles.
  assert.strictEqual(stripSiteSuffix('Some page - Somewhere', {}), 'Some page - Somewhere');

  // End to end: the suffix is gone by the time the source reaches the library.
  const suffixed = await fetchUrlForIngest({
    url: 'https://en.wikipedia.org/wiki/Goodhart',
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      text: async () => '<html><head><meta property="og:site_name" content="Wikipedia">'
        + '<title>Goodhart&#039;s law - Wikipedia</title></head><body><p>A law.</p></body></html>'
    })
  });
  assert.strictEqual(suffixed.title, "Goodhart's law");

  console.log('urlTextIngest tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
