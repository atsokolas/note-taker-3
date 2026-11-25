import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { answerThread, readThread } from '../api/home';
import ThreadPassages from '../components/home/ThreadPassages';
import { formedAcross } from '../components/home/homeModel';
import useDocumentTitle from '../hooks/useDocumentTitle';
import '../styles/home.css';

/* A kept thread's own page: the passages that came together, in the order
   they formed, and how long that took. Not yet answered, it asks. */
export default function Thread() {
  const { id } = useParams();
  const [thread, setThread] = useState(null);
  const [problem, setProblem] = useState('');
  useDocumentTitle(thread?.title || 'A thread');

  useEffect(() => {
    readThread(id).then(setThread).catch(error => setProblem(error?.response?.data?.error || 'That thread could not be read.'));
  }, [id]);

  const answer = async choice => setThread(await answerThread(id, choice));

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
      {thread.answer === 'kept'
        ? <p className="home__quiet">Kept for good. <Link to="/">Home</Link></p>
        : <ThreadAnswers onAnswer={answer} />}
    </main>
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
