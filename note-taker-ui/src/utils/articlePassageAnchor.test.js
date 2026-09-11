import {
  ARTICLE_PASSAGE_CONTEXT_LIMIT,
  ARTICLE_PASSAGE_FRAGMENT_LIMIT,
  ARTICLE_PASSAGE_TEXT_LIMIT,
  buildArticlePassageHref,
  markExactArticlePassage,
  readArticlePassageFragment,
  resolveExactArticlePassage
} from './articlePassageAnchor';

const articleId = 'article-1';
const anchor = {
  text: 'room to be wrong',
  prefix: 'There must be ',
  suffix: ' without losing the next attempt.',
  startOffsetApprox: 14
};

describe('article passage fragments', () => {
  it('round trips a bounded exact anchor with the owned article identity', () => {
    const href = buildArticlePassageHref({ articleId, anchor });
    expect(href).toMatch(/^\/library\?articleId=article-1#passage=/);
    expect(readArticlePassageFragment(href.slice(href.indexOf('#')), articleId)).toEqual({
      status: 'ready',
      anchor
    });
  });

  it('ignores a valid passage fragment on a different article', () => {
    const hash = buildArticlePassageHref({ articleId, anchor }).split('#')[1];
    expect(readArticlePassageFragment(`#${hash}`, 'article-2').status).toBe('article-mismatch');
  });

  it('rejects malformed and oversized fragments', () => {
    expect(readArticlePassageFragment('#passage=%7Bbad', articleId).status).toBe('malformed');
    const huge = `#passage=${'x'.repeat(ARTICLE_PASSAGE_FRAGMENT_LIMIT + 1)}`;
    expect(readArticlePassageFragment(huge, articleId).status).toBe('oversize');
    expect(buildArticlePassageHref({
      articleId,
      anchor: { ...anchor, text: 'x'.repeat(ARTICLE_PASSAGE_TEXT_LIMIT + 1) }
    })).toBe('');
    const oversizedContext = encodeURIComponent(JSON.stringify({
      v: 1,
      articleId,
      ...anchor,
      prefix: 'x'.repeat(ARTICLE_PASSAGE_CONTEXT_LIMIT + 1)
    }));
    expect(readArticlePassageFragment(`#passage=${oversizedContext}`, articleId).status).toBe('malformed');
  });
});

describe('exact article passage resolution', () => {
  const text = 'There must be room to be wrong without losing the next attempt.';

  it('requires the exact text and exact surrounding context', () => {
    expect(resolveExactArticlePassage(text, anchor)).toMatchObject({ status: 'found', start: 14 });
    expect(resolveExactArticlePassage(text, { ...anchor, prefix: 'There might be ' }).status).toBe('missing');
    expect(resolveExactArticlePassage(text, { ...anchor, text: 'room to become wrong' }).status).toBe('missing');
  });

  it('uses the recorded exact offset only to disambiguate repeated exact contexts', () => {
    const repeated = 'same phrase / same phrase';
    const repeatedAnchor = { text: 'same phrase', prefix: '', suffix: '', startOffsetApprox: 14 };
    expect(resolveExactArticlePassage(repeated, repeatedAnchor)).toMatchObject({ status: 'found', start: 14 });
    expect(resolveExactArticlePassage(repeated, { ...repeatedAnchor, startOffsetApprox: 2 }).status).toBe('ambiguous');
  });

  it('marks a transient mixed-node passage without creating a saved highlight', () => {
    const doc = new DOMParser().parseFromString('<p>There must be room <em>to be</em> wrong without losing the next attempt.</p>', 'text/html');
    expect(markExactArticlePassage(doc.body, anchor).status).toBe('found');
    const transient = [...doc.querySelectorAll('[data-transient-passage="true"]')];
    expect(transient.map((node) => node.textContent).join('').replace(/\s+/g, ' ').trim()).toBe('room to be wrong');
    expect(doc.querySelector('[data-highlight-id]')).toBeNull();
    expect(doc.querySelector('mark.highlight')).toBeNull();
  });

  it('maps a cleaned passage past a colliding removed Name label', () => {
    const doc = new DOMParser().parseFromString('<p>Name: Name matters.</p>', 'text/html');
    const exact = {
      text: 'Name matters.',
      prefix: '',
      suffix: '',
      startOffsetApprox: 0
    };

    expect(markExactArticlePassage(doc.body, exact).status).toBe('found');
    expect(doc.querySelector('[data-transient-passage="true"]').textContent).toBe('Name matters.');
    expect(doc.body.textContent).toBe('Name: Name matters.');
  });

  it('maps beyond a removed URL and leaves saved highlight markup intact', () => {
    const doc = new DOMParser().parseFromString(
      '<p>URL: https://example.com/chosen</p><p><mark class="highlight" data-highlight-id="highlight-saved">Saved phrase</mark> before Chosen after URL.</p>',
      'text/html'
    );
    const exact = {
      text: 'Chosen after URL.',
      prefix: 'Saved phrase before ',
      suffix: '',
      startOffsetApprox: 20
    };

    expect(markExactArticlePassage(doc.body, exact).status).toBe('found');
    expect(doc.querySelector('[data-transient-passage="true"]').textContent).toBe('Chosen after URL.');
    expect(doc.querySelectorAll('mark.highlight[data-highlight-id="highlight-saved"]')).toHaveLength(1);
    expect(doc.querySelector('mark.highlight').textContent).toBe('Saved phrase');
  });
});
