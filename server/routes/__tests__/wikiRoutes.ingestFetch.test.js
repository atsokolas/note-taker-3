const assert = require('assert');

const { fetchReadableArticle } = require('../../services/readableArticle');

const htmlResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
  url: 'https://example.com/piece',
  text: async () => body,
  arrayBuffer: async () => Buffer.from(body)
});

const allowPublicAddress = async () => [{ address: '93.184.216.34', family: 4 }];

describe('URL ingest has something to read', () => {
  // The bug: a URL source was stored with text: '' and the wiki was then asked
  // to draft from it. Whatever the ingest route stores has to come from here,
  // and here has to return actual prose.
  it('extracts article prose from a fetched page', async () => {
    const html = `<html><head><title>How Diplomats See the World</title></head>
      <body><nav>menu</nav><article>
        <p>${'Diplomacy is a practice of reading intent through constrained signals. '.repeat(4)}</p>
        <p>${'The second paragraph carries the argument forward with further detail. '.repeat(4)}</p>
      </article><footer>subscribe to our newsletter</footer></body></html>`;
    const result = await fetchReadableArticle({
      url: 'https://example.com/piece',
      fetchImpl: async () => htmlResponse(html),
      lookup: allowPublicAddress
    });
    assert.strictEqual(result.ok, true, result.error);
    assert.match(result.title, /How Diplomats See the World/);
    assert(result.content.includes('Diplomacy is a practice'), 'article prose must survive');
    assert(!result.content.includes('subscribe to our newsletter'), 'page furniture must not');
  });

  // A source that could not be read is not a source that said nothing. The
  // route records that difference in metadata; this is the signal it keys on.
  it('reports why it failed instead of returning silent emptiness', async () => {
    const result = await fetchReadableArticle({
      url: 'https://example.com/paywalled',
      fetchImpl: async () => { throw new Error('403 from origin'); },
      lookup: allowPublicAddress
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.content, '');
    assert(result.error.length > 0, 'a failure must carry its reason');
  });
});
