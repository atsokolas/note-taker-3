import { sentenceBoundaryTrim } from './editorialText';

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
});
