import {
  buildFailure,
  extraSentenceNotice,
  linkLabel,
  markMatches,
  passageTitle,
  pageLede,
  pageState,
  passagesHeadline,
  readPastedReading,
  readwiseReceipt,
  savedOn,
  topicProblem,
  viewProblem,
  tookPath,
  tookReceipt,
  writtenFrom
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
    expect(passageTitle('Why checklists beat expertise\n\nIn fields where failure costs lives.')).toBe('Why checklists beat expertise');
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

  it('takes a topic in a few words and sends a sentence on to the view', () => {
    expect(topicProblem('Costco')).toBe('');
    expect(topicProblem('')).toMatch(/Name what the page/);
    expect(topicProblem('Costco membership fees make it very hard to compete with')).toMatch(/few words/);
  });

  it('reads where a build stands off the page', () => {
    expect(pageState(null)).toBe('none');
    expect(pageState({ aiState: { draftStatus: 'maintaining' } })).toBe('writing');
    expect(pageState({ aiState: { draftStatus: 'error' } })).toBe('failed');
    expect(pageState({ aiState: { draftStatus: 'ready' } })).toBe('written');
    expect(pageState({})).toBe('written');
  });

  it('says a refused build stopped rather than invent, and offers no retry', () => {
    const refused = buildFailure({ title: 'Costco', aiState: { errorCode: 'WIKI_CANDIDATE_REJECTED' } });
    expect(refused.headline).toBe('Your reading does not say enough about Costco yet.');
    expect(refused.retry).toBe(false);
    expect(buildFailure({ aiState: { errorCode: 'WIKI_ASYNC_BUILD_TIMED_OUT' } }).retry).toBe(true);
  });

  it('offers a retry when every claim was backed and only a wording check refused it', () => {
    const backed = { metrics: { topicallyGroundedSourceCount: 3, unsupported: 0, claimCount: 9, cited: 9 } };
    const held = buildFailure({ title: 'Loss aversion', aiState: { errorCode: 'WIKI_CANDIDATE_REJECTED', lastCandidateQuality: backed } });
    expect(held.headline).toBe('Loss aversion did not pass the last check.');
    expect(held.retry).toBe(true);
    const unbacked = { metrics: { topicallyGroundedSourceCount: 3, unsupported: 2 } };
    expect(buildFailure({ aiState: { errorCode: 'WIKI_CANDIDATE_REJECTED', lastCandidateQuality: unbacked } }).retry).toBe(false);
    const uncited = { metrics: { topicallyGroundedSourceCount: 3, unsupported: 0, claimCount: 9, cited: 6, uncitedSupported: 3 } };
    expect(buildFailure({ aiState: { errorCode: 'WIKI_CANDIDATE_REJECTED', lastCandidateQuality: uncited } }).retry).toBe(false);
  });

  it('opens the page on its first real paragraph', () => {
    const page = { plainText: '# Costco\n\nShort.\n\nCostco charges a fee up front, and the fee is most of its profit, so prices can sit near cost.' };
    expect(pageLede(page)).toMatch(/^Costco charges a fee/);
    expect(pageLede({})).toBe('');
  });

  it('counts the sources a page was written from', () => {
    expect(writtenFrom(0)).toBe('Your first page is written.');
    expect(writtenFrom(1)).toBe('Your first page is written, from one of your sources.');
    expect(writtenFrom(3)).toBe('Your first page is written, from three of your sources.');
  });

  it('lands a taken wiki in first run with what came into the Library', () => {
    expect(tookPath('p 1')).toBe('/welcome?took=p+1');
    expect(tookPath('p1', { sources: 5, alreadyHad: 1 })).toBe('/welcome?took=p1&sources=5&had=1');
    expect(tookReceipt()).toBe('The wiki you took is in your Wiki now.');
    expect(tookReceipt({ sources: 1, had: 0 })).toBe('The wiki you took is in your Wiki, and its source is in your Library.');
    expect(tookReceipt({ sources: 5, had: 1 })).toBe('The wiki you took is in your Wiki, and its five sources are in your Library. One of them you had already saved.');
    expect(tookReceipt({ sources: 5, had: 5 })).toBe('The wiki you took is in your Wiki, and its five sources are in your Library. You had already saved every one.');
  });
});
