import {
  buildArticlePassageHref,
  buildAuthoredContinuationPath,
  buildCanonicalArticlePath,
  buildCanonicalHighlightPath,
  buildConceptPath,
  buildSourceOpenPath,
  buildPassagePath,
  buildSourceOriginPath,
  isExternalSourceHref,
  parseSourceOrigin,
  resolveSourceDoors
} from './sourceRoutes';

describe('sourceRoutes', () => {
  it('builds private continuation from identity, ignoring browser queries and prose', () => {
    expect(buildAuthoredContinuationPath({ articleId: 'a / 1', highlightId: 'h&1', href: 'https://elsewhere.test', draft: { writing: 'private' } }))
      .toBe('/library?articleId=a%20%2F%201&highlightId=h%261&exploration=1');
    expect(buildAuthoredContinuationPath({ pageId: 'p1', claimId: 'c?1' })).toBe('/wiki/read/p1?claimId=c%3F1&exploration=1');
    expect(buildAuthoredContinuationPath({ articleId: 'a1' })).toBe('');
    expect(buildAuthoredContinuationPath()).toBe('');
  });
  it('builds exact, encoded Library locations', () => {
    expect(buildCanonicalArticlePath('article / one')).toBe('/library?articleId=article%20%2F%20one');
    expect(buildCanonicalHighlightPath({ articleId: 'article-1', highlightId: 'highlight-1' }))
      .toBe('/library?articleId=article-1&highlightId=highlight-1');
    expect(buildCanonicalHighlightPath({ highlightId: 'highlight-1' }))
      .toBe('/library');
  });

  it('opens a concept by name and optional recorded version', () => {
    expect(buildConceptPath({ name: 'Room to be wrong' })).toBe('/think?tab=concepts&concept=Room+to+be+wrong');
    expect(buildConceptPath({
      name: 'Room to be wrong',
      conceptId: 'concept-1',
      versionId: 'abc'
    })).toBe('/think?tab=concepts&concept=Room+to+be+wrong&conceptId=concept-1&v=abc');
  });

  it('prefers an owned Library identity over the original public URL', () => {
    expect(buildSourceOpenPath({
      type: 'highlight',
      objectId: 'highlight-1',
      parentObjectId: 'article-1',
      url: 'https://example.com/original'
    })).toBe('/library?articleId=article-1&highlightId=highlight-1');
    expect(buildSourceOpenPath({
      type: 'article',
      objectId: 'article-1',
      url: 'https://example.com/original'
    })).toBe('/library?articleId=article-1');
    expect(buildSourceOpenPath({
      type: 'highlight',
      objectId: 'highlight-1',
      url: 'https://example.com/original'
    })).toBe('https://example.com/original');
  });

  it('keeps Library and original as separate doors', () => {
    expect(resolveSourceDoors({
      type: 'article',
      objectId: 'article-1',
      url: 'https://sec.gov/filing'
    })).toEqual({
      ownedHref: '/library?articleId=article-1',
      originalHref: 'https://sec.gov/filing',
      openHref: '/library?articleId=article-1',
      isLibrary: true,
      isExternalOnly: false,
      articleId: 'article-1',
      highlightId: ''
    });
    expect(resolveSourceDoors({
      type: 'external',
      url: 'https://sec.gov/filing'
    })).toEqual({
      ownedHref: '',
      originalHref: 'https://sec.gov/filing',
      openHref: 'https://sec.gov/filing',
      isLibrary: false,
      isExternalOnly: true,
      articleId: '',
      highlightId: ''
    });
  });

  it('opens a web source the server matched to a saved piece at the cited words', () => {
    const source = { type: 'external', parentObjectId: 'article-1', url: 'https://example.com/piece' };
    const doors = resolveSourceDoors(source, { passage: 'Price is what you pay.' });
    expect(doors.ownedHref).toBe(buildArticlePassageHref({
      articleId: 'article-1',
      anchor: { text: 'Price is what you pay.', prefix: '', suffix: '', startOffsetApprox: 0 }
    }));
    expect(doors).toMatchObject({ isLibrary: true, articleId: 'article-1', originalHref: 'https://example.com/piece' });
    expect(resolveSourceDoors(source, { passage: 'x'.repeat(601) }).ownedHref).toBe('/library?articleId=article-1');
    expect(resolveSourceDoors({ type: 'highlight', objectId: 'h-1', parentObjectId: 'article-1' }, { passage: 'Price' }))
      .toMatchObject({ ownedHref: '/library?articleId=article-1&highlightId=h-1', highlightId: 'h-1' });
    expect(resolveSourceDoors({ type: 'highlight', objectId: 'h-1' }).ownedHref).toBe('');
  });

  it('keeps real external sources external and rejects unsafe fallbacks', () => {
    expect(buildSourceOpenPath({ type: 'external', url: 'https://example.com/source' }))
      .toBe('https://example.com/source');
    expect(buildSourceOpenPath({ type: 'external', url: 'javascript:alert(1)' })).toBe('');
    expect(isExternalSourceHref('https://example.com')).toBe(true);
    expect(isExternalSourceHref('/library?articleId=1')).toBe(false);
  });

  it('resolves persisted evidence origins through the same contract', () => {
    expect(parseSourceOrigin('highlight:a1:h1')).toEqual({
      kind: 'highlight',
      articleId: 'a1',
      highlightId: 'h1'
    });
    expect(parseSourceOrigin('article:a1')).toEqual({
      kind: 'article',
      articleId: 'a1',
      highlightId: ''
    });
    expect(buildSourceOriginPath('article:a1', '', 'Renewals held.')).toMatch(/^\/library\?articleId=a1#passage=/);
    expect(buildSourceOriginPath('highlight:a1:h1')).toBe('/library?articleId=a1&highlightId=h1');
    expect(buildSourceOriginPath('article:a1')).toBe('/library?articleId=a1');
    expect(buildSourceOriginPath('overnight-event', 'https://example.com/source'))
      .toBe('https://example.com/source');
  });
});

describe('buildPassagePath', () => {
  it('opens a quote at its highlight, else at its words, else at the article', () => {
    expect(buildPassagePath({ articleId: 'a1', highlightId: 'h1', text: 'x' })).toBe('/library?articleId=a1&highlightId=h1');
    const href = buildPassagePath({ articleId: 'a1', text: 'Renewals held.' });
    expect(href.startsWith('/library?articleId=a1#passage=')).toBe(true);
    expect(JSON.parse(decodeURIComponent(href.split('#passage=')[1]))).toMatchObject({ articleId: 'a1', text: 'Renewals held.' });
    expect(buildPassagePath({ articleId: 'a1' })).toBe('/library?articleId=a1');
    expect(buildPassagePath({ text: 'orphan' })).toBe('');
  });
});
