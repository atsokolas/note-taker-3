import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPassage, readUnderneath } from '../api/home';
import { apart, formedAcross, issueMonth, pathOf } from '../components/home/homeModel';
import useDocumentTitle from '../hooks/useDocumentTitle';
import '../styles/home.css';

/* Underneath, one month: an issue made from your own marks, read the day you
   open it. The old marks a new source met, the thread that formed, and the
   marks that kept coming back. Any old mark in it can be kept from here. */
export default function Underneath() {
  const { month } = useParams();
  const [issue, setIssue] = useState(null);
  const [problem, setProblem] = useState('');
  const [kept, setKept] = useState(() => new Set());
  const name = issueMonth(month);
  useDocumentTitle(`Underneath, ${name}`);

  useEffect(() => {
    readUnderneath(month).then(setIssue).catch(error => setProblem(error?.response?.data?.error || 'This issue could not be read.'));
  }, [month]);

  const keep = async old => {
    await keepPassage(old);
    setKept(current => new Set([...current, old.highlightId]));
  };

  if (!issue) {
    return <main className="home home--issue"><p className="home__quiet" role={problem ? 'alert' : 'status'}>{problem || 'Opening…'}</p></main>;
  }
  const { cameBack, formed, collided } = issue;
  return (
    <main className="home home--issue">
      <header className="home__masthead">
        <h1>Underneath, {name}</h1>
        <p>An issue made from your own marks. <Link to="/editions">The newsstand</Link></p>
      </header>

      {cameBack.length ? (
        <section aria-labelledby="underneath-back">
          <h2 id="underneath-back">What came back <span>old marks something new met this month</span></h2>
          <ol className="home__ledger">
            {cameBack.map(({ old, source, says, at }) => (
              <li key={`${source.articleId}:${old.highlightId}`}>
                <time dateTime={old.createdAt}>{new Date(old.createdAt).getFullYear()}</time>
                <div>
                  <Link to={pathOf(old)}><q>{old.text}</q></Link>
                  <small>{old.title} · came back beside <Link to={pathOf(source)}>{source.title}</Link>, {apart(old.createdAt, at)}</small>
                  {says ? <p className="home__says">{says}</p> : null}
                  {old.kept || kept.has(old.highlightId)
                    ? <small>Kept</small>
                    : <button type="button" className="home__keep" onClick={() => keep(old)}>Keep it</button>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {formed.length ? (
        <section aria-labelledby="underneath-formed">
          <h2 id="underneath-formed">What formed</h2>
          <ol className="home__ledger">
            {formed.map(thread => (
              <li key={thread.threadId}>
                <time>{thread.answer === 'kept' ? 'kept' : 'formed'}</time>
                <Link to={pathOf(thread)}>{thread.title}<small>{formedAcross(thread.marks)}</small></Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {collided.length ? (
        <section aria-labelledby="underneath-collided">
          <h2 id="underneath-collided">What collided most</h2>
          <ol className="home__ledger">
            {collided.map(old => (
              <li key={old.highlightId}>
                <time>{old.times} times</time>
                <Link to={pathOf(old)}><q>{old.text}</q><small>{old.title}</small></Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
