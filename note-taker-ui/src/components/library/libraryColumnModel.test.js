import { librarySubject, sourceLabel } from './libraryColumnModel';

const article = (overrides = {}) => ({
  _id: 'a1',
  title: 'A saved source',
  updatedAt: '2026-08-12T10:00:00.000Z',
  ...overrides
});

describe('sourceLabel', () => {
  it('prefers what the publication calls itself', () => {
    expect(sourceLabel(article({ source: 'SemiAnalysis' }))).toBe('SemiAnalysis');
    expect(sourceLabel(article({ publisher: 'Nvidia' }))).toBe('Nvidia');
  });

  it('falls back to the author, then to the site', () => {
    expect(sourceLabel(article({ author: 'James Dale Davidson' }))).toBe('James Dale Davidson');
    expect(sourceLabel(article({ url: 'https://www.semianalysis.com/p/spec' }))).toBe('Semianalysis');
  });

  it('says nothing rather than inventing a source', () => {
    expect(sourceLabel(article())).toBe('');
    expect(sourceLabel(article({ url: 'not a url' }))).toBe('');
  });
});

describe('librarySubject', () => {
  it('names the source being read', () => {
    expect(librarySubject({ article: { title: 'Inside the Model Spec' }, count: 12 }))
      .toBe('Inside the Model Spec');
  });

  it('counts the shelf when nothing is open', () => {
    expect(librarySubject({ count: 12 })).toBe('12 sources on the shelf.');
    expect(librarySubject({ count: 1 })).toBe('1 source on the shelf.');
    expect(librarySubject({ count: 0 })).toBe('Your library.');
  });
});
