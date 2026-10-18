const { bodyFrom, fetchReadableArticle, fillArticleBodies, paragraphsToHtml, stripTags, titleFrom } = require('./readableArticle');

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
    expect(refused.status).toBe(403);
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

describe('asking whether an original still answers', () => {
  const { isGoneStatus, publicUrlStatus } = require('../lib/publicUrlFetch');

  it('only Not Found and Gone mean gone', () => {
    expect([404, 410].every(isGoneStatus)).toBe(true);
    expect([0, 200, 403, 429, 500, 503].some(isGoneStatus)).toBe(false);
  });

  it('sends a HEAD, follows a safe redirect, and reports the final status', async () => {
    const calls = [];
    const status = await publicUrlStatus({
      url: 'https://example.com/old',
      lookup: publicLookup,
      fetchImpl: async (url, init) => {
        calls.push([url, init.method]);
        return url.endsWith('/old')
          ? { status: 301, headers: headers({ location: '/new' }) }
          : { status: 410, headers: headers() };
      }
    });
    expect(status).toBe(410);
    expect(calls).toEqual([['https://example.com/old', 'HEAD'], ['https://example.com/new', 'HEAD']]);
  });

  it('says nothing (0) rather than guess when it cannot ask', async () => {
    expect(await publicUrlStatus({ url: 'http://127.0.0.1/x', lookup: publicLookup, fetchImpl: async () => ({ status: 404 }) })).toBe(0);
    expect(await publicUrlStatus({ url: 'https://example.com/x', lookup: publicLookup, fetchImpl: async () => { throw new Error('timeout'); } })).toBe(0);
  });
});

/* What comes back is text with blank lines between blocks, and the reader
   renders a body as HTML. Stored raw it is one unbroken run: saved, unreadable. */
describe('paragraphsToHtml', () => {
  it('gives each block its own paragraph', () => {
    expect(paragraphsToHtml('First block.\n\nSecond block.'))
      .toBe('<p>First block.</p>\n<p>Second block.</p>');
  });

  it('keeps a wrapped line inside its paragraph', () => {
    expect(paragraphsToHtml('A line\nand its wrap.')).toBe('<p>A line<br/>and its wrap.</p>');
  });

  it('has nothing to say about nothing', () => {
    expect(paragraphsToHtml('  \n\n  ')).toBe('');
    expect(paragraphsToHtml()).toBe('');
  });

  it('treats page text as text, not as markup', () => {
    expect(paragraphsToHtml('<script>alert("x")</script>'))
      .toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
  });
});

describe('filling in links that arrived bare', () => {
  const library = (records) => ({
    records,
    findOneAndUpdate: async ({ userId, url }, { $set }) => {
      const bare = records.find(record => record.userId === userId && record.url === url && !record.content);
      return bare ? Object.assign(bare, $set) : null;
    }
  });

  /* An export of a thousand links must not open a thousand sockets. */
  it('reads a few at a time', async () => {
    const urls = Array.from({ length: 7 }, (_v, index) => `https://example.com/${index}`);
    const Article = library(urls.map(url => ({ userId: 'u1', url, content: '' })));
    let open = 0;
    let most = 0;
    await fillArticleBodies({
      Article,
      userId: 'u1',
      urls,
      concurrency: 2,
      fetchBody: async (url) => {
        open += 1;
        most = Math.max(most, open);
        await new Promise(resolve => setTimeout(resolve, 5));
        open -= 1;
        return `<p>${url}</p>`;
      }
    });
    expect(most).toBe(2);
    expect(Article.records.every(record => record.content === `<p>${record.url}</p>`)).toBe(true);
  });

  /* A page that never answers, one that throws and one that read as a stub all
     leave the link as it was, and the rest still arrive. */
  it('leaves a link that will not read as a link, silently', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const Article = library([
      { userId: 'u1', url: 'https://slow.example', content: '' },
      { userId: 'u1', url: 'https://broken.example', content: '' },
      { userId: 'u1', url: 'https://stub.example', content: '' },
      { userId: 'u1', url: 'https://fine.example', content: '' }
    ]);
    const filled = [];
    await fillArticleBodies({
      Article,
      userId: 'u1',
      urls: Article.records.map(record => record.url),
      concurrency: 1,
      timeoutMs: 20,
      onFilled: article => filled.push(article.url),
      fetchBody: async (url) => {
        if (url.includes('slow')) return new Promise(() => {});
        if (url.includes('broken')) throw new Error('HTTP 403');
        if (url.includes('stub')) return '';
        return '<p>The piece.</p>';
      }
    });
    expect(Article.records.map(record => record.content)).toEqual(['', '', '', '<p>The piece.</p>']);
    expect(filled).toEqual(['https://fine.example']);
    warn.mockRestore();
  });

  /* A body the reader already has is theirs; the filler only writes into empty. */
  it('never overwrites a body that is already there', async () => {
    const Article = library([{ userId: 'u1', url: 'https://example.com/kept', content: '<p>Mine.</p>' }]);
    const onFilled = jest.fn();
    await fillArticleBodies({ Article, userId: 'u1', urls: ['https://example.com/kept'], onFilled, fetchBody: async () => '<p>Theirs.</p>' });
    expect(Article.records[0].content).toBe('<p>Mine.</p>');
    expect(onFilled).not.toHaveBeenCalled();
  });
});
