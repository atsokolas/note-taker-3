import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createHighlight, deleteHighlight, updateHighlight } from '../../api/highlights';
import { argueLine, heardBefore, readBookPage } from '../../api/imports';
import { useFinePointer } from '../../hooks/useMotionPreferences';
import { scopedKey } from '../../utils/browserScope';
import { buildConceptPath } from '../../utils/sourceRoutes';
import { pagePhoto } from '../../utils/pagePhoto';
import {
  CAPTURE_KINDS, DOG_EAR, completionFor, dayOf, isEarlier, isUnfinished, kindOf, lastLine, lastTime, markedBefore, midThought, monthOf, pageNow, pagesOf,
  readingSince, readLine, setDownOn, sittingLabel, sittingOf, tallyLine
} from './bookDesk';
import '../../styles/book-desk.css';

/* Lines typed with no connection wait on this device, never lost. */
const unsentKey = articleId => scopedKey(`noeis.desk.unsent.${articleId}`);
const unsentLines = (articleId) => {
  try { return JSON.parse(window.localStorage.getItem(unsentKey(articleId)) || '[]'); } catch (_) { return []; }
};
const keepUnsent = (articleId, lines) => {
  try {
    if (lines.length) window.localStorage.setItem(unsentKey(articleId), JSON.stringify(lines));
    else window.localStorage.removeItem(unsentKey(articleId));
  } catch (_) { /* Blocked storage: the line stays on screen for this visit. */ }
};

// A line keeps one id from the moment it is typed, so sending it again after
// an answer that never arrived saves it once.
const lineId = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const sentOff = (articleId, tempId) => keepUnsent(articleId, unsentLines(articleId).filter(line => line.tempId !== tempId));

const joinNotes = (held = '', more = '') => (held ? `${held}\n\n${more}` : more);

/* Three words the line keeps to itself until you type a "/": fold the
   page's corner, hear the best case against your line, or find who else in
   your library said it. Each one about the line after it, or the last one kept. */
const COMMAND = /^\/(dog-ear|argue|who)\b\s*/;

const yearOf = mark => new Date(mark.createdAt).getFullYear();

/* What a sent line became, said once under the line. Nothing when it simply saved. */
const quotes = count => (count === 1 ? 'a quote' : `${count} quotes`);

