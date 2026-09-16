import {
  librarySearchRows,
  librarySearchSilence,
  needleFromQuestion,
  passageIsStale,
  passageSpeaksToQuery,
  qualifyLibraryRows
} from './libraryPassageRetrieval';

describe('libraryPassageRetrieval', () => {
  it('turns a saved question into a bounded Library needle', () => {
    expect(needleFromQuestion('Who bears the downside?')).toBe('bears downside');
    expect(needleFromQuestion('I cannot tell which mistakes are recoverable.')).toBe(
      'cannot tell mistakes recoverable'
    );
    expect(needleFromQuestion('Who?')).toBe('');
  });

  it('keeps a passage that shares a content word with the request', () => {
    expect(passageSpeaksToQuery({
      title: 'Nomad',
      passage: 'A wrong turn can still leave another attempt.'
    }, 'Nomad')).toBe(true);
    expect(passageSpeaksToQuery({
      title: 'Household routines',
      passage: 'Patience is not the same as avoidance.'
    }, 'bears downside')).toBe(false);
  });

  it('treats a saved highlight whose words left the article as stale', () => {
    expect(passageIsStale({
      passage: 'A wrong turn can still leave another attempt.',
      articleText: 'Getting lost was part of the work. A wrong turn can still leave another attempt.'
    })).toBe(false);
    expect(passageIsStale({
      passage: 'A wrong turn can still leave another attempt.',
      articleText: 'The later edition dropped the wandering sentence.'
    })).toBe(true);
  });

  it('drops archived, debug-only, and cruft titles, and keeps exact duplicates for the already-used label', () => {
    const rows = librarySearchRows({
      articles: [
        { _id: 'kept', title: 'Nomad', content: 'A wrong turn can still leave another attempt.' },
        { _id: 'kept', title: 'Nomad duplicate identity', content: 'Ignored.' },
        { _id: 'debug', title: 'debug scratch', debugOnly: true, content: 'Nomad' },
        { _id: 'qa', title: 'qa public wiki 1234567890123', content: 'Nomad' }
      ],
      highlights: [{
        _id: 'h1',
        articleId: 'kept',
        articleTitle: 'Nomad',
        text: 'A wrong turn can still leave another attempt.'
      }]
    });
    const qualified = qualifyLibraryRows(rows, { query: 'Nomad', mode: 'search' });
    expect(qualified.map((row) => row.key)).toEqual([
      'highlight:kept:h1',
      'article:kept'
    ]);
  });

  it('names a useful non-result against the actual question', () => {
    expect(librarySearchSilence({
      query: 'bears downside',
      boundQuestion: 'Who bears the downside?'
    })).toBe('Nothing you already have speaks to “bears downside”.');
    expect(librarySearchSilence({ query: 'Nomad' })).toBe('Nothing in your Library matches “Nomad”.');
  });
});
