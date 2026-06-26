import { cleanSourceTextForDisplay } from './ideaWorkbenchText';

describe('cleanSourceTextForDisplay', () => {
  it('removes imported template artifacts from article and note previews', () => {
    expect(cleanSourceTextForDisplay(
      'Name: The Intelligent Investor | URL: https://example.com/book | Reading Time: 12 minutes. ( attr(href) ) Thought and Opinion'
    )).toBe('The Intelligent Investor');
  });

  it('keeps useful prose while normalizing separators', () => {
    expect(cleanSourceTextForDisplay(
      'Margin of safety | Buying at a discount protects against mistakes.'
    )).toBe('Margin of safety · Buying at a discount protects against mistakes.');
  });
});
