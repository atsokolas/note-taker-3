import {
  buildAuthoredContinuationPath,
  buildCanonicalArticlePath,
  buildCanonicalHighlightPath,
  buildConceptPath,
  buildSourceOpenPath,
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

  it('opens a filing in Library when the owned article identity was recorded beside the SEC URL', () => {
    expect(resolveSourceDoors({
      type: 'external',
      title: 'CRWV 10-Q filed 2026-05-08',
      url: 'https://www.sec.gov/Archives/edgar/data/1769628/000176962826000123/crwv-20250331.htm',
      objectId: 'wiki-source-event-id',
      metadata: { articleId: 'library-10q', source: 'sec-edgar', ticker: 'CRWV' }
    })).toEqual({
      ownedHref: '/library?articleId=library-10q',
      originalHref: 'https://www.sec.gov/Archives/edgar/data/1769628/000176962826000123/crwv-20250331.htm',
      openHref: '/library?articleId=library-10q',
      isLibrary: true,
      isExternalOnly: false
    });
  });

  it('does not treat an external wrapper id as a Library article', () => {
    expect(resolveSourceDoors({
      type: 'external',
      objectId: 'wiki-source-event-id',
      url: 'https://www.sec.gov/Archives/edgar/data/1769628/q.htm'
    })).toEqual({
      ownedHref: '',
      originalHref: 'https://www.sec.gov/Archives/edgar/data/1769628/q.htm',
      openHref: 'https://www.sec.gov/Archives/edgar/data/1769628/q.htm',
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
    expect(buildSourceOriginPath('highlight:a1:h1')).toBe('/library?articleId=a1&highlightId=h1');
    expect(buildSourceOriginPath('article:a1')).toBe('/library?articleId=a1');
    expect(buildSourceOriginPath('overnight-event', 'https://example.com/source'))
      .toBe('https://example.com/source');
  });
});
