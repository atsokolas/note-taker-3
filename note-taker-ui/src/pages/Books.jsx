import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listBooks, startBook } from '../api/imports';
import BookDesk from '../components/reader/BookDesk';
import { lastTime, tallyLine } from '../components/reader/bookDesk';
import { bookFrom } from '../components/library/LibraryPasteLink';
import useArticleDetail from '../hooks/useArticleDetail';
import useDocumentTitle from '../hooks/useDocumentTitle';
import '../styles/books.css';

/* The books you are reading, paper or Kindle, each with a page of its own:
   the desk you type at while the book is open beside you. */

const Shelf = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [starting, setStarting] = useState(false);
  useDocumentTitle('Books', 'Library');

  useEffect(() => {
    let cancelled = false;
    listBooks()
      .then(found => { if (!cancelled) setBooks(found); })
      .catch(() => { if (!cancelled) setError('Your books could not be read just now.'); });
    return () => { cancelled = true; };
  }, []);

  const start = async (event) => {
    event.preventDefault();
    const book = bookFrom(name);
    if (!book) return;
    setStarting(true);
    try {
      const { article } = await startBook(book);
      navigate(`/library/books/${article._id}`);
    } catch (_) {
      setStarting(false);
      setError('That book did not start. Try it again.');
    }
  };

  return (
    <main className="books" aria-labelledby="books-title" aria-busy={!books && !error}>
      <nav className="books__tools" aria-label="Books"><Link to="/library">← Library</Link></nav>
      <h1 id="books-title">Books</h1>
      <form className="books__start" onSubmit={start}>
        <input
          aria-label="The book you are reading"
          value={name}
          placeholder="The book you’re reading, and who wrote it"
          autoCapitalize="words"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={starting || !bookFrom(name)}>{starting ? 'Opening…' : 'Open'}</button>
      </form>

      {error ? <p className="books__quiet" role="alert">{error}</p> : null}
      {books && !books.length ? (
        <p className="books__quiet">Name a book above and it gets a page here. Books from your Kindle or Readwise arrive here too.</p>
      ) : null}

      {books?.length ? (
        <ol className="books__shelf">
          {books.map(book => {
            const last = lastTime(book.marks);
            return (
              <li key={book._id}>
                <Link to={`/library/books/${book._id}`} className="books__book">
                  <span className="books__title">{book.title || 'Untitled book'}</span>
                  {book.author ? <span className="books__author">{book.author}</span> : null}
                  <span className="books__tally">{tallyLine(book.marks) || 'Nothing written yet'}</span>
                  {last ? <q className={last.own ? 'books__last is-own' : 'books__last'}>{last.words}</q> : null}
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </main>
  );
};

/* One book, at its desk. A link to a passage opens the desk at that mark. */
const Book = ({ id }) => {
  const [searchParams] = useSearchParams();
  const asked = searchParams.get('highlight') || '';
  const { article, highlights, error, addHighlightOptimistic, replaceHighlight, removeHighlight } = useArticleDetail(id);
  useDocumentTitle(article?.title || 'A book', 'Library');

  useEffect(() => {
    if (!asked || !highlights.length) return;
    document.querySelector(`[data-highlight-id="highlight-${asked}"]`)?.scrollIntoView?.({ block: 'center' });
  }, [asked, highlights.length]);

  return (
    <main className="books books--one" aria-labelledby="book-title" aria-busy={!article && !error}>
      <nav className="books__tools" aria-label="Book"><Link to="/library/books">← Books</Link></nav>
      {error ? <p className="books__quiet" role="alert">{error}</p> : null}
      {article ? (
        <>
          <header className="books__head">
            {article.author ? <p className="books__author">{article.author}</p> : null}
            <h1 id="book-title">{article.title || 'Untitled book'}</h1>
          </header>
          <BookDesk
            key={article._id}
            article={article}
            marks={highlights}
            arriving={!asked}
            onAdd={addHighlightOptimistic}
            onReplace={replaceHighlight}
            onRemove={removeHighlight}
          />
        </>
      ) : null}
    </main>
  );
};

export default function Books() {
  const { id } = useParams();
  return id ? <Book id={id} /> : <Shelf />;
}
