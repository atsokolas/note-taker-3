import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPassage, readHome } from '../../api/home';
import { apart, dayOf, depthOf, depthSince, monthOf, pathOf } from './homeModel';
import '../../styles/home.css';

/* The three depths of one reading, read once and shown wherever a room
   wants them: Home shows them all, the Library its sources, Books its books.
   A room only chooses what belongs to it; what is kept, what sinks and what
   came back are the same everywhere. */

const LET_GO = 'noeis.home.notNow';
const letGo = () => { try { return new Set(JSON.parse(localStorage.getItem(LET_GO) || '[]')); } catch { return new Set(); } };

// What each kept thing is, under it.
const keptAs = held => ({
  mark: [held.title, held.page && `p. ${held.page}`].filter(Boolean).join(' · '),
  thread: `${held.marks} passages, one thread`,
  source: held.book ? 'A book' : 'A source'
}[held.kind]);

// Home as the server reads it, with keeping and letting rest, for any room.
export const useHome = () => {
  const [home, setHome] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notNow, setNotNow] = useState(letGo);
  const read = useCallback(() => readHome().then(setHome).catch(() => setFailed(true)), []);
  useEffect(() => { read(); }, [read]);
  const keep = passage => keepPassage(passage).then(read);
  const putAside = ({ highlightId }) => {
    const next = new Set([...notNow, highlightId]);
    setNotNow(next);
    try { localStorage.setItem(LET_GO, JSON.stringify([...next])); } catch { /* a private window keeps it for the visit */ }
  };
  const asks = (home?.asks || []).filter(ask => !notNow.has(ask.highlightId));
  return { home: home && { ...home, asks }, failed, read, keep, putAside };
};

// What a room holds of Home: only its own kept things, asks and works.
export const roomOf = (home, belongs) => home && ({
  ...home,
  kept: home.kept.filter(belongs),
  asks: home.asks.filter(belongs),
  forNow: home.forNow.filter(belongs)
});

export function Kept({ kept, asks, onKeep, onNotNow, empty }) {
  return <>
    {kept.length ? (
      <ol className="home__ledger">
        {kept.map(held => (
          <li key={held.highlightId || held.threadId || held.articleId}>
            <time dateTime={held.at || undefined}>{held.at ? monthOf(held.at) : 'kept'}</time>
            <Link to={pathOf(held)}>
              {held.kind === 'mark' ? <q>{held.text || held.note}</q> : held.title}
              <small>{keptAs(held)}</small>
            </Link>
          </li>
        ))}
      </ol>
    ) : <p className="home__quiet">{empty}</p>}
    {asks.map(ask => (
      <p className="home__ask" key={ask.highlightId}>
        <q>{ask.text}</q>
        <small>You keep coming back to this, in {ask.title}.</small>
        <span><button type="button" onClick={() => onKeep(ask)}>Keep it</button><button type="button" onClick={() => onNotNow(ask)}>Not now</button></span>
      </p>
    ))}
  </>;
}

export function ForNow({ works, empty }) {
  return works.length ? (
    <ul className="home__drift">
      {works.map(work => (
        <li key={work.articleId} style={{ '--depth': depthOf(work.at) }}>
          <Link to={pathOf(work)}>{work.title}</Link>
          <span>{[work.marks ? `${work.marks} ${work.marks === 1 ? 'mark' : 'marks'}` : '', dayOf(work.at)].filter(Boolean).join(' · ')}</span>
        </li>
      ))}
    </ul>
  ) : <p className="home__quiet">{empty}</p>;
}

export function Underneath({ underneath }) {
  return underneath.marks ? (
    <p className="home__deep">
      {underneath.marks.toLocaleString()} marks in {underneath.works.toLocaleString()} works{underneath.since ? `, ${depthSince(underneath.since)}` : ''}. Not gone, only out of sight.
    </p>
  ) : <p className="home__quiet">Nothing underneath yet. Everything you mark ends up here, and some of it comes back.</p>;
}

/* One old mark risen beside a new one: nearly the same thought, from another
   work, long apart. It surfaces slowly, the way it would. */
export function CameBack({ pair: { mark, echo }, onKeep }) {
  return (
    <figure className="home__risen" aria-label="Came back today">
      <figcaption>Came back today, {apart(mark.createdAt, echo.createdAt)}</figcaption>
      <blockquote className="home__old">
        <Link to={pathOf({ articleId: echo.articleId, highlightId: echo._id })}><q>{echo.text}</q></Link>
        <small>{echo.articleTitle}, {monthOf(echo.createdAt)}</small>
      </blockquote>
      <blockquote className="home__new">
        <Link to={pathOf({ articleId: mark.bookId, highlightId: mark._id })}><q>{mark.text}</q></Link>
        <small>{mark.bookTitle}, {dayOf(mark.createdAt)}</small>
      </blockquote>
      <button type="button" onClick={() => onKeep({ articleId: echo.articleId, highlightId: echo._id })}>Keep the old one</button>
    </figure>
  );
}
