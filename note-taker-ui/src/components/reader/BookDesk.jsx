import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createHighlight, deleteHighlight, updateHighlight } from '../../api/highlights';
import { readBookPage } from '../../api/imports';
import { useFinePointer } from '../../hooks/useMotionPreferences';
import { scopedKey } from '../../utils/browserScope';
import { buildConceptPath } from '../../utils/sourceRoutes';
import { pagePhoto } from '../../utils/pagePhoto';
import {
  completionFor, dayOf, isEarlier, isUnfinished, kindOf, lastTime, markedBefore, midThought, monthOf, pageNow, pagesOf,
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

const joinNotes = (held = '', more = '') => (held ? `${held}\n\n${more}` : more);

const yearOf = mark => new Date(mark.createdAt).getFullYear();

/* What a sent line became, said once under the line. Nothing when it simply saved. */
const quotes = count => (count === 1 ? 'a quote' : `${count} quotes`);

const filedUnder = (tags = []) => (tags.length ? `Filed under ${tags.map(tag => `#${tag}`).join(' ')}.` : '');

const receiptFor = (sent, saved, known, earlier) => {
  if (earlier) return `You marked this in ${yearOf(earlier)} too.`;
  if (known) {
    return /\bLocation\b/.test(saved.location || '')
      ? 'You marked this on your Kindle too. It is one mark now, with your note.'
      : 'You had marked this already. It is one mark now.';
  }
  if (!sent.text || !isUnfinished(sent.text)) return '';
  return isUnfinished(saved.text)
    ? 'Kept as you typed it. The middle fills in when the Kindle or the book brings it.'
    : 'Filled in from the book.';
};

/* The book's pages as you marked them, each mark under its page, earlier
   readings in fainter ink. The desk writes into it; a lent copy only reads it. */
export function BookPages({ marks = [], since = 0, inked = '', doorFor }) {
  const pages = useMemo(() => pagesOf(marks), [marks]);
  return pages.length ? (
    <ol className="book-desk__pages">
      {pages.map(({ label, marks: onPage }) => (
        <li key={`${label}-${onPage[0]._id}`} className="book-desk__page">
          {label ? <span className="book-desk__folio">{label}</span> : null}
          <ul className="book-desk__marks">
            {onPage.map(mark => (
              <li
                key={mark._id}
                className="book-desk__mark"
                data-highlight-id={`highlight-${mark._id}`}
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
 * under that concept. ⌥↩ puts the line under the quote above it as its
 * note. The page stays where you left it.
 */
export default function BookDesk({ article, marks = [], arriving = true, onAdd, onReplace, onRemove, doorFor }) {
  const articleId = article?._id;
  const finePointer = useFinePointer();
  /* What the desk reads back is this reading's; the passages you are offered
     to finish come from every reading. */
  const since = readingSince(article);
  const now = marks.filter(mark => !isEarlier(mark, since));
  const lastReading = since ? article.readBefore[article.readBefore.length - 1] : null;
  const [line, setLine] = useState('');
  const [page, setPage] = useState(() => pageNow(now));
  const [receipt, setReceipt] = useState('');
  const [inked, setInked] = useState('');
  const sent = useRef([]);
  const lineRef = useRef(null);

  const sitting = sittingOf(now);
  const [touched, setTouched] = useState(false);
  const setDown = touched ? null : setDownOn(article, now);
  // The first line you type tonight finishes it, unless Escape starts a new one.
  const unfinished = sitting.length || setDown || touched ? null : midThought(now);
  const last = sitting.length || unfinished ? null : lastTime(now);
  const typed = readLine(line, page);
  const waiting = marks.filter(mark => mark.text && isUnfinished(mark.text));
  const ghost = typed.text && !isUnfinished(typed.text) ? completionFor(typed.text, marks) : '';
  // Reading it again, the page you turn to says what you marked on it then.
  const then = since && page && !line ? marks.find(mark => isEarlier(mark, since) && mark.page === page) : null;

  const send = async (draft, tempId) => {
    try {
      const saved = await createHighlight({ articleId, ...draft });
      const before = marks.find(mark => mark._id === saved._id);
      const known = Boolean(before);
      onRemove?.(tempId);
      if (known) onReplace?.(saved._id, saved);
      else onAdd?.(saved);
      sent.current.push({ id: saved._id, before });
      setReceipt(receiptFor(draft, saved, known, !known && markedBefore(saved.text, marks, since)) || filedUnder(draft.tags));
      setTouched(true);
      if (draft.text && saved.text !== draft.text) setInked(saved._id);
      return true;
    } catch (error) {
      if (error?.response) {
        onRemove?.(tempId);
        setReceipt('That line did not save. It is back in the line to try again.');
        setLine([draft.page ? String(draft.page) : '', draft.text ? `"${draft.text}` : draft.note, ...(draft.tags || []).map(tag => `#${tag}`)].filter(Boolean).join(' '));
        return true;
      }
      return false;
    }
  };

  /* Whatever waited for a connection goes as soon as there is one. */
  useEffect(() => {
    if (!articleId) return undefined;
    const flush = async () => {
      const waiting = unsentLines(articleId);
      if (!waiting.length) return;
      const left = [];
      for (const { tempId, ...draft } of waiting) {
        if (!(await send(draft, tempId))) left.push({ tempId, ...draft });
      }
      keepUnsent(articleId, left);
    };
    unsentLines(articleId).forEach(({ tempId, ...draft }) => onAdd?.({ _id: tempId, ...draft, unsent: true }));
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The book opens where you are in it: the newest pages and the line, unless
     a link asked for one passage. */
  useEffect(() => {
    if (arriving) lineRef.current?.scrollIntoView?.({ block: 'nearest' });
    if (finePointer) lineRef.current?.focus({ preventScroll: true });
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const keep = async ({ attach = false } = {}) => {
    const { page: turned, text, note, tags = [] } = readLine(line, page);
    setPage(turned);
    setLine('');
    setReceipt('');
    /* A note sent with ⌥↩ goes under the quote above it, one that finishes
       last night's thought runs on from it; a line of only #tags files the
       mark you just made. */
    const finishing = !attach && note && unfinished?.mark;
    const onto = finishing || (attach && note
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
        setReceipt('A #word files the line it is on, or the mark you just made.');
      }
      return;
    }
    const draft = { text: text || '', note: note || '', ...(tags.length ? { tags } : {}), ...(turned ? { page: turned } : {}) };
    const tempId = `desk-${Date.now()}`;
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
        : 'Nothing on that page finishes a quote you typed by its ends.');
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
    setReceipt(`Took back “${(mark.text || mark.note).slice(0, 60)}”.`);
  };

  const press = (event) => {
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
      <p className="book-desk__lede">
        {sitting.length ? <><span className="book-desk__label">{sittingLabel(new Date(sitting[sitting.length - 1].createdAt))}</span>{tallyLine(sitting)}</>
          : setDown ? <><span className="book-desk__label">Set down in {monthOf(setDown)}</span>Why’d you stop?</>
          : unfinished ? <><span className="book-desk__label">You stopped mid-thought{unfinished.mark.page ? `, p. ${unfinished.mark.page}` : ''}</span><q className="book-desk__own">{unfinished.words}</q></>
          : last ? <><span className="book-desk__label">Last time{last.page ? `, p. ${last.page}` : ''}</span><q className={last.own ? 'book-desk__own' : ''}>{last.words}</q></>
            : lastReading?.finishedOn ? <><span className="book-desk__label">Read before, finished {monthOf(dayOf(lastReading.finishedOn))}</span>{lastReading.closingLine ? <q>{lastReading.closingLine}</q> : 'What you marked then is here in faded ink.'}</>
              : 'Type as you read. A number turns the page, a quote mark makes the line the book’s own words, and a #word files it under that concept.'}
      </p>

      <BookPages marks={marks} since={since} inked={inked} doorFor={doorFor} />

      <form className="book-desk__line" onSubmit={(event) => { event.preventDefault(); keep(); }}>
        <label className="book-desk__turn">
          <span>p.</span>
          <input
            aria-label="Page you are on"
            inputMode="numeric"
            value={page || ''}
            placeholder="–"
            onChange={(event) => setPage(Number(event.target.value.replace(/\D/g, '')) || null)}
          />
        </label>
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
            placeholder={setDown ? 'Why you stopped, or the next line' : unfinished ? 'The rest of that thought' : 'A quote, or what you think'}
            onChange={(event) => setLine(event.target.value)}
            onKeyDown={press}
          />
        </div>
      </form>
      <p className="book-desk__hint" aria-live="polite" data-said={receipt || ghost || then ? true : undefined}>
        {receipt || (ghost ? 'Tab takes the rest of the passage you marked'
          : then ? <>In {yearOf(then)}, on this page: <q>{then.text || then.note}</q></>
            : unfinished ? 'Return finishes it. Escape starts a new line.'
              : 'Return keeps the line. Option-Return adds it to the quote above.')}
      </p>
      {waiting.length ? (
        <label className="book-desk__photo">
          {waiting.length === 1 ? 'Photograph the page to finish the quote you typed by its ends' : `Photograph the page to finish the ${waiting.length} quotes you typed by their ends`}
          <input type="file" accept="image/*" capture="environment" onChange={photograph} />
        </label>
      ) : null}
    </section>
  );
}
