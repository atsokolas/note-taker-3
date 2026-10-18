import { cleanImportedText, cleanSourceTextForDisplay, sourceTitle } from './sourceDisplayText';

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

  /* A source that never said its name is called by its site, then plainly. */
  it('names an untitled source by where it came from', () => {
    expect(sourceTitle({ title: '  The   Life of Cities ' })).toBe('The Life of Cities');
    expect(sourceTitle({ title: '', url: 'https://www.example.com/essays/attention' })).toBe('example.com');
    expect(sourceTitle({ url: 'import://kindle/meditations' })).toBe('Untitled');
    expect(sourceTitle(null)).toBe('Untitled');
  });
});
