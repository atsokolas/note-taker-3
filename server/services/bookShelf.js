const { BOOK_URL, bookSource } = require('./import/exportFiles');
const { sameWords } = require('../utils/passages');

/* Readwise used to address a book with no web address of its own by its
   Readwise page, which kept the book in the Library and off the shelf. */
const READWISE_BOOK_PAGE = /^https:\/\/readwise\.io\/bookreview\//;

/* A book already on the shelf, under any address an import gives it or by its title. */
const bookOnShelf = (shelf, book) => shelf.find(item => [book.url, ...book.aliases].includes(item.url))
  || shelf.find(item => sameWords(item.title) === sameWords(book.title));

// A quote is the same quote however it was marked; a note of your own is its words.
const sameMark = mark => (mark.text ? sameWords(mark.text) : `note:${sameWords(mark.note)}`);

/* Every book Readwise left in the Library goes onto the shelf: into the book
   already there by that title, its marks moving with their ids and the stray
   kept (hidden) pointing at the book, so links to it open the book; or else
   under a book's own address. */
const shelveBooks = async ({ Article, userId }) => {
  const strays = await Article.find({ userId, url: READWISE_BOOK_PAGE, archived: { $ne: true } });
  if (!strays.length) return 0;
  const shelf = await Article.find({ userId, url: BOOK_URL });
  for (const stray of strays) {
    const book = bookSource({ provider: 'readwise', title: stray.title, author: stray.author });
    const known = bookOnShelf(shelf, book);
    if (!known) {
      stray.url = book.url;
      await stray.save();
      shelf.push(stray);
      continue;
    }
    const marked = new Set(known.highlights.map(sameMark));
    const moving = stray.highlights.filter(mark => !marked.has(sameMark(mark)));
    known.highlights.push(...moving.map(mark => mark.toObject()));
    stray.highlights = stray.highlights.filter(mark => !moving.includes(mark));
    known.author ||= stray.author;
    stray.mergedInto = known._id;
    stray.archived = true;
    stray.hiddenFromHome = true;
    await known.save();
    await stray.save();
  }
  return strays.length;
};

module.exports = { READWISE_BOOK_PAGE, bookOnShelf, shelveBooks };
