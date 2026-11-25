import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { answerThread, keepPassage, readHome } from '../api/home';
import ThreadPassages from '../components/home/ThreadPassages';
import { ThreadAnswers } from './Thread';
import { apart, dayOf, depthOf, depthSince, formedAcross, monthOf, pathOf } from '../components/home/homeModel';
import useDocumentTitle from '../hooks/useDocumentTitle';
import '../styles/home.css';

const LET_GO = 'noeis.home.notNow';
// What each kept thing is, under it.
const keptAs = held => ({
  mark: [held.title, held.page && `p. ${held.page}`].filter(Boolean).join(' · '),
  thread: `${held.marks} passages, one thread`,
  source: held.book ? 'A book' : 'A source'
}[held.kind]);
const letGo = () => { try { return new Set(JSON.parse(localStorage.getItem(LET_GO) || '[]')); } catch { return new Set(); } };

/* Home: three depths of the same reading. What you keep for good, what you
   are reading for now, which sinks on its own, and underneath, everything
   else: not gone, only out of sight, and now and then one old mark rises
   beside a new one. Nothing here asks to be done. */
export default function Home() {
  useDocumentTitle('Home');
  const [home, setHome] = useState(null);
  const [failed, setFailed] = useState(false);
  const [notNow, setNotNow] = useState(letGo);

  const read = useCallback(() => readHome().then(setHome).catch(() => setFailed(true)), []);
  useEffect(() => { read(); }, [read]);

  const keep = passage => keepPassage(passage).then(read);
  const answer = choice => answerThread(home.forming.threadId, choice).then(read);
  const putAside = ({ highlightId }) => {
    const next = new Set([...notNow, highlightId]);
    setNotNow(next);
    try { localStorage.setItem(LET_GO, JSON.stringify([...next])); } catch { /* a private window keeps it for the visit */ }
  };

  if (!home) {
    return <main className="home" aria-busy={!failed}><p className="home__quiet" role={failed ? 'alert' : 'status'}>{failed ? 'Home could not be read just now.' : 'Opening…'}</p></main>;
  }

  const reading = home.forNow.find(work => work.book);
  const asks = home.asks.filter(ask => !notNow.has(ask.highlightId));
  return (
    <main className="home">
      <header className="home__masthead">
        <h1>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        {reading && <p>You’re reading <Link to={pathOf(reading)}>{reading.title}</Link></p>}
      </header>

      {home.forming && (
        <section className="home__forming" aria-labelledby="home-forming">
          <h2 id="home-forming">Something’s forming <span>{formedAcross(home.forming.marks)}, keep saying one thing.</span></h2>
          <ThreadPassages marks={home.forming.marks} />
          <ThreadAnswers onAnswer={answer} />
        </section>
      )}

      <div className="home__depths">
        <section className="home__kept" aria-labelledby="home-kept">
          <h2 id="home-kept">Kept <span>for good, in the order you kept them</span></h2>
          {home.kept.length ? (
            <ol className="home__ledger">
              {home.kept.map(held => (
                <li key={held.highlightId || held.articleId}>
                  <time dateTime={held.at || undefined}>{held.at ? monthOf(held.at) : 'kept'}</time>
                  <Link to={pathOf(held)}>
                    {held.kind === 'mark' ? <q>{held.text || held.note}</q> : held.title}
                    <small>{keptAs(held)}</small>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="home__quiet">Nothing kept yet. Keep what matters for good: a whole source, one passage, or a thread when one forms.</p>
          )}
          {asks.map(ask => (
            <p className="home__ask" key={ask.highlightId}>
              <q>{ask.text}</q>
              <small>You keep coming back to this, in {ask.title}.</small>
              <span><button type="button" onClick={() => keep(ask)}>Keep it</button><button type="button" onClick={() => putAside(ask)}>Not now</button></span>
            </p>
          ))}
        </section>

        <section className="home__now" aria-labelledby="home-now">
          <h2 id="home-now">For now <span>it sinks in a couple of weeks</span></h2>
          {home.forNow.length ? (
            <ul className="home__drift">
              {home.forNow.map(work => (
                <li key={work.articleId} style={{ '--depth': depthOf(work.at) }}>
                  <Link to={pathOf(work)}>{work.title}</Link>
                  <span>{[work.marks ? `${work.marks} ${work.marks === 1 ? 'mark' : 'marks'}` : '', dayOf(work.at)].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home__quiet">Nothing lately. What you read and mark rests here for a while, then sinks.</p>
          )}
        </section>

        <section className="home__under" aria-labelledby="home-under">
          <h2 id="home-under">Underneath</h2>
          {home.underneath.marks ? (
            <p className="home__deep">
              {home.underneath.marks.toLocaleString()} marks in {home.underneath.works.toLocaleString()} works{home.underneath.since ? `, ${depthSince(home.underneath.since)}` : ''}. Not gone, only out of sight.
            </p>
          ) : (
            <p className="home__quiet">Nothing underneath yet. Everything you mark ends up here, and some of it comes back.</p>
          )}
          {home.cameBack && <CameBack pair={home.cameBack} onKeep={keep} />}
        </section>
      </div>
    </main>
  );
}

/* One old mark risen beside a new one: nearly the same thought, from another
   work, long apart. It surfaces slowly, the way it would. */
function CameBack({ pair: { mark, echo }, onKeep }) {
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