const filedUnder = (tags = []) => (tags.length ? `Filed under ${tags.map(tag => `#${tag}`).join(' ')}.` : '');

const receiptFor = (sent, saved, known, earlier) => {
  if (earlier) return `You marked this in ${yearOf(earlier)} too.`;
  if (known) {
    return /\bLocation\b/.test(saved.location || '')
      ? 'You marked this on your Kindle too. Now it’s one highlight, with your note.'
      : 'You had marked this already. It is one mark now.';
  }
  if (!sent.text || !isUnfinished(sent.text)) return '';
  return isUnfinished(saved.text)
    ? 'Saved. The middle fills in from your Kindle, or from a photo of the page.'
    : 'Filled in from the book.';
};

/* The book's pages as you marked them, each mark under its page, earlier
   readings in fainter ink. The desk writes into it; a lent copy only reads it. */
export function BookPages({ marks = [], since = 0, inked = '', doorFor }) {
  const pages = useMemo(() => pagesOf(marks), [marks]);
  return pages.length ? (
    <ol className="book-desk__pages">
      {pages.map(({ label, marks: onPage }) => (
        <li key={`${label}-${onPage[0]._id}`} className="book-desk__page" data-folded={onPage.some(mark => kindOf(mark) === 'fold') || undefined}>
          {label ? <span className="book-desk__folio">{label}</span> : null}
          <ul className="book-desk__marks">
            {onPage.filter(mark => kindOf(mark) !== 'fold').map(mark => (
              <li
                key={mark._id}
                className="book-desk__mark"
                data-highlight-id={`highlight-${mark._id}`}
                tabIndex={-1}
                data-kind={kindOf(mark)}
                data-unfinished={(mark.text && isUnfinished(mark.text)) || undefined}
                data-unsent={mark.unsent || undefined}
                data-inked={mark._id === inked || undefined}
                data-earlier={isEarlier(mark, since) || undefined}
              >
                {mark.text ? <blockquote>{mark.text}</blockquote> : null}
                {mark.note ? <p className="book-desk__own">{mark.note}</p> : null}
                {mark.tags?.length ? (
                  <p className="book-desk__tags">
                    {mark.tags.map(tag => <Link key={tag} to={buildConceptPath({ name: tag })}>#{tag}</Link>)}
                  </p>
                ) : null}
                {isEarlier(mark, since) ? <span className="book-desk__when">{yearOf(mark)}</span> : null}
                {doorFor?.(mark)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  ) : null;
}

/**
 * The reading desk: the book is in your lap, and this is the one line you
 * type into beside it. "212" turns to page 212, a line opening with a quote
 * mark is the book's words, anything else is yours, and a #word files it
 * under that concept. ⌥↩ puts the line under the last quote kept here as its
 * note. The page stays where you left it.
 */
export default function BookDesk({ article, marks = [], arriving = true, onAdd, onReplace, onRemove, onOpenMark, doorFor }) {
  const articleId = article?._id;
  const finePointer = useFinePointer();
  /* What the desk reads back is this reading's; the passages you are offered
     to finish come from every reading. */
  const since = readingSince(article);
  const now = marks.filter(mark => !isEarlier(mark, since));
  const lastReading = since ? article.readBefore[article.readBefore.length - 1] : null;
  const [line, setLine] = useState('');
  const [kind, setKind] = useState('scribble');
  const kindGroup = useId();
  const placeKey = scopedKey(`noeis.book-place.${articleId}.${since}`);
  const [keptPage, setKeptPage] = useState(() => {
    try { return Number(window.localStorage.getItem(placeKey)) || null; } catch (_) { return null; }
  });
  const [turnedPage, setPage] = useState();
  const page = turnedPage === undefined ? keptPage || pageNow(now) : turnedPage;
  const [receipt, setReceipt] = useState('');
  const [inked, setInked] = useState('');
  // An old mark of yours that said nearly the same, a year or more ago.
  const [echo, setEcho] = useState(null);
  const sent = useRef([]);
  const lineRef = useRef(null);

  const sitting = sittingOf(now);
  const [touched, setTouched] = useState(false);
  const setDown = touched ? null : setDownOn(article, now);
  // The first line you type tonight finishes it, unless Escape starts a new one.
  const saved = now.filter(mark => !mark.unsent);
  const unfinished = sitting.length || setDown || touched ? null : midThought(saved);
  const last = sitting.length || setDown || unfinished ? null : lastTime(saved);
  const returning = unfinished
    ? { id: unfinished.mark._id, page: unfinished.mark.page, words: unfinished.words, own: true, label: 'You stopped mid-thought' }
    : last && { ...last, label: 'Last time' };
  const typed = readLine(line, page, kind);
  const actionKind = typed.text ? 'quote' : kind;
  const waiting = marks.filter(mark => mark.text && isUnfinished(mark.text));
  const ghost = typed.text && !isUnfinished(typed.text) ? completionFor(typed.text, marks) : '';
  // Reading it again, the page you turn to says what you marked on it then.
  const then = since && page && !line ? marks.find(mark => isEarlier(mark, since) && mark.page === page) : null;

  const send = async (draft, tempId, { queued = false } = {}) => {
    try {
      const saved = await createHighlight({ articleId, ...draft, captureId: tempId });
      const before = marks.find(mark => mark._id === saved._id);
      const known = Boolean(before);
      onRemove?.(tempId);
      if (known) onReplace?.(saved._id, saved);
      else onAdd?.(saved);
      sent.current.push({ id: saved._id, before });
      setReceipt(receiptFor(draft, saved, known, !known && markedBefore(saved.text, marks, since)) || filedUnder(draft.tags));
      setTouched(true);
      if (!known) heardBefore(articleId, saved.text || saved.note, { echo: true }).then(setEcho, () => {});
      if (draft.text && saved.text !== draft.text) setInked(saved._id);
      return true;
    } catch (error) {
      // A line that waited on this device stays there: the line you are typing now is yours.
      if (error?.response && queued) {
        setReceipt('A line kept on this device did not save yet. It will try again.');
        return false;
      }
      if (error?.response) {
        onRemove?.(tempId);
        setReceipt('That line did not save. It is back in the line to try again.');
        setLine(line);
        setKind(kind);
        return true;
      }
      return false;
    }
  };

  /* Whatever waited for a connection goes as soon as there is one. */
  useEffect(() => {
    if (!articleId) return undefined;
    const flush = async () => {
      // Each line leaves the device once it is saved, and lines typed meanwhile stay.
      for (const { tempId, ...draft } of unsentLines(articleId)) {
        if (await send(draft, tempId, { queued: true })) sentOff(articleId, tempId);
      }
    };
    unsentLines(articleId).forEach(({ tempId, ...draft }) => onAdd?.({ _id: tempId, ...draft, unsent: true }));
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (arriving && finePointer) lineRef.current?.focus({ preventScroll: true });
  }, [articleId, arriving, finePointer]);

  const fold = async () => {
    if (!page) return setReceipt('Turn to a page first: type its number.');
    const saved = await createHighlight({ articleId, page, tags: [DOG_EAR] }).catch(() => null);
    if (!saved) return setReceipt('The corner did not fold. Try it again.');
    onAdd?.(saved);
    sent.current.push({ id: saved._id });
    return setReceipt(`Folded the corner of p. ${page}.`);
  };

  const keepPlace = () => {
    try {
      window.localStorage.setItem(placeKey, String(page));
      setKeptPage(page);
      setReceipt(`Reading place kept at p. ${page}.`);
    } catch (_) {
      setReceipt('This browser couldn’t keep your place.');
    }
  };

  const command = async (word, about) => {
    if (word === 'dog-ear') return fold();
    if (!about) return setReceipt(`Type a line after /${word}, or keep one first.`);
    if (word === 'who') {
      const passage = await heardBefore(articleId, about).catch(() => null);
      return setReceipt(passage
        ? <><cite>{passage.articleTitle || 'Something you saved'}</cite> said it too: <q>{passage.text}</q></>
        : 'Nobody else in your library has said that. Yet.');
    }
    setReceipt('Finding the best case against it…');
    const objection = await argueLine(articleId, about).catch(() => '');
    return setReceipt(objection ? <><b>Against that:</b> {objection}</> : 'Nobody would argue with that just now. Try it again.');
  };

  const keep = async ({ attach = false } = {}) => {
    setEcho(null);
    const asked = kind === 'scribble' && COMMAND.exec(line.trim());
    if (asked) {
      setLine('');
      await command(asked[1], line.trim().slice(asked[0].length) || lastLine(now));
      return;
    }
    const { page: turned, text, note, tags = [] } = typed;
    if (kind !== 'thought') setPage(turned);
    setLine('');
    setReceipt('');
    /* A note sent with ⌥↩ goes under the last quote kept here, one that finishes
       last night's thought runs on from it; a line of only #tags files the
       mark you just made. */
    const finishing = kind === 'scribble' && !attach && note && unfinished?.mark;
    const onto = finishing || (kind === 'scribble' && attach && note
      ? [...sent.current].reverse().map(({ id }) => marks.find(mark => mark._id === id)).find(mark => mark?.text)
      : !text && !note && tags.length && marks.find(mark => mark._id === sent.current[sent.current.length - 1]?.id));
    if (onto) {
      // Taken at once, so a second Return is a line of its own.
      if (finishing) setTouched(true);
      const payload = {
        ...(note ? { note: finishing ? `${onto.note} ${note}` : joinNotes(onto.note, note) } : {}),
        ...(tags.length ? { tags: [...new Set([...(onto.tags || []), ...tags])] } : {})
      };
      const saved = await updateHighlight({ articleId, highlightId: onto._id, payload }).catch(() => null);
      if (saved) {
        sent.current.push({ id: onto._id, before: onto });
        onReplace?.(onto._id, { ...onto, ...saved });
        setReceipt(filedUnder(tags));
        setTouched(true);
        return;
      }
      // Offline, the rest of the thought waits as a line of its own.
      if (!finishing) {
        setLine(line);
        return;
      }
    }
    if (!text && !note) {
      if (tags.length) {
        setLine(line);
        setReceipt('A #word tags this line.');
      }
      return;
    }
    const draft = { text: text || '', note: note || '', ...(tags.length ? { tags } : {}), ...(turned ? { page: turned } : {}) };
    const tempId = lineId();
    onAdd?.({ _id: tempId, ...draft, createdAt: new Date().toISOString() });
    if (await send(draft, tempId)) return;
    keepUnsent(articleId, [...unsentLines(articleId), { tempId, ...draft, createdAt: new Date().toISOString() }]);
    onReplace?.(tempId, { _id: tempId, ...draft, createdAt: new Date().toISOString(), unsent: true });
    setReceipt('Kept on this device. It goes to Noeis when you are back online.');
  };

  /* The page in your lap, photographed, finishes the quotes typed by their ends. */
  const photograph = async (event) => {
    const [file] = event.target.files || [];
    event.target.value = '';
    if (!file) return;
    setReceipt('Reading the page…');
    try {
      const filled = await readBookPage(articleId, await pagePhoto(file));
      filled.forEach(({ _id, text }) => onReplace?.(_id, { text }));
      if (filled.length) setInked(filled[0]._id);
      setReceipt(filled.length
        ? `Finished ${quotes(filled.length)} from the page.`
        : 'Couldn’t find the rest of your quote on that page.');
    } catch (error) {
      setReceipt(error?.response?.data?.error || 'The page could not be read. Try it again in better light.');
    }
  };

  /* A line that made a mark is taken back by deleting it; one that joined a
     mark already there gives that mark back its own note and tags. */
  const takeBack = async () => {
    const { id, before } = sent.current.pop() || {};
    const mark = marks.find(item => item._id === id);
    if (!mark) return;
    if (before) {
      await updateHighlight({ articleId, highlightId: id, payload: { note: before.note || '', tags: before.tags || [] } }).catch(() => null);
      onReplace?.(id, before);
    } else {
      await deleteHighlight({ articleId, highlightId: id }).catch(() => null);
      onRemove?.(id);
    }
    setReceipt(kindOf(mark) === 'fold' ? `Unfolded p. ${mark.page}.` : `Took back “${(mark.text || mark.note).slice(0, 60)}”.`);
  };

  const press = (event) => {
    if (event.nativeEvent.isComposing) return;
    const atEnd = event.target.selectionStart === line.length;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      keep({ attach: event.altKey });
    } else if (ghost && atEnd && (event.key === 'Tab' || event.key === 'ArrowRight')) {
      event.preventDefault();
      setLine(`${line}${ghost}`);
    } else if (event.metaKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setPage(Math.max(1, (page || 0) + (event.key === 'ArrowDown' ? 1 : -1)));
    } else if (event.metaKey && event.key === 'z' && !line) {
      event.preventDefault();
      takeBack();
    } else if (event.key === 'Escape') {
      setLine('');
      if (unfinished) setTouched(true);
    }
  };

  return (
    <section className="book-desk" aria-label="Reading desk">
      <form className="book-desk__line" onSubmit={(event) => { event.preventDefault(); keep(); }}>
        <div className="book-desk__kinds" role="radiogroup" aria-label="What are you keeping?">
          {Object.entries(CAPTURE_KINDS).map(([value, label]) => (
            <label key={value}>
              <input type="radio" name={kindGroup} checked={kind === value} onChange={() => setKind(value)} />
              {label}
            </label>
          ))}
        </div>
        <div className="book-desk__type">
          {/* The ghost sits in a mirror behind the field, so the book's words
              run on from the caret in the same type. */}
          <div className="book-desk__mirror" aria-hidden="true">
            <span>{line}</span><span className="book-desk__ghost">{ghost}</span>{'​'}
          </div>
          <textarea
            ref={lineRef}
            rows={1}
            aria-label="Type a quote, a note or a question"
            enterKeyHint="send"
            value={line}
            placeholder={kind === 'quote' ? 'Write the book’s exact words…' : kind === 'thought' ? 'What are you taking from this book?' : setDown ? 'Why you stopped, or the next line' : unfinished ? 'The rest of that thought' : 'Jot a note…'}
            onChange={(event) => setLine(event.target.value)}
            onKeyDown={press}
          />
        </div>
        <div className="book-desk__actions">
          {kind === 'thought' ? <span>Whole book</span> : (
            <div className="book-desk__place">
              <label className="book-desk__turn">
                <span>p.</span>
                <input
                  aria-label="Page you are on"
                  inputMode="numeric"
                  value={page || ''}
                  size={String(page || '').length || 1}
                  placeholder="–"
                  onChange={(event) => setPage(Number(event.target.value.replace(/\D/g, '')) || null)}
                />
              </label>
              {page && (page === keptPage ? <span>Place kept</span> : (
                <button type="button" className="book-desk__action" onClick={keepPlace}>Keep my place</button>
              ))}
            </div>
          )}
          <button type="submit" className="book-desk__action">Save {CAPTURE_KINDS[actionKind].toLowerCase()}</button>
        </div>
      </form>
      <p className="book-desk__hint" aria-live="polite" data-said={receipt || ghost || then || (kind === 'scribble' && line === '/') ? true : undefined}>
        {receipt || (kind === 'scribble' && line === '/' ? 'Try /dog-ear, /argue or /who.' : ghost ? 'Tab takes the rest of the passage you marked'
          : then ? <>In {yearOf(then)}, on this page: <q>{then.text || then.note}</q></>
            : kind === 'scribble' && unfinished ? 'Return finishes it. Escape starts a new line.'
              : kind === 'scribble' ? 'Return keeps the line. Option-Return adds it to your last quote.' : 'Return saves. Shift-Return adds a line.')}
      </p>
      {Boolean(sitting.length || setDown || returning || lastReading?.finishedOn) && (
        <p className="book-desk__lede">
          {sitting.length ? <><span className="book-desk__label">{sittingLabel(new Date(sitting[sitting.length - 1].createdAt))}</span>{tallyLine(sitting)}</>
            : setDown ? <><span className="book-desk__label">Set down in {monthOf(setDown)}</span>Why’d you stop?</>
              : returning ? <>
                <span className="book-desk__label">{returning.label}{returning.page ? `, p. ${returning.page}` : ''}</span>
                {returning.id && onOpenMark
                  ? <button type="button" className="book-desk__action" onClick={() => onOpenMark(returning.id)}><q className={returning.own ? 'book-desk__own' : ''}>{returning.words}</q></button>
                  : <q className={returning.own ? 'book-desk__own' : ''}>{returning.words}</q>}
              </>
              : <><span className="book-desk__label">Read before, finished {monthOf(dayOf(lastReading.finishedOn))}</span>{lastReading.closingLine ? <q>{lastReading.closingLine}</q> : 'What you marked then is here in faded ink.'}</>}
        </p>
      )}
      <BookPages marks={marks} since={since} inked={inked} doorFor={doorFor} />
      {echo ? (
        <p className="book-desk__echo">
          <q>{echo.text}</q> You marked this in {monthOf(new Date(echo.createdAt))}{echo.articleTitle ? <>, in <cite>{echo.articleTitle}</cite></> : null}.
        </p>
      ) : null}
      {waiting.length ? (
        <label className="book-desk__photo">
          {waiting.length === 1 ? 'Photograph the page to fill in your quote' : `Photograph the page to fill in your ${waiting.length} quotes`}
          <input type="file" accept="image/*" capture="environment" onChange={photograph} />
        </label>
      ) : null}
    </section>
  );
}
