import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCommonplaceBook } from '../api/library';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { YearShelf } from './Books';
import { buildCanonicalArticlePath, buildPassagePath } from '../utils/sourceRoutes';
import '../styles/commonplace-book.css';

/* A year of reading, bound: every passage you marked, with the note you
   wrote beside it, in chapters by subject. On screen each passage opens
   where it came from; printed, it is a book. The browser's own print
   dialog makes the PDF, so nothing here renders one. */

const counted = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/* The unnamed chapter holds what the map did not place. Alone, it is the
   whole book and needs no heading. */
const chapterName = (chapter, chapters) => chapter.name || (chapters.length > 1 ? 'Also marked' : '');

const Source = ({ source }) => (
  <article className="commonplace-book__source">
    <h3>
      <Link to={buildCanonicalArticlePath(source.id)}>{source.title || source.byline || 'Untitled'}</Link>
    </h3>
    {source.byline && source.title ? <p className="commonplace-book__byline">{source.byline}</p> : null}
    {source.passages.map(passage => (
      <div key={passage.id} className="commonplace-book__passage">
        <p>
          <Link to={buildPassagePath({ articleId: source.id, highlightId: passage.id, text: passage.text })}>{passage.text}</Link>
        </p>
        {passage.note ? <p className="commonplace-book__note">{passage.note}</p> : null}
      </div>
    ))}
  </article>
);

const CommonplaceBook = () => {
  const [searchParams] = useSearchParams();
  const asked = Number(searchParams.get('year')) || undefined;
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');
  useDocumentTitle(book ? `${book.year}, a commonplace book` : 'A commonplace book', 'Library');

  useEffect(() => {
    let cancelled = false;
    setBook(null);
    setError('');
    getCommonplaceBook(asked)
      .then(found => { if (!cancelled) setBook(found); })
      .catch(() => { if (!cancelled) setError('The book could not be set just now.'); });
    return () => { cancelled = true; };
  }, [asked]);

  const otherYears = (book?.years || []).filter(year => year !== book.year);
  const chapters = book?.chapters || [];

  return (
    <main className="commonplace-book" aria-labelledby="commonplace-book-title" aria-busy={!book && !error}>
      <nav className="commonplace-book__tools" aria-label="Book">
        <Link to="/library">← Library</Link>
        {otherYears.length ? (
          <span>
            {otherYears.map(year => <Link key={year} to={`/library/book?year=${year}`}>{year}</Link>)}
          </span>
        ) : null}
        {book?.passages ? <button type="button" onClick={() => window.print()}>Print or save as PDF</button> : null}
      </nav>

      {error ? <p className="commonplace-book__quiet" role="alert">{error}</p> : null}

      {book ? (
        <>
          <header className="commonplace-book__title-page">
            <p className="commonplace-book__kicker">A commonplace book</p>
            <h1 id="commonplace-book-title">{book.year}</h1>
            <p className="commonplace-book__count">
              {book.passages
                ? `${counted(book.passages, 'passage', 'passages')} from ${counted(book.sources, 'source', 'sources')}`
                : `Nothing was marked in ${book.year}.`}
            </p>
            {book.epigraph ? (
              <figure className="commonplace-book__epigraph">
                <blockquote>
                  <Link to={buildPassagePath({ articleId: book.epigraph.articleId, highlightId: book.epigraph.highlightId, text: book.epigraph.text })}>
                    {book.epigraph.text}
                  </Link>
                </blockquote>
                <figcaption>{book.epigraph.title}, the passage you went back to most</figcaption>
              </figure>
            ) : null}
          </header>

          <YearShelf year={book.year} />

          {chapters.length > 1 ? (
            <nav className="commonplace-book__contents" aria-label="Contents">
              <h2>Contents</h2>
              <ol>
                {chapters.map((chapter, index) => (
                  <li key={chapterName(chapter, chapters)}>
                    <a href={`#chapter-${index + 1}`}>{chapterName(chapter, chapters)}</a>
                    <span>{chapter.passages}</span>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          {chapters.map((chapter, index) => {
            const name = chapterName(chapter, chapters);
            return (
              <section key={name || 'book'} id={`chapter-${index + 1}`} className="commonplace-book__chapter" aria-label={name || undefined}>
                {name ? <h2><span>{index + 1}</span>{name}</h2> : null}
                {chapter.sources.map(source => <Source key={source.id} source={source} />)}
              </section>
            );
          })}
        </>
      ) : null}
    </main>
  );
};

export default CommonplaceBook;
