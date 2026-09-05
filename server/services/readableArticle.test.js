const { bodyFrom, fetchReadableArticle, stripTags, titleFrom } = require('./readableArticle');

const headers = (values = {}) => ({ get: key => values[String(key).toLowerCase()] || null });
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const page = (body, head = '') => `<html><head><title>Tab title</title>${head}</head><body>${body}</body></html>`;
const respond = (html, type = 'text/html; charset=utf-8') => async () => ({
  ok: true, status: 200, headers: headers({ 'content-type': type }), text: async () => html
});

describe('what a reader would call the article', () => {
  /* A nav's text is worse than useless: it is text that looks like prose to
     everything downstream. */
  it('drops the furniture and keeps the piece', () => {
    const body = bodyFrom(page('<nav>Home About</nav><article><p>The claim.</p></article><footer>(c) 2026</footer>'));
    expect(body).toBe('The claim.');
  });

  /* Collapsing block ends loses every paragraph, and a wall of text cannot be
     highlighted a sentence at a time. */
  it('keeps paragraph breaks', () => {
    expect(bodyFrom(page('<article><p>One.</p><p>Two.</p></article>'))).toBe('One.\n\nTwo.');
  });

  /* A page can wrap the real content in an empty <article>. Length is blunt,
     but it is honest about which one is the piece. */
  it('prefers the container that actually holds the article', () => {
    const html = page('<article></article><main><p>The whole piece, at length.</p></main>');
    expect(bodyFrom(html)).toBe('The whole piece, at length.');
  });

  it('falls back to the page when nothing names its own body', () => {
    expect(bodyFrom('<p>Just a fragment.</p>')).toBe('Just a fragment.');
  });

  it('decodes what HTML escapes, including numeric and hex', () => {
    expect(stripTags('<p>Ben &amp; Jerry&rsquo;s &#8212; &#x2014;</p>')).toBe('Ben & Jerry’s — —');
  });

  it('leaves an unknown entity alone rather than eating it', () => {
    expect(stripTags('<p>&notareal; thing</p>')).toBe('&notareal; thing');
  });

  it('prefers the title a page gives sharers over its tab name', () => {
    expect(titleFrom(page('', '<meta property="og:title" content="The Real Title">'))).toBe('The Real Title');
    expect(titleFrom(page(''))).toBe('Tab title');
    expect(titleFrom('<html></html>')).toBe('');
  });
});

describe('fetching one', () => {
  it('returns the title and the body', async () => {
    const found = await fetchReadableArticle({
      url: 'https://example.com/post',
      lookup: publicLookup,
      fetchImpl: respond(page('<article><p>Loss keeps falling.</p></article>', '<meta property="og:title" content="Scaling">'))
    });
    expect(found).toMatchObject({ ok: true, title: 'Scaling', content: 'Loss keeps falling.' });
  });

  /* A source that will not fetch is still a source worth saving. A paywall
     answering 403 must not lose the reader's click. */
  it('never throws, so a failed fetch cannot lose the save', async () => {
    const refused = await fetchReadableArticle({
      url: 'https://example.com/paywalled',
      lookup: publicLookup,
      fetchImpl: async () => ({ ok: false, status: 403, headers: headers() })
    });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/403/);
    expect(refused.content).toBe('');
  });

  /* The SSRF hardening is the shared fetcher's, and this proves the door is
     actually wired to it. */
  it('refuses a private address', async () => {
    const blocked = await fetchReadableArticle({
      url: 'http://127.0.0.1/secrets',
      lookup: publicLookup,
      fetchImpl: respond(page('<p>internal</p>'))
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/public IP/);
  });

  it('refuses something that is not a web page', async () => {
    const wrong = await fetchReadableArticle({
      url: 'https://example.com/thing.pdf',
      lookup: publicLookup,
      fetchImpl: respond('%PDF-1.7', 'application/pdf')
    });
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toMatch(/readable web page/);
  });
});
