import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { updateHighlight } from '../api/highlights';
import { askBook, beforeBook, bookEcho, closeBook, listBookQuestions, listBooks, readAgain, reopenBook, startBook } from '../api/imports';
import { ArticleMargins } from '../components/margins/LibraryMargins';
import { useSettleIntoWiki } from '../components/think/settleIntoWiki';
import BookDesk from '../components/reader/BookDesk';
import PassageDoor from '../components/reader/PassageDoorView';
import useSourceWhereabouts from '../components/reader/useSourceWhereabouts';
import {
  BOOK_SAYS, bookendsOf, dayOf, isEarlier, kindOf, lastTime, longDate, monthOf, readingSince, setDownOn, sittingsOf, spineOf, tallyLine
} from '../components/reader/bookDesk';
import { bookFrom } from '../components/library/LibraryPasteLink';
import { useNoeisAgentSurface } from '../agent/AgentRailContext';
import useArticleDetail from '../hooks/useArticleDetail';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { buildPassagePath } from '../utils/sourceRoutes';
import { usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import '../styles/books.css';

// A book's paragraphs are what you marked in it and wrote beside it.
const MARK_BLOCKS = '.book-desk__mark > blockquote, .book-desk__mark > .book-desk__own';

/* The books you are reading, paper or Kindle, each with a page of its own:
   the desk you type at while the book is open beside you. */

/* A book you closed a year ago this week, handed back with its sentence.
   The server says which book and how long ago; nothing comes back unless a
   sentence was written, and a sentence from an earlier reading still comes. */
const Returning = ({ book }) => {
  const { years, days, line } = book.returning;
  return (
    <Link to={`/library/books/${book._id}`} className="books__returning">
      <span className="books__author">{years > 1 ? `${years} years ago` : 'A year ago'} {days ? 'this week' : 'today'}</span>
      <span>You finished <cite>{book.title}</cite> and said you’d remember:</span>
      <q>{line}</q>
      <span>Do you?</span>
    </Link>
  );
};

/* What you asked beside your books, still open. When something you marked
   since speaks to a question, it comes back with that passage, first.
   Nothing at all when nothing was asked or the questions cannot be read. */
const Questions = () => {
  const [questions, setQuestions] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listBookQuestions()
      .then(found => { if (!cancelled) setQuestions(found); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!questions.length) return null;
  const answeredFirst = [...questions.filter(question => question.answer), ...questions.filter(question => !question.answer)];
  return (
    <section className="books__questions" aria-labelledby="books-questions">
      <h2 id="books-questions">Open questions</h2>
      <ol>
        {answeredFirst.map(({ _id, note, page, bookId, bookTitle, answer }) => (
          <li key={_id}>
            <Link to={`/library/books/${bookId}?highlight=${_id}`} className="books__question">
              <q className="is-own">{note}</q>
              <span className="books__asked"><cite>{bookTitle}</cite>{page ? `, p. ${page}` : ''}</span>
            </Link>
            {answer ? (
              <Link to={buildPassagePath({ articleId: answer.articleId, highlightId: answer._id })} className="books__answer">
                Since then you marked{answer.articleTitle ? <>, in <cite>{answer.articleTitle}</cite></> : null}: <q>{answer.text}</q>
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
};

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;
const apart = (a, b) => {
  const months = Math.round(Math.abs(new Date(a) - new Date(b)) / MONTH_MS);
  const years = Math.floor(months / 12);
  return years ? (years === 1 ? 'a year' : `${years} years`) : `${months} months`;
};

/* Twice: a passage from one of your books and nearly the same thought,
   marked in another work months or years apart, the earlier first. The
   server picks one pair a day; a day without one has no section. */
const Twice = () => {
  const [pair, setPair] = useState(null);
  useEffect(() => {
    let cancelled = false;
    bookEcho()
      .then(found => { if (!cancelled) setPair(found); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!pair) return null;
  const { mark, echo } = pair;
  const passages = [
    { ...mark, href: `/library/books/${mark.bookId}?highlight=${mark._id}`, title: mark.bookTitle },
    { ...echo, href: buildPassagePath({ articleId: echo.articleId, highlightId: echo._id }), title: echo.articleTitle }
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return (
    <section className="books__twice" aria-labelledby="books-twice">
      <h2 id="books-twice">Twice</h2>
      <p className="books__asked">You marked nearly the same thought {apart(mark.createdAt, echo.createdAt)} apart.</p>
      {passages.map(passage => (
        <Link key={passage._id} to={passage.href} className="books__echo">
          <q>{passage.text}</q>
          <span className="books__asked">
            <cite>{passage.title}</cite>{passage.page ? `, p. ${passage.page}` : ''}, {monthOf(new Date(passage.createdAt))}
          </span>
        </Link>
      ))}
    </section>
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
            const setDown = setDownOn(book, book.marks);
            return (
              <li key={book._id}>
                <Link to={`/library/books/${book._id}`} className="books__book">
                  <span className="books__title">{book.title || 'Untitled book'}</span>
                  {book.author ? <span className="books__author">{book.author}</span> : null}
                  <span className="books__tally">
                    {[book.finishedOn ? `Finished ${monthOf(dayOf(book.finishedOn))}` : '', setDown ? `Set down in ${monthOf(setDown)}` : '', tallyLine(book.marks) || (book.finishedOn ? '' : 'Nothing written yet')].filter(Boolean).join(' · ')}
                  </span>
                  {last ? <q className={last.own ? 'books__last is-own' : 'books__last'}>{last.words}</q> : null}
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
      <Twice />
      <Questions />
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
   said you would remember; and under it, each time you read it before. A
   closed book can be written up as a wiki page of what you marked in it,
   and written up again after you mark more. */
const Closing = ({ book, marks, saved, writeUp, onChange, children }) => {
  const writing = useSettleIntoWiki('books', book._id, writeUp);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState('');
  const keep = async (line) => {
    try {
      const closed = await closeBook(book._id, line);
      onChange(closed);
      setAsking(false);
      setSaid(closed.closingLine
        ? `It comes back to you on ${longDate(dayOf(closed.finishedOn, 1))}.`
        : 'Closed without a sentence, so nothing comes back. You can still write one.');
      return true;
    } catch (_) {
      setSaid('The book did not close. Try it again.');
      return false;
    }
  };
  const open = (again) => async () => {
    try {
      onChange(await (again ? readAgain : reopenBook)(book._id));
      setSaid('');
    } catch (_) {
      setSaid('The book is still closed. Try it again.');
    }
  };
  const before = (book.readBefore || []).filter(reading => reading.finishedOn);

  if (!book.finishedOn) {
    return (
      <section className="books__closing" aria-label="Closing the book">
        {asking ? <Remember label="Close the book" onKeep={keep} />
          : <button type="button" className="books__quiet-button" onClick={() => setAsking(true)}>I’ve finished it</button>}
        {said ? <p className="books__quiet" role="status">{said}</p> : null}
      </section>
    );
  }
  const sittings = sittingsOf(marks);
  const { first, last, words } = bookendsOf(marks);
  const colophon = [
    sittings.length && longDate(new Date(sittings[0][0].createdAt)) !== longDate(dayOf(book.finishedOn)) ? `Read from ${longDate(new Date(sittings[0][0].createdAt))}` : '',
    sittings.length > 1 ? `${sittings.length} sittings` : '',
    tallyLine(marks),
    words ? `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} of your own` : ''
  ].filter(Boolean).join(' · ');
  return (
    <section className="books__colophon" aria-label="Colophon">
      <p className="books__author">Finished {longDate(dayOf(book.finishedOn))}</p>
      {book.closingLine ? <blockquote>{book.closingLine}</blockquote> : <Remember label="Keep" onKeep={keep} />}
      {colophon ? <p className="books__tally">{colophon}</p> : null}
      {first ? <p className="books__tally books__bookends">It began with <q>{first}</q> and ended with <q>{last}</q></p> : null}
      {before.map(reading => (
        <p key={reading.until} className="books__tally books__before">
          Also finished {longDate(dayOf(reading.finishedOn))}{reading.closingLine ? <>, and said: <q>{reading.closingLine}</q></> : null}
        </p>
      ))}
      {said ? <p className="books__quiet" role="status">{said}</p> : null}
      {children}
      {writing.lines}
      <p className="books__again">
        <button type="button" className="books__quiet-button" disabled={writing.settling} onClick={() => writing.settle(async () => saved)}>
          {writing.settled ? 'Write it up again' : 'Write it up in your wiki'}
        </button>
        <button type="button" className="books__quiet-button" onClick={open(true)}>Read it again</button>
        <button type="button" className="books__quiet-button" onClick={open(false)}>Still reading it</button>
      </p>
    </section>
  );
};

/* Asking the author: when the book is done, the questions you left open
   beside it are put to it, and each comes back argued only from what you
   marked in it, with the pages it leans on. Keep an answer and it is written
   under your question, which closes it; strike it and nothing is kept. A
   question the marks cannot reach gets no answer. */
const AskTheAuthor = ({ book, marks, onReplace }) => {
  const open = marks.filter(mark => kindOf(mark) === 'question');
  const [answers, setAnswers] = useState(null);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState('');
  const still = usePrefersReducedMotion();
  const ask = async () => {
    setAsking(true);
    setSaid('');
    try {
      const found = await askBook(book._id);
      setAnswers(found);
      if (!found.length) setSaid('Nothing you marked answers them, so they stay open.');
    } catch (_) {
      setSaid('The book could not be asked just now. Try it again.');
    }
    setAsking(false);
  };
  const settle = (questionId) => setAnswers(left => left.filter(found => found.questionId !== questionId));
  const keep = async ({ questionId, answer }) => {
    const question = marks.find(mark => mark._id === questionId);
    const note = `${question.note}\n\n${BOOK_SAYS}${answer}`;
    try {
      await updateHighlight({ articleId: book._id, highlightId: questionId, payload: { note } });
      onReplace(questionId, { ...question, note });
      settle(questionId);
      setSaid('Kept under your question.');
    } catch (_) {
      setSaid('That answer did not keep. Try it again.');
    }
  };
  const asked = answers?.filter(found => marks.some(mark => mark._id === found.questionId)) || [];
  if (!open.length && !asked.length && !said) return null;
  return (
    <section className="books__ask" aria-label="Ask the book">
      {/* Asked again whenever questions are open and no answer waits on you. */}
      {!open.length || asked.length ? null : (
        <button type="button" className="books__quiet-button" disabled={asking} onClick={ask}>
          {asking ? 'Asking the book…' : `Ask the book ${open.length === 1 ? 'your open question' : `your ${open.length} open questions`}`}
        </button>
      )}
      {asked.length ? (
        <ol>
          {asked.map(found => (
            <li key={found.questionId}>
              <q>{marks.find(mark => mark._id === found.questionId).note}</q>
              <p className="books__reply">{found.answer}</p>
              <p className="books__asked">
                From what you marked at{' '}
                {found.marks.map((mark, at) => (
                  <React.Fragment key={mark._id}>
                    {at ? ', ' : ''}
                    <button type="button" className="books__cite" onClick={() => showMark(mark._id, !still)}>{mark.page ? `p. ${mark.page}` : 'a passage'}</button>
                  </React.Fragment>
                ))}
              </p>
              <p className="books__again">
                <button type="button" className="books__quiet-button" onClick={() => keep(found)}>Keep it</button>
                <button type="button" className="books__quiet-button" onClick={() => settle(found.questionId)}>Strike it</button>
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {said ? <p className="books__quiet" role="status">{said}</p> : null}
    </section>
  );
};

/* Before you start: a book with nothing marked in it yet opens with what you
   already marked elsewhere that touches it. The first line you type puts it
   away; a book none of it touches opens as it always has. */
const BeforeYouStart = ({ id }) => {
  const [passages, setPassages] = useState([]);
  useEffect(() => {
    let cancelled = false;
    beforeBook(id)
      .then(found => { if (!cancelled) setPassages(found); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);
  if (!passages.length) return null;
  return (
    <section className="books__beforehand" aria-labelledby="books-before">
      <h2 id="books-before">Before you start</h2>
      <p className="books__asked">You have marked {passages.length === 1 ? 'this' : 'these'} elsewhere, and {passages.length === 1 ? 'it touches' : 'they touch'} this book.</p>
      {passages.map(passage => (
        <Link key={passage._id} to={buildPassagePath({ articleId: passage.articleId, highlightId: passage._id })} className="books__echo">
          <q>{passage.text}</q>
          <span className="books__asked"><cite>{passage.articleTitle}</cite>{passage.createdAt ? `, ${monthOf(new Date(passage.createdAt))}` : ''}</span>
        </Link>
      ))}
    </section>
  );
};

/* Bring one mark into view and ink it for a moment, so the eye lands on it. */
const showMark = (id, smooth = false) => {
  const mark = document.querySelector(`[data-highlight-id="highlight-${id}"]`);
  if (!mark) return;
  mark.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  mark.setAttribute('data-found', '');
  mark.addEventListener('animationend', () => mark.removeAttribute('data-found'), { once: true });
};

/* The spine: the whole book as one strip, a tick for every mark where it
   sits. Ticks overlap and darken, so the stretch where the book got you
   reads as ink before anything is said about it. A tick opens its mark; the
   ticks are a picture of the marks listed below, so they stay out of the tab
   order, and the thickest stretch is a link anyone can follow. */
const Spine = ({ marks, since }) => {
  const spine = useMemo(() => spineOf(marks, since), [marks, since]);
  const still = usePrefersReducedMotion();
  if (!spine) return null;
  const open = (event) => {
    const { mark } = event.target.dataset;
    if (mark) showMark(mark, !still);
  };
  return (
    <figure className="books__spine" aria-label={`Your marks along the book, to ${spine.end}`}>
      <div className="books__spine-strip" onClick={open} aria-hidden="true">
        {spine.ticks.map(tick => (
          <span key={tick.id} data-mark={tick.id} data-kind={tick.kind} data-earlier={tick.earlier || undefined} title={tick.label} style={{ left: `${tick.at * 100}%` }} />
        ))}
      </div>
      <figcaption>
        {spine.thickest ? (
          <button type="button" onClick={() => showMark(spine.thickest.id, !still)}>Thickest at {spine.thickest.label}</button>
        ) : <span />}
        <span>{spine.end}</span>
      </figcaption>
    </figure>
  );
};

/* Where the book went in your wiki: the pages that cite it or hold a view
   on it, one line each, the way an article ends. Nothing when it went nowhere. */
const Whereabouts = ({ lines }) => (lines.length ? (
  <ul className="article-whereabouts books__whereabouts" aria-label="Where this book went">
    {lines.map(line => <li key={line.id}>{line.lead} <Link to={line.href}>{line.title}</Link>.</li>)}
  </ul>
) : null);

// A mark typed at the desk is saved once the server has given it an id.
const isSaved = mark => !mark.unsent && !String(mark._id).startsWith('desk-');

/* One book, at its desk. A link to a passage opens the desk at that mark. */
const Book = ({ id }) => {
  const [searchParams] = useSearchParams();
  const asked = searchParams.get('highlight') || '';
  const { article, highlights, error, addHighlightOptimistic, replaceHighlight, removeHighlight } = useArticleDetail(id);
  const [closed, setClosed] = useState(null);
  const book = article ? { ...article, ...closed } : null;
  const since = readingSince(book || {});
  const { pages, whereabouts, held } = useSourceWhereabouts(id, highlights, 'book');
  // The margins are asked again when the saved marks change, so each note stays beside its own mark.
  const savedMarks = highlights.filter(isSaved).map(mark => mark._id).join();
  const frameRef = useRef(null);
  const deskRef = useRef(null);
  /* Each mark keeps its door to the view it was filed under, or the offer to
     file it, as it has in the reader. A mark not yet saved has no door. */
  const doorFor = (mark) => (!isSaved(mark) || held.has(String(mark._id)) ? null : (
    <PassageDoor articleId={id} highlightId={mark._id} pages={pages} text={mark.text || ''} />
  ));
  useDocumentTitle(article?.title || 'A book', 'Library');
  // The Partner holds this book, its marks standing for the body it has none of.
  useNoeisAgentSurface('agent-surface.library', {
    room: 'library',
    objectType: 'article',
    objectId: id,
    title: article?.title || 'A book',
    orientation: 'Think with this book from what you marked in it and wrote beside it.'
  });

  useEffect(() => {
    if (asked && highlights.length) showMark(asked);
  }, [asked, highlights.length]);

  return (
    <main ref={frameRef} className="books books--one" aria-labelledby="book-title" aria-busy={!article && !error}>
      <nav className="books__tools" aria-label="Book"><Link to="/library/books">← Books</Link></nav>
      {error ? <p className="books__quiet" role="alert">{error}</p> : null}
      {book ? (
        <>
          <header className="books__head">
            {book.author ? <p className="books__author">{book.author}</p> : null}
            <h1 id="book-title">{book.title || 'Untitled book'}</h1>
          </header>
          <Spine marks={highlights} since={since} />
          {highlights.length ? null : <BeforeYouStart id={id} />}
          <div ref={deskRef}>
            <BookDesk
              key={article._id}
              article={book}
              marks={highlights}
              arriving={!asked}
              onAdd={addHighlightOptimistic}
              onReplace={replaceHighlight}
              onRemove={removeHighlight}
              doorFor={doorFor}
            />
          </div>
          {/* Beside a mark, the closest thing you marked in another book or piece, as the reader has. */}
          <ArticleMargins articleId={id} contentRef={deskRef} frameRef={frameRef} blocks={MARK_BLOCKS} contentKey={savedMarks} />
          <Whereabouts lines={whereabouts} />
          <Closing
            book={book}
            marks={highlights.filter(mark => !isEarlier(mark, since))}
            saved={highlights.every(isSaved)}
            writeUp={pages.find(page => page.createdFrom?.label === `settled-book:${id}`)}
            onChange={setClosed}
          >
            <AskTheAuthor book={book} marks={highlights} onReplace={replaceHighlight} />
          </Closing>
        </>
      ) : null}
    </main>
  );
};

export default function Books() {
  const { id } = useParams();
  return id ? <Book id={id} /> : <Shelf />;
}
