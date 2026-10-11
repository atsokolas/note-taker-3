import {
  extraSentenceNotice,
  linkLabel,
  markMatches,
  passageTitle,
  passagesHeadline,
  readPastedReading,
  readwiseReceipt,
  savedOn,
  viewProblem
} from './welcomeModel';

describe('welcomeModel', () => {
  it('asks for a sentence, not a topic', () => {
    expect(viewProblem('Costco')).toMatch(/sentence someone could disagree with/);
    expect(viewProblem('Costco is hard to compete with.')).toBe('');
    expect(viewProblem('')).toBe('');
  });

  it('says so when only the first of several sentences will be held', () => {
    expect(extraSentenceNotice('Costco is hard to beat. Its fees prove it.')).toMatch(/first sentence/);
    expect(extraSentenceNotice('Costco is hard to beat.')).toBe('');
    expect(extraSentenceNotice('Costco is hard to beat')).toBe('');
  });

  it('reads links out of whatever was pasted, once each', () => {
    const { urls } = readPastedReading('Read https://a.com/x, then https://b.com/y.\nhttps://a.com/x');
    expect(urls).toEqual(['https://a.com/x', 'https://b.com/y']);
  });

  it('takes a long passage as one source and refuses a short one', () => {
    expect(readPastedReading('A short thought.').problem).toMatch(/too short/);
    const long = Array(40).fill('word').join(' ');
    expect(readPastedReading(long)).toEqual({ urls: [], prose: long, problem: '' });
  });

  it('names a link by where it points until its page answers', () => {
    expect(linkLabel('https://www.example.com/essays/remote/')).toBe('example.com/essays/remote');
    expect(linkLabel('https://example.com/')).toBe('example.com');
  });

  it('names a pasted passage by how it begins', () => {
    expect(passageTitle('Remote teams write. They meet less.')).toBe('Remote teams write');
    expect(passageTitle('Remote teams that write things down make better decisions than teams that rely on meetings.'))
      .toBe('Remote teams that write things down make better decisions…');
  });

  it('counts passages in words', () => {
    expect(passagesHeadline(1)).toBe('One passage you saved bears on this.');
    expect(passagesHeadline(3)).toBe('Three passages you saved bear on this.');
    expect(passagesHeadline(12)).toBe('12 passages you saved bear on this.');
  });

  it('marks the words that brought a passage here, and nothing else', () => {
    const segments = markMatches('Written decisions outlast meetings.', ['written', 'meeting']);
    expect(segments.filter(segment => segment.match).map(segment => segment.text)).toEqual(['Written', 'meetings.']);
    expect(segments.map(segment => segment.text).join('')).toBe('Written decisions outlast meetings.');
    expect(markMatches('Nothing here.', [])).toEqual([{ text: 'Nothing here.', match: false }]);
  });

  it('says what came in from Readwise in plain numbers', () => {
    expect(readwiseReceipt({ importedHighlights: 1, importedArticles: 1 })).toBe('1 highlight from 1 source came in from Readwise.');
    expect(readwiseReceipt({})).toBe('Readwise is connected. Nothing new came in.');
  });

  it('dates a save without the year when it is this year', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    expect(savedOn('2026-10-09T12:00:00Z', now)).toBe('saved Oct 9');
    expect(savedOn('2025-03-02T12:00:00Z', now)).toBe('saved Mar 2, 2025');
    expect(savedOn('', now)).toBe('');
  });
});
