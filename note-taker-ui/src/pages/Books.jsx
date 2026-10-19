import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { closeBook, listBooks, reopenBook, startBook } from '../api/imports';
import BookDesk from '../components/reader/BookDesk';
import { lastTime, sittingsOf, tallyLine } from '../components/reader/bookDesk';
import { bookFrom } from '../components/library/LibraryPasteLink';
import useArticleDetail from '../hooks/useArticleDetail';
import useDocumentTitle from '../hooks/useDocumentTitle';
import '../styles/books.css';

/* The books you are reading, paper or Kindle, each with a page of its own:
   the desk you type at while the book is open beside you. */

const longDate = date => new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const monthOf = date => new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const aYearOn = (date) => {
  const on = new Date(date);
  on.setFullYear(on.getFullYear() + 1);
  return on;
};

/* A book you closed a year ago this week, handed back with its sentence.
   The server says which book and how long ago; nothing comes back unless a
   sentence was written. */
const Returning = ({ book }) => {
  const { years, days } = book.returning;
  return (
    <Link to={`/library/books/${book._id}`} className="books__returning">
      <span className="books__author">{years > 1 ? `${years} years ago` : 'A year ago'} {days ? 'this week' : 'today'}</span>
      <span>You finished <cite>{book.title}</cite> and said you’d remember:</span>
      <q>{book.closingLine}</q>
      <span>Do you?</span>
    </Link>
  );
};

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

      {books?.find(book => book.returning) ? <Returning book={books.find(book => book.returning)} /> : null}

      {books?.length ? (
        <ol className="books__shelf">
          {books.map(book => {
            const last = book.closingLine ? { words: book.closingLine, own: true } : lastTime(book.marks);
            return (
              <li key={book._id}>
                <Link to={`/library/books/${book._id}`} className="books__book">
                  <span className="books__title">{book.title || 'Untitled book'}</span>
                  {book.author ? <span className="books__author">{book.author}</span> : null}
                  <span className="books__tally">
                    {[book.finishedAt ? `Finished ${monthOf(book.finishedAt)}` : '', tallyLine(book.marks) || (book.finishedAt ? '' : 'Nothing written yet')].filter(Boolean).join(' · ')}
                  </span>
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

/* The one sentence asked of you when a book is done: what will you
   remember? It may be left empty, and then nothing comes back. */
const Remember = ({ label, onKeep }) => {
  const [line, setLine] = useState('');
  const [keeping, setKeeping] = useState(false);
  const keep = async (event) => {
    event.preventDefault();
    setKeeping(true);
    if (!(await onKeep(line))) setKeeping(false);
  };
  return (
    <form className="books__start books__remember" onSubmit={keep}>
      <input
        aria-label="In one sentence, what will you remember?"
        placeholder="In one sentence, what will you remember?"
        value={line}
        autoFocus
        onChange={(event) => setLine(event.target.value)}
      />
      <button type="submit" disabled={keeping}>{label}</button>
    </form>
  );
};

/* Closing the book. While you read, it is one quiet line under the desk.
   Closed, the book gets its colophon there, where a printed book keeps one:
   when you read it, how many sittings, what you wrote, and the sentence you
   said you would remember. */
const Closing = ({ book, marks, onChange }) => {
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState('');
  const keep = async (line) => {
    try {
      const closed = await closeBook(book._id, line);
      onChange(closed);
      setAsking(false);
      setSaid(closed.closingLine
        ? `It comes back to you on ${longDate(aYearOn(closed.finishedAt))}.`
        : 'Closed without a sentence, so nothing comes back. You can still write one.');
      return true;
    } catch (_) {
      setSaid('The book did not close. Try it again.');
      return false;
    }
  };
  const reopen = async () => {
    try {
      onChange(await reopenBook(book._id));
      setSaid('');
    } catch (_) {
      setSaid('The book is still closed. Try it again.');
    }
  };

  if (!book.finishedAt) {
    return (
      <section className="books__closing" aria-label="Closing the book">
        {asking ? <Remember label="Close the book" onKeep={keep} />
          : <button type="button" className="books__quiet-button" onClick={() => setAsking(true)}>I’ve finished it</button>}
        {said ? <p className="books__quiet" role="status">{said}</p> : null}
      </section>
    );
  }
  const sittings = sittingsOf(marks);
  const colophon = [
    sittings.length && longDate(sittings[0][0].createdAt) !== longDate(book.finishedAt) ? `Read from ${longDate(sittings[0][0].createdAt)}` : '',
    sittings.length > 1 ? `${sittings.length} sittings` : '',
    tallyLine(marks)
  ].filter(Boolean).join(' · ');
  return (
    <section className="books__colophon" aria-label="Colophon">
      <p className="books__author">Finished {longDate(book.finishedAt)}</p>
      {book.closingLine ? <blockquote>{book.closingLine}</blockquote> : <Remember label="Keep" onKeep={keep} />}
      {colophon ? <p className="books__tally">{colophon}</p> : null}
      {said ? <p className="books__quiet" role="status">{said}</p> : null}
      <button type="button" className="books__quiet-button" onClick={reopen}>Still reading it</button>
    </section>
  );
};

/* One book, at its desk. A link to a passage opens the desk at that mark. */
const Book = ({ id }) => {
  const [searchParams] = useSearchParams();
  const asked = searchParams.get('highlight') || '';
  const { article, highlights, error, addHighlightOptimistic, replaceHighlight, removeHighlight } = useArticleDetail(id);
  const [closed, setClosed] = useState(null);
  const book = article ? { ...article, ...closed } : null;
  useDocumentTitle(article?.title || 'A book', 'Library');

  useEffect(() => {
    if (!asked || !highlights.length) return;
    document.querySelector(`[data-highlight-id="highlight-${asked}"]`)?.scrollIntoView?.({ block: 'center' });
  }, [asked, highlights.length]);

  return (
    <main className="books books--one" aria-labelledby="book-title" aria-busy={!article && !error}>
      <nav className="books__tools" aria-label="Book"><Link to="/library/books">← Books</Link></nav>
      {error ? <p className="books__quiet" role="alert">{error}</p> : null}
      {book ? (
        <>
          <header className="books__head">
            {book.author ? <p className="books__author">{book.author}</p> : null}
            <h1 id="book-title">{book.title || 'Untitled book'}</h1>
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
          <Closing book={book} marks={highlights} onChange={setClosed} />
        </>
      ) : null}
    </main>
  );
};

export default function Books() {
  const { id } = useParams();
  return id ? <Book id={id} /> : <Shelf />;
}
