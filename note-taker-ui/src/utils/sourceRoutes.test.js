import {
  buildCanonicalArticlePath,
  buildCanonicalHighlightPath,
  buildSourceOpenPath,
  buildSourceOriginPath,
  isExternalSourceHref,
  resolveSourceDoors
} from './sourceRoutes';

describe('sourceRoutes', () => {
  it('builds exact, encoded Library locations', () => {
    expect(buildCanonicalArticlePath('article / one')).toBe('/library?articleId=article%20%2F%20one');
    expect(buildCanonicalHighlightPath({ articleId: 'article-1', highlightId: 'highlight-1' }))
      .toBe('/library?articleId=article-1&highlightId=highlight-1');
    expect(buildCanonicalHighlightPath({ highlightId: 'highlight-1' }))
      .toBe('/library');
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
      isExternalOnly: false
    });
    expect(resolveSourceDoors({
      type: 'external',
      url: 'https://sec.gov/filing'
    })).toEqual({
      ownedHref: '',
      originalHref: 'https://sec.gov/filing',
      openHref: 'https://sec.gov/filing',
      isLibrary: false,
      isExternalOnly: true
    });
  });

  it('keeps real external sources external and rejects unsafe fallbacks', () => {
    expect(buildSourceOpenPath({ type: 'external', url: 'https://example.com/source' }))
      .toBe('https://example.com/source');
    expect(buildSourceOpenPath({ type: 'external', url: 'javascript:alert(1)' })).toBe('');
    expect(isExternalSourceHref('https://example.com')).toBe(true);
    expect(isExternalSourceHref('/library?articleId=1')).toBe(false);
  });

  it('resolves persisted evidence origins through the same contract', () => {
    expect(buildSourceOriginPath('highlight:a1:h1')).toBe('/library?articleId=a1&highlightId=h1');
    expect(buildSourceOriginPath('article:a1')).toBe('/library?articleId=a1');
    expect(buildSourceOriginPath('overnight-event', 'https://example.com/source'))
      .toBe('https://example.com/source');
  });
});
