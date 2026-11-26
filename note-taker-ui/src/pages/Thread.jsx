import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { answerThread, growThread, readThread } from '../api/home';
import ThreadPassages from '../components/home/ThreadPassages';
import { dayOf, formedAcross, pathOf } from '../components/home/homeModel';
import useDocumentTitle from '../hooks/useDocumentTitle';
import { createKeptPage } from '../api/wiki';
import { buildThreadPagePayload } from '../utils/wikiCreate';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import HangInMuseum from '../components/museum/HangInMuseum';
import '../styles/home.css';

/* A kept thread's own page: the passages that came together, in the order
   they formed, and how long that took. Not yet answered, it asks. Kept, it
   keeps growing: something you marked since that bears on it is offered in
   pencil below the last passage, and joins only if you add it. */
export default function Thread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [thread, setThread] = useState(null);
  const [problem, setProblem] = useState('');
  useDocumentTitle(thread?.title || 'A thread');

  useEffect(() => {
    readThread(id).then(setThread).catch(error => setProblem(error?.response?.data?.error || 'That thread could not be read.'));
  }, [id]);

  const answer = async choice => setThread(await answerThread(id, choice));
  const grow = async joins => setThread(await growThread(id, thread.offered, joins));
  const makePage = async () => navigate(wikiPagePath((await createKeptPage(buildThreadPagePayload(thread)))._id));

  if (!thread) {
    return <main className="home home--thread"><p className="home__quiet" role={problem ? 'alert' : 'status'}>{problem || 'Opening…'}</p></main>;
  }
  return (
    <main className="home home--thread">
      <header className="home__masthead">
        <h1>{thread.title}</h1>
        <p>{formedAcross(thread.marks)}.</p>
      </header>
      <ThreadPassages marks={thread.marks} />
      {thread.offered && <Offered passage={thread.offered} onGrow={grow} />}
      {thread.answer === 'kept'
        ? <p className="home__quiet">Kept for good. <button type="button" onClick={makePage}>Make it a page</button> <HangInMuseum kind="thread" id={thread.threadId} /></p>
        : <ThreadAnswers onAnswer={answer} />}
    </main>
  );
}

// In pencil, on the thread line, where it would go: after the newest passage.
function Offered({ passage, onGrow }) {
  return (
    <aside className="thread-offered" aria-label="It may belong here">
      <small>Marked {dayOf(passage.createdAt)}, and it may belong here</small>
      <Link to={pathOf(passage)}><q>{passage.text}</q><small>{passage.title}</small></Link>
      <p className="home__answers">
        <button type="button" onClick={() => onGrow(true)}>Add it to the thread</button>
        <button type="button" onClick={() => onGrow(false)}>Not this one</button>
      </p>
    </aside>
  );
}

export function ThreadAnswers({ onAnswer }) {
  return (
    <p className="home__answers">
      <button type="button" onClick={() => onAnswer('kept')}>Keep it</button>
      <button type="button" onClick={() => onAnswer('not yet')}>Not yet</button>
      <button type="button" onClick={() => onAnswer('not a thing')}>Not a thing</button>
    </p>
  );
}
