import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMarginNotes } from '../../api/retrieval';
import { useFinePointer, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { buildPassagePath } from '../../utils/sourceRoutes';
import { MarginAnswer } from './MarginAnswer';
import './margins.css';

/* Your library in the margins. One engine (POST /api/semantic/margins) and two
   surfaces: the reader, where a paragraph you are reading meets a passage you
   marked elsewhere, and the notebook, where the paragraph you are writing
   does. A note says only what the index knows: that the two are close. */

// The server's floor, mirrored so a short paragraph is never sent to ask.
export const MARGIN_MIN_WORDS = 12;
const MARGIN_WIDTH = 220;
const GUTTER = 32;
const QUOTE_CHARS = 140;
const STACK_GAP = 12;

export const plainText = value => String(value || '').replace(/\s+/g, ' ').trim();
export const wordCount = value => (plainText(value).match(/\S+/g) || []).length;

const clip = (value) => {
  const text = plainText(value);
  if (text.length <= QUOTE_CHARS) return text;
  const cut = text.slice(0, QUOTE_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > QUOTE_CHARS / 2 ? space : QUOTE_CHARS).replace(/[\s,;:.]+$/, '')}…`;
};

export const markedWhen = (value, now = new Date()) => {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, at.getFullYear() === now.getFullYear()
    ? { month: 'long' }
    : { month: 'long', year: 'numeric' });
};

/* Beside the paragraph when the page has a margin to spare; a small mark
   after it when it does not. Coordinates are relative to `frame`; the margin
   may run to `edge`, or to the window less its gutter. */
export const placeBeside = (node, frame, column, edge = null) => {
  const passage = node.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  const text = column.getBoundingClientRect();
  const limit = Math.min(edge ? edge.getBoundingClientRect().right : Infinity, (window.innerWidth || Infinity) - 16);
  const room = limit - text.right - GUTTER;
  if (room >= MARGIN_WIDTH * 0.8) {
    return {
      mode: 'margin',
      top: passage.top - origin.top,
      left: text.right - origin.left + GUTTER,
      width: Math.min(MARGIN_WIDTH, room - 8)
    };
  }
  return { mode: 'mark', top: passage.bottom - origin.top, left: text.right - origin.left };
};

/* Margin notes must not lie over one another when two close paragraphs both
   carry one: each sits at its paragraph or just below the note above it.
   `growing` names anything that changes a note's height in place. */
export const useStackedMargins = (places, growing = '') => {
  const nodes = useRef([]);
  useLayoutEffect(() => {
    let floor = -Infinity;
    places.forEach((place, index) => {
      const node = nodes.current[index];
      if (!node || place?.mode !== 'margin') return;
      const top = Math.max(place.top, floor);
      node.style.top = `${top}px`;
      floor = top + node.offsetHeight + STACK_GAP;
    });
  }, [places, growing]);
  return index => (node) => { nodes.current[index] = node; };
};

const Lead = ({ highlight }) => {
  const when = markedWhen(highlight.createdAt);
  return (
    <span className="library-margin-note__lead">
      You marked something close
      {highlight.articleTitle ? <> in <cite>{highlight.articleTitle}</cite></> : null}
      {when ? `, ${when}` : ''}:
    </span>
  );
};

/* One note. In the reader it opens the passage where it lives, and may be
   asked about; as a ghost in the notebook, choosing it quotes the passage in.
   On a narrow page the answer opens in the note's own paper card. */
export const MarginNote = forwardRef(({ note, place, onQuote, onAsk, answer = null, onCloseAnswer, hint = '' }, ref) => {
  const reduced = usePrefersReducedMotion();
  const [opened, setOpened] = useState(false);
  const open = opened || Boolean(answer);
  const { highlight } = note;
  const words = (
    <>
      <Lead highlight={highlight} />{' '}
      <span className="library-margin-note__quote">“{clip(highlight.text)}”</span>
      {hint ? <small className="library-margin-note__hint">{hint}</small> : null}
    </>
  );
  const body = onQuote ? (
    <button type="button" className="library-margin-note__body" onClick={() => onQuote(note)}>{words}</button>
  ) : (
    <Link className="library-margin-note__body" to={buildPassagePath({ articleId: highlight.articleId, highlightId: highlight._id })}>
      {words}
    </Link>
  );
  const className = [
    'library-margin-note',
    `is-${place.mode}`,
    onQuote ? 'is-ghost' : '',
    reduced ? '' : 'is-arriving',
    open ? 'is-open' : ''
  ].filter(Boolean).join(' ');
  const ask = onAsk ? (
    <button type="button" className="library-margin-note__ask" onClick={() => onAsk(note)}>Ask</button>
  ) : null;
  return (
    <div
      ref={ref}
      className={className}
      style={{ top: place.top, left: place.left, ...(place.width ? { width: place.width } : {}) }}
      data-beside={note.beside ?? note.paragraph}
    >
      {place.mode === 'mark' ? (
        <>
          <button
            type="button"
            className="library-margin-note__mark"
            aria-expanded={open}
            aria-label={`Something you marked close to this${highlight.articleTitle ? `, in ${highlight.articleTitle}` : ''}`}
            onClick={() => (answer ? onCloseAnswer?.() : setOpened(value => !value))}
          >
            <span aria-hidden="true">“</span>
          </button>
          {open ? <div className="library-margin-note__card">{body}{ask}{answer}</div> : null}
        </>
      ) : <>{body}{ask}</>}
    </div>
  );
});

const BLOCKS = 'p, li, blockquote';

/* The reading's paragraphs, outermost only: a list item's own paragraph is
   the list item. */
const readingBlocks = root => [...root.querySelectorAll(BLOCKS)].filter((node) => {
  const outer = node.parentElement?.closest(BLOCKS);
  return !outer || !root.contains(outer);
});

/* The paragraph that holds a node, or the first one after it (a selection
   can begin in a heading). */
export const paragraphAt = (root, node) => {
  const blocks = root && node ? readingBlocks(root) : [];
  const beside = blocks.findIndex(block => block.contains(node)
    // eslint-disable-next-line no-bitwise
    || Boolean(node.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING));
  return beside < 0 ? null : { beside, paragraph: plainText(blocks[beside].textContent) };
};

/* While reading: up to five notes, never two beside one paragraph, and
   nothing at all when nothing you marked elsewhere is close. When the
   Partner can read the piece (`asking.available`), each note can be asked
   about, and the answer takes its place in the margin. */
export const ArticleMargins = ({ articleId, contentRef, frameRef, contentKey = '', layoutKey = '', hidden = false, asking = null }) => {
  const [notes, setNotes] = useState([]);
  const [places, setPlaces] = useState([]);
  const answer = asking?.answer || null;
  const answerAt = answer ? answer.beside : null;
  // In reading order, an answer just after the note beside its paragraph.
  const items = useMemo(() => [
    ...notes.map(note => ({ key: `${note.highlight._id}-${note.beside}`, beside: note.beside, note })),
    ...(answerAt === null ? [] : [{ key: 'answer', beside: answerAt }])
  ].sort((a, b) => a.beside - b.beside), [notes, answerAt]);

  useEffect(() => {
    setNotes([]);
    const root = contentRef.current;
    if (!articleId || !root) return undefined;
    const asked = readingBlocks(root)
      .map((node, beside) => ({ beside, text: plainText(node.textContent) }))
      .filter(item => wordCount(item.text) >= MARGIN_MIN_WORDS);
    if (!asked.length) return undefined;
    let live = true;
    fetchMarginNotes({ articleId, paragraphs: asked.map(item => item.text) })
      .then((found) => {
        if (!live) return;
        setNotes(found
          .filter(note => asked[note.paragraph] && note.highlight?._id)
          .map(note => ({ ...note, beside: asked[note.paragraph].beside })));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [articleId, contentKey, contentRef]);

  const measure = useCallback(() => {
    const root = contentRef.current;
    const frame = frameRef.current;
    if (!root || !frame || !items.length) {
      setPlaces([]);
      return;
    }
    const blocks = readingBlocks(root);
    setPlaces(items.map(item => (blocks[item.beside]
      ? placeBeside(blocks[item.beside], frame, root)
      : null)));
  }, [contentRef, frameRef, items]);

  useLayoutEffect(() => { measure(); }, [measure, layoutKey]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    document.addEventListener('transitionend', measure);
    const observer = typeof ResizeObserver === 'function' && contentRef.current
      ? new ResizeObserver(() => measure())
      : null;
    if (observer) observer.observe(contentRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('transitionend', measure);
      observer?.disconnect();
    };
  }, [contentRef, measure]);

  const stack = useStackedMargins(places, answer ? `${answer.status}:${answer.reply.length}` : '');
  if (hidden || !items.length) return null;
  const card = answer ? (
    <MarginAnswer
      answer={answer}
      onAsk={typed => asking.ask(answer, typed)}
      onClose={asking.close}
      onContinue={asking.carryOver}
    />
  ) : null;
  const askNote = asking?.available ? note => asking.ask({
    beside: note.beside,
    paragraph: plainText(readingBlocks(contentRef.current)[note.beside]?.textContent),
    highlight: note.highlight
  }) : undefined;
  // On a narrow page an answer beside a note opens inside that note's card.
  const inNote = beside => items.some((item, index) => item.note && item.beside === beside && places[index]?.mode === 'mark');
  return (
    <aside className="library-margins" aria-label="From your library">
      {items.map((item, index) => {
        const place = places[index];
        if (!place) return null;
        if (item.note) {
          const held = place.mode === 'mark' && answerAt === item.beside;
          return (
            <MarginNote
              key={item.key}
              ref={stack(index)}
              note={item.note}
              place={place}
              onAsk={askNote}
              answer={held ? card : null}
              onCloseAnswer={asking?.close}
            />
          );
        }
        if (inNote(item.beside)) return null;
        return (
          <div
            key={item.key}
            ref={stack(index)}
            className={`library-margin-note library-margin-answer is-${place.mode}${place.mode === 'mark' ? ' is-open' : ''}`}
            style={{ top: place.top, left: place.left, ...(place.width ? { width: place.width } : {}) }}
          >
            {place.mode === 'mark' ? <div className="library-margin-note__card">{card}</div> : card}
          </div>
        );
      })}
    </aside>
  );
};

export const useMarginHint = () => (useFinePointer() ? 'Tab to quote it · Esc to let it go' : '');
