const { composeBook, buildCommonplaceBook } = require('./commonplaceBook');

const mark = (id, text, createdAt, extra = {}) => ({ _id: id, text, createdAt, note: '', opens: 0, ...extra });

const articles = [
  {
    _id: 'a1',
    title: 'The Mythical Man-Month',
    author: 'Fred Brooks',
    highlights: [
      mark('h1', 'Adding manpower to a late software project makes it later.', '2026-03-02', { opens: 4, note: 'Every time.' }),
      mark('h2', 'Plan to throw one away; you will, anyhow.', '2026-01-10')
    ]
  },
  {
    _id: 'a2',
    title: 'Seeing Like a State',
    siteName: 'Yale',
    highlights: [mark('h3', 'Legibility is a central problem in statecraft.', '2026-05-01', { opens: 1 })]
  },
  {
    _id: 'a3',
    title: 'Unplaced',
    highlights: [
      mark('h4', 'A passage the map never placed on any subject.', '2026-06-01'),
      mark('h5', 'too short', '2026-06-02')
    ]
  },
  { _id: 'a4', title: 'Last year', highlights: [mark('h6', 'A passage marked the year before this one.', '2025-12-30')] }
];

const map = {
  clusters: [{ id: 'c0', name: 'Software' }, { id: 'c1', name: 'States' }],
  sources: [{ id: 'a1', cluster: 'c0' }, { id: 'a2', cluster: 'c1' }, { id: 'a4', cluster: 'c1' }]
};

describe('commonplace book', () => {
  test('a year of passages, in the map\'s subjects, largest first, the unnamed chapter last', () => {
    const book = composeBook({ year: 2026, articles, map });
    expect(book.years).toEqual([2026, 2025]);
    expect(book.passages).toBe(4);
    expect(book.sources).toBe(3);
    expect(book.chapters.map(chapter => [chapter.name, chapter.passages])).toEqual([['Software', 2], ['States', 1], [null, 1]]);
    const [software] = book.chapters;
    expect(software.sources[0]).toMatchObject({ title: 'The Mythical Man-Month', byline: 'Fred Brooks' });
    expect(software.sources[0].passages.map(p => p.id)).toEqual(['h2', 'h1']);
    expect(software.sources[0].passages[1].note).toBe('Every time.');
    expect(book.chapters[1].sources[0].byline).toBe('Yale');
  });

  test('the epigraph is the passage opened most, and only past the bar', () => {
    expect(composeBook({ year: 2026, articles, map }).epigraph).toMatchObject({ highlightId: 'h1', title: 'The Mythical Man-Month' });
    const unopened = articles.map(a => ({ ...a, highlights: a.highlights.map(h => ({ ...h, opens: 1 })) }));
    expect(composeBook({ year: 2026, articles: unopened, map }).epigraph).toBeNull();
  });

  test('with no year asked, the latest year marked; a quiet map makes one unnamed chapter', () => {
    const book = composeBook({ articles, map: null });
    expect(book.year).toBe(2026);
    expect(book.chapters.map(chapter => chapter.name)).toEqual([null]);
  });

  test('a year with nothing marked has no chapters', () => {
    const book = composeBook({ year: 2019, articles, map });
    expect(book).toMatchObject({ year: 2019, passages: 0, chapters: [], epigraph: null });
  });

  test('a map that fails still sets the book', async () => {
    const query = { select: () => query, lean: async () => articles };
    const find = jest.fn(() => query);
    const book = await buildCommonplaceBook({
      userId: 'u1',
      year: 2026,
      models: { Article: { find } },
      readingMap: async () => { throw new Error('no map'); }
    });
    expect(book.chapters.map(chapter => chapter.name)).toEqual([null]);
    expect(book.passages).toBe(4);
    // The same sources the map and the Library show: nothing hidden, archived or debug-only.
    expect(find.mock.calls[0][0]).toMatchObject({ hiddenFromHome: { $ne: true }, archived: { $ne: true }, debugOnly: { $ne: true } });
  });
});
