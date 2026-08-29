import {
  buildFolioLine,
  claimIdFromSearch,
  connectedJudgmentIds,
  lastOpenedJudgment,
  pageSpeaksToSource,
  pickFolioLine,
  pickFolioPage,
  rememberOpenedJudgment,
  sourceRefTouchesArticle
} from './folioModel';

const articleId = 'article-1';

const claim = (id, extras = {}) => ({
  _id: id,
  title: extras.title ?? extras.currentJudgment ?? 'A claim.',
  updatedAt: extras.updatedAt || '2026-08-01T00:00:00.000Z',
  evergreen: Boolean(extras.evergreen),
  sourceRefs: extras.sourceRefs || [{
    _id: `src-${id}`,
    type: 'article',
    objectId: extras.objectId || articleId
  }],
  judgment: {
    currentJudgment: extras.currentJudgment || 'Compute stays scarce.',
    why: extras.why || [],
    against: extras.against || []
  }
});

describe('pageSpeaksToSource', () => {
  it('is true when the page ledger holds this article', () => {
    expect(pageSpeaksToSource(claim('p1'), articleId)).toBe(true);
  });

  it('is true when a highlight of this article is on the ledger', () => {
    const page = claim('p1', {
      objectId: 'other',
      sourceRefs: [{ _id: 'src-h', type: 'highlight', objectId: 'h1' }]
    });
    expect(pageSpeaksToSource(page, articleId, { highlightIds: ['h1'] })).toBe(true);
    expect(pageSpeaksToSource(page, articleId, { highlightIds: ['h-other'] })).toBe(false);
  });

  it('is true when a Why line was filed from this library source', () => {
    const page = claim('p1', {
      objectId: 'other',
      why: [{
        reasonId: 'w1',
        text: 'A passage from the filing.',
        acceptedFrom: 'highlight:article-1:h1'
      }]
    });
    expect(pageSpeaksToSource(page, articleId)).toBe(true);
  });

  it('is true when the graph already ties this source to the claim', () => {
    const page = claim('p1', { objectId: 'other' });
    expect(pageSpeaksToSource(page, articleId, { connectedPageIds: ['p1'] })).toBe(true);
  });

  it('is silent when the article is unrelated', () => {
    expect(pageSpeaksToSource(claim('p1', { objectId: 'article-9' }), articleId)).toBe(false);
  });

  it('is silent when there is no opinion sentence', () => {
    const page = {
      _id: 'p1',
      title: 'Empty',
      sourceRefs: [{ type: 'article', objectId: articleId }],
      judgment: { why: [{ text: 'A reason.', sourceRefIds: [] }] }
    };
    expect(pageSpeaksToSource(page, articleId)).toBe(false);
  });
});

describe('sourceRefTouchesArticle', () => {
  it('matches the owned article id, not the source-ref wrapper', () => {
    expect(sourceRefTouchesArticle({ _id: 'src-1', type: 'article', objectId: articleId }, articleId)).toBe(true);
    expect(sourceRefTouchesArticle({ _id: articleId, type: 'article', objectId: 'other' }, articleId)).toBe(false);
  });
});

describe('connectedJudgmentIds', () => {
  it('reads wiki pages and claims from both directions of the graph', () => {
    expect(connectedJudgmentIds({
      outgoing: [{ toType: 'wiki_page', toId: 'wiki-a' }],
      incoming: [{ fromType: 'wiki_claim', fromId: 'wiki_claim:wiki-b:c1' }]
    })).toEqual(['wiki-a', 'wiki-b']);
  });
});

describe('pickFolioPage', () => {
  const older = claim('older', {
    currentJudgment: 'The older claim.',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  const newer = claim('newer', {
    currentJudgment: 'The newer claim.',
    updatedAt: '2026-08-20T00:00:00.000Z'
  });
  const kept = claim('kept', {
    currentJudgment: 'The kept claim.',
    updatedAt: '2026-02-01T00:00:00.000Z',
    evergreen: true
  });

  it('prefers the claim named on the URL', () => {
    expect(pickFolioPage([newer, older], {
      articleId,
      preferredId: 'older'
    })?._id).toBe('older');
  });

  it('prefers the claim that was just open', () => {
    expect(pickFolioPage([newer, older], {
      articleId,
      recentlyOpenedId: 'older'
    })?._id).toBe('older');
  });

  it('prefers a kept claim when nothing else says which', () => {
    expect(pickFolioPage([newer, kept], { articleId })?._id).toBe('kept');
  });

  it('falls back to the most recently updated related claim', () => {
    expect(pickFolioPage([older, newer], { articleId })?._id).toBe('newer');
  });

  it('returns one page, never a stack', () => {
    const picked = pickFolioPage([older, newer, kept], { articleId });
    expect(picked?._id).toBe('kept');
  });
});

describe('the folio line', () => {
  it('is the opinion sentence, even when the case has a name', () => {
    const page = claim('named', {
      title: 'NVIDIA',
      currentJudgment: 'Demand still outruns deliverable capacity.'
    });
    expect(buildFolioLine(page)).toEqual({
      id: 'named',
      text: 'Demand still outruns deliverable capacity.',
      href: '/judgment/named'
    });
  });

  it('still uses the opinion when the case is unnamed', () => {
    const sentence = 'A written process improves judgment.';
    const page = claim('unnamed', { title: sentence, currentJudgment: sentence });
    expect(buildFolioLine(page).text).toBe(sentence);
    expect(buildFolioLine(page).text).not.toMatch(/^Untitled/);
  });

  it('is absent when nothing related is held', () => {
    expect(pickFolioLine([claim('p1', { objectId: 'other' })], { articleId })).toBeNull();
    expect(pickFolioLine([], { articleId })).toBeNull();
  });

  it('reads a claim id off the library query', () => {
    expect(claimIdFromSearch('?articleId=a1&judgment=wiki-nvidia')).toBe('wiki-nvidia');
    expect(claimIdFromSearch('claim=wiki-2')).toBe('wiki-2');
  });
});

describe('remembering the open claim', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('lets a later source prefer the claim you were just in', () => {
    rememberOpenedJudgment('wiki-nvidia');
    expect(lastOpenedJudgment()).toBe('wiki-nvidia');
    expect(pickFolioLine([
      claim('other', { currentJudgment: 'Rates still matter.', updatedAt: '2026-08-29T00:00:00.000Z' }),
      claim('wiki-nvidia', { currentJudgment: 'Compute stays scarce.', updatedAt: '2026-01-01T00:00:00.000Z' })
    ], { articleId })?._id).toBe('wiki-nvidia');
  });
});
