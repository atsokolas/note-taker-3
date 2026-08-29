import { cleanImportedText, cleanSourceTextForDisplay } from './sourceDisplayText';

describe('sourceDisplayText', () => {
  it('cleans template artifacts without erasing useful prose', () => {
    expect(cleanSourceTextForDisplay(
      'Name: The Intelligent Investor | URL: https://example.com/book | Reading Time: 12 minutes. ( attr(href) ) Thought and Opinion'
    )).toBe('The Intelligent Investor');
  });

  it('renders raw wiki-link syntax as readable text', () => {
    expect(cleanImportedText('See [[Margin of Safety]] for the underlying idea.'))
      .toBe('See Margin of Safety for the underlying idea.');
  });
});
