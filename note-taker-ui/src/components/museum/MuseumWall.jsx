import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../motion/columnMotion';
import {
  arrivedIn, atThePassage, frameOf, museumPath, reviewedLine, standsOn, tagOf, wallTitle
} from './museumModel';

const LIFT = { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
const FOCUSABLE = 'a[href], button:not([disabled])';

export const Frame = React.forwardRef(({ piece }, ref) => {
  const { text, maxim, quoted, size, fit } = frameOf(piece);
  const Words = quoted && !maxim ? 'q' : 'span';
  return (
    <span className="museum-frame" ref={ref}>
      <span className="museum-mat">
        <Words className={`${maxim ? 'museum-maxim' : 'museum-passage'}${quoted ? '' : ' is-title'}`} style={{ '--size': `${size}px`, '--fit': fit }}>{text}</Words>
      </span>
    </span>
  );
});

const Tag = ({ piece, name }) => (
  <span className="museum-tag">
    <code>{tagOf(piece, name)}</code>
    <span>{piece.own ? `by ${name || 'you'}` : piece.author}</span>
  </span>
);

/*
 * The wall, and the case a piece comes down into.
 *
 * Every frame is hung by its owner and every one opens: the wall shows the
 * whole person at a glance, the case shows why one piece is there. Taking a
 * frame down leaves the pale patch where it hung, the way a lent painting
 * does, so the wall behind the case still says where it came from.
 */
export default function MuseumWall({ museum, open = '', onOpen, ownerActions = null, head = null, children = null }) {
  const { name, intro, handle, pieces = [], retired = [] } = museum;
  const frames = useRef(new Map());
  const lifted = useRef(null);
  const object = useRef(null);
  const close = useRef(null);
  const dialog = useRef(null);
  const last = useRef('');
  const [copied, setCopied] = useState('');
  const at = pieces.findIndex(piece => piece.accession === open);
  const piece = pieces[at];

  useLayoutEffect(() => {
    const from = lifted.current;
    lifted.current = null;
    if (!from || !object.current || prefersReducedMotion()) return;
    const start = from.getBoundingClientRect();
    const end = object.current.getBoundingClientRect();
    if (!end.width) return;
    object.current.animate?.([
      { transformOrigin: 'top left', transform: `translate(${start.left - end.left}px, ${start.top - end.top}px) scale(${start.width / end.width})` },
      { transformOrigin: 'top left', transform: 'none' }
    ], LIFT);
  }, [open]);

  useEffect(() => {
    setCopied('');
    if (piece) {
      close.current?.focus();
      document.body.classList.add('museum-is-viewing');
    } else if (last.current) {
      frames.current.get(last.current)?.closest('button')?.focus();
    }
    last.current = piece ? piece.accession : '';
    return () => document.body.classList.remove('museum-is-viewing');
  }, [piece]);

  const lift = (accession) => {
    lifted.current = frames.current.get(accession) || null;
    onOpen(accession);
  };
  const walk = step => onOpen(pieces[(at + step + pieces.length) % pieces.length].accession);
  const key = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onOpen(''); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); walk(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); walk(-1); }
    else if (event.key === 'Home') { event.preventDefault(); onOpen(pieces[0].accession); }
    else if (event.key === 'End') { event.preventDefault(); onOpen(pieces.at(-1).accession); }
    else if (event.key === 'Tab') {
      const stops = [...dialog.current.querySelectorAll(FOCUSABLE)];
      const edge = event.shiftKey ? stops[0] : stops.at(-1);
      if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? stops.at(-1) : stops[0]).focus(); }
    }
  };

  const link = handle ? `${window.location.origin}${museumPath(handle, open)}` : '';
  const copy = () => navigator.clipboard?.writeText(link).then(() => setCopied('Link copied.'), () => setCopied(link));
  const titled = accession => pieces.find(candidate => candidate.accession === accession);
  const opens = list => list.map(other => (
    <button type="button" key={other.accession} className="museum-placard__link" onClick={() => onOpen(other.accession)}>{other.title}</button>
  ));
  const rows = piece ? [
    ['Room', piece.room],
    ['Accession', tagOf(piece, name)],
    ['Arrived', arrivedIn(piece)],
    ['Kept current', reviewedLine(piece.reviewedAt)],
    ['Led to', opens(piece.ledTo.map(titled).filter(Boolean))],
    ['Stands on', opens(standsOn(pieces, piece.accession))]
  ].filter(([, value]) => (Array.isArray(value) ? value.length : value)) : [];
  const read = piece && (piece.own ? piece.url : atThePassage(piece.url, piece.passage));
  const keepable = piece && !piece.own && /^https?:\/\//.test(piece.url);

  return (
    <div className="museum museum-room">
      <header className="museum__head">
        <h1>{wallTitle(name)}</h1>
        {intro ? <p className="museum__intro">{intro}</p> : null}
        {head}
      </header>
      {retired.includes(open) ? <p className="museum__retired" role="status">This piece was taken down from the wall.</p> : null}
      {pieces.length ? <ol className="museum__wall" aria-label={wallTitle(name)}>
        {pieces.map(hung => (
          <li key={hung.accession} className={`museum-piece${hung.own ? ' is-own' : ''}${hung.accession === open ? ' is-out' : ''}`}>
            <button
              type="button"
              className="museum-piece__open"
              aria-label={`${hung.own ? `By ${name || 'you'}` : hung.author || 'Unattributed'}, ${hung.title}. Open.`}
              onClick={() => lift(hung.accession)}
            >
              <Frame piece={hung} ref={node => (node ? frames.current.set(hung.accession, node) : frames.current.delete(hung.accession))} />
              <Tag piece={hung} name={name} />
            </button>
          </li>
        ))}
      </ol> : null}
      {children}
      {piece ? (
        <div className="museum-vitrine" role="dialog" aria-modal="true" aria-labelledby="museum-vitrine-title" ref={dialog} onKeyDown={key}>
          <div className="museum-vitrine__stage">
            <div className="museum-vitrine__bar">
              <button type="button" ref={close} onClick={() => onOpen('')}>Back to the wall</button>
              {link ? <span className="museum-vitrine__address">{link.replace(/^https?:\/\//, '')}</span> : null}
            </div>
            <figure className={`museum-vitrine__object${piece.own ? ' is-own' : ''}`}>
              <Frame piece={piece} ref={object} />
              <Tag piece={piece} name={name} />
              <span className="museum-vitrine__shelf" aria-hidden="true" />
            </figure>
            <nav className="museum-vitrine__pager" aria-label="Walk the wall">
              <button type="button" onClick={() => walk(-1)}>Back</button>
              <span className="museum-vitrine__ticks" aria-hidden="true">
                {pieces.map(hung => <i key={hung.accession} className={hung.accession === open ? 'is-here' : ''} />)}
              </span>
              <span className="museum-vitrine__count">{at + 1} of {pieces.length}</span>
              <button type="button" onClick={() => walk(1)}>Next</button>
            </nav>
          </div>
          <aside className="museum-placard">
            <p className="museum-placard__author">{piece.own ? name : piece.author}</p>
            <h2 id="museum-vitrine-title" className="museum-placard__title">{piece.title}</h2>
            {[piece.medium, piece.year].filter(Boolean).length ? <p className="museum-placard__medium">{[piece.medium, piece.year].filter(Boolean).join(', ')}</p> : null}
            <p className="museum-placard__why">{piece.why}</p>
            {rows.length ? (
              <dl className="museum-placard__receipts">
                {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
            ) : null}
            <div className="museum-placard__actions">
              {read ? <a href={read} target={read.startsWith('/') ? undefined : '_blank'} rel="noreferrer">Read it</a> : null}
              {keepable ? <a href={`/library/save?url=${encodeURIComponent(piece.url)}`}>Keep a copy</a> : null}
              {link ? <button type="button" onClick={copy}>Copy link to this piece</button> : null}
            </div>
            {copied ? <p className="museum-placard__copied" role="status">{copied}</p> : null}
            {ownerActions ? ownerActions(piece) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
