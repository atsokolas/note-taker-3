import { sentenceBoundaryTrim, wordBoundaryTrim } from './editorialText';

describe('editorialText', () => {
  it('keeps a complete sentence under the budget', () => {
    expect(sentenceBoundaryTrim('The morning paper has a finished lead. The second sentence keeps running with extra material about sources, graph drift, and multiple page updates that would otherwise get cut awkwardly in the middle of the thought.', { maxLength: 96 }))
      .toBe('The morning paper has a finished lead.');
  });

  it('renders in full when the text already fits', () => {
    expect(sentenceBoundaryTrim('A short belief the owner can hold.', { maxLength: 80 }))
      .toBe('A short belief the owner can hold.');
  });

  it('never amputates mid-word when no sentence fits', () => {
    const value = 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries debugging only the v';
    expect(sentenceBoundaryTrim(value, { maxLength: 80, fallback: '' })).toBe('');
    expect(sentenceBoundaryTrim(value, { maxLength: 80, fallback: '' })).not.toMatch(/…/);
    expect(sentenceBoundaryTrim(value, { maxLength: 80, fallback: '' })).not.toMatch(/\bv$/);
  });

  it('refuses Exhibit A instead of rendering a mid-word cut', () => {
    const exhibitA = 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries… WikiRepoCreateComposer, createRepoWikiFromGitHub, POST /api/wiki/pages/from-github… debugging only the v…';
    expect(sentenceBoundaryTrim(exhibitA, { maxLength: 80, fallback: '' })).toBe('');
    expect(sentenceBoundaryTrim(exhibitA, { maxLength: 80, fallback: '' })).not.toMatch(/the v…$/);
  });

  describe('wordBoundaryTrim', () => {
    it('never splits a word — the defect T6 exists to kill', () => {
      const trimmed = wordBoundaryTrim('debugging only the very last boundary case', { maxLength: 22 });
      expect(trimmed).toBe('debugging only the…');
      expect(trimmed).not.toMatch(/\bv…$/);
    });

    it('lands on a clause boundary when one falls late in the budget', () => {
      expect(wordBoundaryTrim('CoreWeave is a leveraged time-to-capacity business, converting scarce accelerators', { maxLength: 60 }))
        .toBe('CoreWeave is a leveraged time-to-capacity business…');
    });

    it('ignores a clause boundary that would throw away most of the budget', () => {
      expect(wordBoundaryTrim('Yes, the rest of this sentence carries all of the meaning worth keeping', { maxLength: 40 }))
        .toBe('Yes, the rest of this sentence carries…');
    });

    it('renders in full when the text already fits', () => {
      expect(wordBoundaryTrim('short enough', { maxLength: 40 })).toBe('short enough');
    });

    it('keeps a whole word that ends exactly on the budget', () => {
      expect(wordBoundaryTrim('alpha beta gamma', { maxLength: 10 })).toBe('alpha beta…');
    });

    it('collapses whitespace before measuring', () => {
      expect(wordBoundaryTrim('  alpha   beta   gamma  ', { maxLength: 10 })).toBe('alpha beta…');
    });

    it('hard-cuts only an unbroken token with no boundary to find', () => {
      expect(wordBoundaryTrim('supercalifragilisticexpialidocious', { maxLength: 10 })).toBe('supercalif…');
    });

    it('returns empty for empty input', () => {
      expect(wordBoundaryTrim('', { maxLength: 10 })).toBe('');
      expect(wordBoundaryTrim(null, { maxLength: 10 })).toBe('');
    });
  });
});
