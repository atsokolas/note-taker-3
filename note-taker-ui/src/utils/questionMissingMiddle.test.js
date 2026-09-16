import {
  herePhrase,
  missingMiddleSilence,
  passageConnectsRemainder,
  proposeMissingMiddle,
  unconnectedRemainder
} from './questionMissingMiddle';

describe('questionMissingMiddle', () => {
  it('names the part of the question that placed sources have not yet touched', () => {
    expect(unconnectedRemainder('Who bears the downside?', [{
      passage: 'A wrong turn can still leave another attempt.'
    }])).toBe('bears downside');
    expect(unconnectedRemainder('Who bears the downside?', [{
      passage: 'Someone still bears the downside of a recoverable mistake.'
    }])).toBe('');
    expect(herePhrase('Who bears the downside?', 'bears downside')).toBe('Who bears the downside?');
  });

  it('keeps a Library line only when its passage, not its title, speaks to the unconnected part', () => {
    expect(passageConnectsRemainder({
      title: 'Downside notes',
      passage: 'Tuesday is laundry.'
    }, 'bears downside')).toBe(false);
    expect(passageConnectsRemainder({
      title: 'Household letter',
      passage: 'Someone still bears the downside of a recoverable mistake.'
    }, 'bears downside')).toBe(true);
  });

  it('returns one inspectable bridge or a named miss', async () => {
    const search = jest.fn().mockResolvedValue({
      articles: [{
        _id: 'letter',
        title: 'Household letter',
        content: 'Someone still bears the downside of a recoverable mistake.'
      }],
      highlights: []
    });
    const found = await proposeMissingMiddle({
      question: 'Who bears the downside?',
      placed: [{ passage: 'Patience is not the same as avoidance.' }],
      search
    });
    expect(search).toHaveBeenCalledWith({
      q: 'Who bears the downside?',
      type: ['article', 'highlight']
    });
    expect(found.status).toBe('found');
    expect(found.here).toBe('Who bears the downside?');
    expect(found.proposal).toEqual(expect.objectContaining({
      title: 'Household letter',
      passage: expect.stringMatching(/bears the downside/),
      href: '/library?articleId=letter'
    }));

    const miss = await proposeMissingMiddle({
      question: 'Who bears the downside?',
      placed: [{ passage: 'Someone still bears the downside of a recoverable mistake.' }],
      search: jest.fn()
    });
    expect(miss.status).toBe('miss');
    expect(miss.proposal).toBe(null);
    expect(miss.silence).toBe(missingMiddleSilence({ remainder: '', uncovered: true }));
    expect(miss.silence).toBe('Nothing left unconnected here.');
  });
});
