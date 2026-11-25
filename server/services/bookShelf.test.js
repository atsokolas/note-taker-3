const { bookOnShelf, bookTyped } = require('./bookShelf');

const shelf = titles => titles.map((title, index) => ({ title, url: `import://readwise/${index}` }));

describe('finding a book already on the shelf', () => {
  test('a title with its author is the same book as the title alone', () => {
    const munger = shelf(["Poor Charlie's Almanack by Charles T. Munger"]);
    expect(bookOnShelf(munger, { title: "Poor Charlie's Almanack", url: 'import://book/x', aliases: [] })).toBe(munger[0]);
    expect(bookOnShelf(shelf(['Letters by Seneca']), { title: 'Letters by Pliny', url: 'import://book/y', aliases: [] })).toBeUndefined();
  });

  test('a slip of the keys at the desk opens the book, a different book does not', () => {
    expect(bookTyped(shelf(["Poor Charlie's Almanack by Charles T. Munger"]), "Poor Charlie's Alamanc")?.title)
      .toBe("Poor Charlie's Almanack by Charles T. Munger");
    expect(bookTyped(shelf(['The Lord of the Rings Volume 1']), 'The Lord of the Rings Volume 2')).toBeUndefined();
    expect(bookTyped(shelf(['Zero to One']), 'Zero to Two')).toBeUndefined();
    expect(bookTyped(shelf(['Letters by Seneca']), 'Letters by Pliny')).toBeUndefined();
  });
});
