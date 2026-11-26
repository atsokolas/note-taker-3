import React from 'react';
import { Link } from 'react-router-dom';
import { answerThread } from '../api/home';
import ThreadPassages from '../components/home/ThreadPassages';
import { ThreadAnswers } from './Thread';
import { CameBack, ForNow, Kept, Underneath, useHome } from '../components/home/Depths';
import { formedAcross, pathOf } from '../components/home/homeModel';
import useDocumentTitle from '../hooks/useDocumentTitle';

/* Home: three depths of the same reading. What you keep for good, what you
   are reading for now, which sinks on its own, and underneath, everything
   else: not gone, only out of sight, and now and then one old mark rises
   beside a new one. Nothing here asks to be done. */
export default function Home() {
  useDocumentTitle('Home');
  const { home, failed, read, keep, putAside } = useHome();

  if (!home) {
    return <main className="home" aria-busy={!failed}><p className="home__quiet" role={failed ? 'alert' : 'status'}>{failed ? 'Home could not be read just now.' : 'Opening…'}</p></main>;
  }

  const answer = choice => answerThread(home.forming.threadId, choice).then(read);
  const reading = home.forNow.find(work => work.book);
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
          <Kept kept={home.kept} asks={home.asks} onKeep={keep} onNotNow={putAside}
            empty="Nothing kept yet. Keep what matters for good: a whole source, one passage, or a thread when one forms." />
        </section>

        <section className="home__now" aria-labelledby="home-now">
          <h2 id="home-now">For now <span>it sinks in a couple of weeks</span></h2>
          <ForNow works={home.forNow} empty="Nothing lately. What you read and mark rests here for a while, then sinks." />
        </section>

        <section className="home__under" aria-labelledby="home-under">
          <h2 id="home-under">Underneath</h2>
          <Underneath underneath={home.underneath} />
          {home.cameBack && <CameBack pair={home.cameBack} onKeep={keep} />}
        </section>
      </div>
    </main>
  );
}
