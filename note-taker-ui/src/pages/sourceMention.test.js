import {
  clearMention,
  PICKER_LIMIT,
  rankSourceOptions,
  readMention,
  sourcesFromSearch
} from './sourceMention';

describe('reaching for a source', () => {
  it('opens on @ at the start of a line', () => {
    expect(readMention('@', 1)).toMatchObject({ query: '', from: 0, to: 1 });
  });

  it('opens on @ after a space, and reads up to the caret', () => {
    expect(readMention('Lead times are stretching @semi', 31)).toMatchObject({ query: 'semi', from: 26 });
  });

  /* A two-word title has a space in it. Ending the query at the next space
     would close the picker halfway through typing "Morning Brew". */
  it('keeps reading through a space, because titles have them', () => {
    expect(readMention('@Morning Brew', 13).query).toBe('Morning Brew');
  });

  it('leaves an address alone', () => {
    expect(readMention('write to me@example.com', 23)).toBeNull();
  });

  it('closes on a newline', () => {
    expect(readMention('@semi\nnext line', 15)).toBeNull();
  });

  it('says nothing when there is no mark, or the caret is before it', () => {
    expect(readMention('no mark here', 12)).toBeNull();
    expect(readMention('a @mark', 1)).toBeNull();
    expect(readMention('')).toBeNull();
  });

  it('reads from the end when nobody says where the caret is', () => {
    expect(readMention('Lead times @semi').query).toBe('semi');
  });
});

describe('what the sentence keeps', () => {
  /* The mention is a gesture, not text. Once a source is chosen the line
     should read as though you had simply written it. */
  it('takes the reach back out, and the space with it', () => {
    const draft = 'Lead times are stretching @semi';
    expect(clearMention(draft, readMention(draft, draft.length))).toBe('Lead times are stretching');
  });

  it('closes the gap when the reach was mid-sentence', () => {
    const draft = 'Lead times @semi are stretching';
    expect(clearMention(draft, readMention(draft, 16))).toBe('Lead times are stretching');
  });

  it('leaves a line with no reach in it exactly as written', () => {
    expect(clearMention('Lead times are stretching', null)).toBe('Lead times are stretching');
  });
});

describe('what gets offered', () => {
  const bound = [
    { id: 'a', label: 'SemiAnalysis — wafer economics', href: '/articles/a' },
    { id: 'b', label: 'Costco 10-K', href: '/articles/b' }
  ];

  /* The reader bound these to this belief, which says more about relevance
     than any query does. */
  it('puts what is already on the case first', () => {
    const options = rankSourceOptions({ bound, found: [{ id: 'z', label: 'Something else' }] });
    expect(options.map(option => option.origin)).toEqual(['bound', 'bound', 'library']);
  });

  it('filters the bound list by what is being typed', () => {
    expect(rankSourceOptions({ bound, query: 'costco' }).map(option => option.id)).toEqual(['b']);
  });

  it('does not list the same source under two headings', () => {
    const options = rankSourceOptions({ bound, found: [{ id: 'a', label: 'SemiAnalysis — wafer economics' }] });
    expect(options.filter(option => option.id === 'a')).toHaveLength(1);
  });

  it('drops a source with nothing to call it', () => {
    expect(rankSourceOptions({ found: [{ id: 'x', label: '  ' }] })).toEqual([]);
  });

  it('offers nothing rather than an empty row when nothing matches', () => {
    expect(rankSourceOptions({ bound, query: 'nothing like this' })).toEqual([]);
    expect(rankSourceOptions({})).toEqual([]);
  });

  /* A shelf of Berkshire letters is twenty rows of one title. A picker that
     prints it four times is asking the reader to guess. */
  it('tells sources of the same name apart by their own address', () => {
    const options = rankSourceOptions({
      found: [
        { id: '1', label: 'To the Shareholders', url: 'https://www.berkshirehathaway.com/letters/1994.html' },
        { id: '2', label: 'To the Shareholders', url: 'https://www.berkshirehathaway.com/letters/1995.html' }
      ]
    });
    expect(options.map(option => option.detail)).toEqual(['1994', '1995']);
  });

  it('says nothing extra about a source with a name of its own', () => {
    const [only] = rankSourceOptions({
      found: [{ id: '1', label: 'A distinct piece', url: 'https://example.com/a-distinct-piece' }]
    });
    expect(only.detail).toBeUndefined();
  });

  /* A picker is a shortlist. Twenty rows is a search results page. */
  it('keeps the list short', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ id: `s${index}`, label: `Source ${index}` }));
    expect(rankSourceOptions({ found: many })).toHaveLength(PICKER_LIMIT);
  });
});

describe('the library’s answer', () => {
  /* Search answers in kinds — { articles, highlights, notebook } — and the two
     that can be cited on a belief are the first two. */
  it('speaks the picker’s shape', () => {
    expect(sourcesFromSearch({
      articles: [{ _id: 'a1', title: 'A source', url: 'https://example.com/a' }],
      highlights: []
    })).toEqual([{ id: 'a1', label: 'A source', url: 'https://example.com/a', href: '/articles/a1' }]);
  });

  it('reads a highlight back to the piece it was taken from', () => {
    expect(sourcesFromSearch({
      articles: [],
      highlights: [{ _id: 'h1', articleId: 'a2', articleTitle: 'The piece', text: 'a marked line' }]
    })[0]).toMatchObject({ id: 'a2', label: 'The piece' });
  });

  /* A piece found twice — once whole, once through a highlight of it — is one
     source, and the picker offers it once. */
  it('offers a piece once however many ways it was found', () => {
    const found = sourcesFromSearch({
      articles: [{ _id: 'a3', title: 'The piece' }],
      highlights: [{ _id: 'h2', articleId: 'a3', articleTitle: 'The piece' }]
    });
    expect(rankSourceOptions({ found })).toHaveLength(1);
  });

  it('ignores the kinds a belief cannot rest on', () => {
    expect(sourcesFromSearch({ articles: [], highlights: [], notebook: [{ _id: 'n1', title: 'A note' }] }))
      .toEqual([]);
  });

  /* An unnamed citation is not a citation. */
  it('drops a result it cannot name', () => {
    expect(sourcesFromSearch([{ _id: 'a3' }, { title: 'No id' }])).toEqual([]);
  });

  it('survives a search that answered with nothing', () => {
    expect(sourcesFromSearch(null)).toEqual([]);
    expect(sourcesFromSearch({})).toEqual([]);
  });
});
