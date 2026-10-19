import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createHighlight, deleteHighlight, updateHighlight } from '../../api/highlights';
import { useFinePointer } from '../../hooks/useMotionPreferences';
import { scopedKey } from '../../utils/browserScope';
import {
  completionFor, isUnfinished, kindOf, lastTime, pageNow, pagesOf, readLine, sittingOf, tonightLine
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

/* What a sent line became, said once under the line. Nothing when it simply saved. */
const receiptFor = (sent, saved, known) => {
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

/**
 * The reading desk: the book is in your lap, and this is the one line you
 * type into beside it. "212" turns to page 212, a line opening with a quote
 * mark is the book's words, anything else is yours. ⌥↩ puts the line under
 * the quote above it as its note. The page stays where you left it.
 */
export default function BookDesk({ article, marks = [], arriving = true, onAdd, onReplace, onRemove, doorFor }) {
  const articleId = article?._id;
  const finePointer = useFinePointer();
  const [line, setLine] = useState('');
  const [page, setPage] = useState(() => pageNow(marks));
  const [receipt, setReceipt] = useState('');
  const [inked, setInked] = useState('');
  const sent = useRef([]);
  const lineRef = useRef(null);

  const sitting = sittingOf(marks);
  const last = sitting.length ? null : lastTime(marks);
  const pages = useMemo(() => pagesOf(marks), [marks]);
  const typed = readLine(line, page);
  const ghost = typed.text && !isUnfinished(typed.text) ? completionFor(typed.text, marks) : '';

  const send = async (draft, tempId) => {
    try {
      const saved = await createHighlight({ articleId, ...draft });
      const known = marks.some(mark => mark._id === saved._id);
      onRemove?.(tempId);
      if (known) onReplace?.(saved._id, saved);
      else onAdd?.(saved);
      sent.current.push(saved._id);
      setReceipt(receiptFor(draft, saved, known));
      if (draft.text && saved.text !== draft.text) setInked(saved._id);
      return true;
    } catch (error) {
      if (error?.response) {
        onRemove?.(tempId);
        setReceipt('That line did not save. It is back in the line to try again.');
        setLine([draft.page ? String(draft.page) : '', draft.text ? `"${draft.text}` : draft.note].filter(Boolean).join(' '));
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
    if (arriving) lineRef.current?.scrollIntoView?.({ block: 'center' });
    if (finePointer) lineRef.current?.focus({ preventScroll: true });
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const keep = async ({ attach = false } = {}) => {
    const { page: turned, text, note } = readLine(line, page);
    setPage(turned);
    setLine('');
    setReceipt('');
    if (!text && !note) return;
    const quote = attach && note && [...sent.current].reverse()
      .map(id => marks.find(mark => mark._id === id)).find(mark => mark?.text);
    if (quote) {
      const saved = await updateHighlight({ articleId, highlightId: quote._id, payload: { note: joinNotes(quote.note, note) } })
        .catch(() => null);
      if (saved) onReplace?.(quote._id, { ...quote, ...saved });
      else setLine(note);
      return;
    }
    const draft = { text: text || '', note: note || '', ...(turned ? { page: turned } : {}) };
    const tempId = `desk-${Date.now()}`;
    onAdd?.({ _id: tempId, ...draft, createdAt: new Date().toISOString() });
    if (await send(draft, tempId)) return;
    keepUnsent(articleId, [...unsentLines(articleId), { tempId, ...draft, createdAt: new Date().toISOString() }]);
    onReplace?.(tempId, { _id: tempId, ...draft, createdAt: new Date().toISOString(), unsent: true });
    setReceipt('Kept on this device. It goes to Noeis when you are back online.');
  };

  const takeBack = async () => {
    const id = sent.current.pop();
    const mark = marks.find(item => item._id === id);
    if (!mark) return;
    await deleteHighlight({ articleId, highlightId: id }).catch(() => null);
    onRemove?.(id);
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
    }
  };

  return (
    <section className="book-desk" aria-label="Reading desk">
      <p className="book-desk__lede">
        {sitting.length ? <>Tonight · {tonightLine(sitting)}</>
          : last ? <>Last time{last.page ? `, p. ${last.page}` : ''}: <q className={last.own ? 'book-desk__own' : ''}>{last.words}</q></>
            : 'Type as you read. A number turns the page; a quote mark makes the line the book’s own words.'}
      </p>

      {pages.length ? <ol className="book-desk__pages">
        {pages.map(({ label, marks: onPage }) => (
          <li key={`${label}-${onPage[0]._id}`} className="book-desk__page">
            {label ? <span className="book-desk__folio">{label}</span> : null}
            <ul className="book-desk__marks">
              {onPage.map((mark, index) => (
                <li
                  key={mark._id}
                  className="book-desk__mark"
                  data-highlight-id={`highlight-${mark._id}`}
                  data-kind={kindOf(mark)}
                  data-unfinished={(mark.text && isUnfinished(mark.text)) || undefined}
                  data-unsent={mark.unsent || undefined}
                  data-inked={mark._id === inked || undefined}
                >
                  {mark.text ? <blockquote>{mark.text}</blockquote> : null}
                  {mark.note ? <p className="book-desk__own">{mark.note}</p> : null}
                  {doorFor?.(mark, index)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol> : null}

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
            placeholder="“A quote, or what you think"
            onChange={(event) => setLine(event.target.value)}
            onKeyDown={press}
          />
        </div>
      </form>
      <p className="book-desk__hint" aria-live="polite">
        {receipt || (ghost
          ? '⇥ takes the rest of the passage you marked'
          : '↩ keeps the line · ⌥↩ makes it a note on the quote above · ⌘↑ ⌘↓ turn the page')}
      </p>
    </section>
  );
}
