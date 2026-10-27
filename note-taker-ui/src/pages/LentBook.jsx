import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLentBook } from '../api/imports';
// Books first, so its styles load in the order every other page loads them.
import { Colophon, Spine } from './Books';
import { BookPages } from '../components/reader/BookDesk';
import { isEarlier, readingSince } from '../components/reader/bookDesk';
import useSeoMetadata from '../hooks/useSeoMetadata';

/* A book someone lent you: their copy, read without an account. Their marks
   under the pages they made them on, their own words beside the book's,
   earlier readings in fainter ink, and the sentence they kept when they
   finished it. Nothing here can be changed; taking it back closes the link. */
export default function LentBook() {
  const { slug = '' } = useParams();
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getLentBook(slug)
      .then(found => { if (!cancelled) setBook(found); })
      .catch(() => { if (!cancelled) setError('This book is not lent any more.'); });
    return () => { cancelled = true; };
  }, [slug]);

  useSeoMetadata({
    title: book ? `${book.title}, a lent copy · Noeis` : 'Noeis',
    description: book?.closingLine || 'A book lent to you, with what its reader marked in it.',
    canonicalPath: `/share/books/${slug}`,
    robots: 'noindex,nofollow'
  });

  if (error || !book) {
    return (
      <main className="books books--one" aria-busy={!error}>
        <p className="books__quiet" role={error ? 'alert' : 'status'}>{error || 'Opening the book…'}</p>
      </main>
    );
  }
  const since = readingSince(book);
  return (
    <main className="books books--one" aria-labelledby="book-title">
      <header className="books__head">
        <p className="books__author">{['A copy lent to you', book.author].filter(Boolean).join(' · ')}</p>
        <h1 id="book-title">{book.title}</h1>
      </header>
      <Spine marks={book.marks} since={since} />
      <section className="book-desk" aria-label="What they marked">
        <BookPages marks={book.marks} since={since} />
      </section>
      {book.finishedOn ? (
        <Colophon
          book={book}
          marks={book.marks.filter(mark => !isEarlier(mark, since))}
          whose="their"
          line={book.closingLine ? <blockquote>{book.closingLine}</blockquote> : null}
        />
      ) : <p className="books__quiet">They are still reading it.</p>}
      <p className="books__quiet">Kept in <Link to="/">Noeis</Link>, where a book is read with one line typed beside it.</p>
    </main>
  );
}
