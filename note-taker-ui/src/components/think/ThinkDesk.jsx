import React, { useEffect, useState } from 'react';
import { getNotebookCuttings } from '../../api/notebook';
import { dayLabel } from './notebook/notebookStages';

const IDEAS_ON_DESK = 4;
const WHERE = { dimmed: 'Dimmed in', aside: 'Set aside in' };
const DAY = 24 * 60 * 60 * 1000;
const thisMonth = (value, now = new Date()) => {
  const at = new Date(value || 0);
  return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
};

/* The desk: what Think shows when no piece is open. It stores nothing; it is
   the pieces you are writing, a line for a new thought, your ideas, what you
   closed this month, and one cutting worth another look. */
const ThinkDesk = ({ working, ideas, closed, onOpen, onView, onStart, creating, children }) => {
  const [thought, setThought] = useState('');
  const [cutting, setCutting] = useState(null);
  const closedLately = closed.filter(item => thisMonth(item.board?.movedAt || item.board?.archivedAt));

  /* One cutting a day, the same one all day, so it reads as a find rather than a feed. */
  useEffect(() => {
    let live = true;
    getNotebookCuttings()
      .then(rows => { if (live && rows.length) setCutting(rows[Math.floor(Date.now() / DAY) % rows.length]); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const start = (event) => {
    event.preventDefault();
    const title = thought.trim();
    if (!title) return;
    onStart(title);
    setThought('');
  };

  return (
    <section className="think-desk" aria-labelledby="think-desk-title">
      <header className="think-desk__head">
        <p>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 id="think-desk-title">{working.length ? 'Pick up where you stopped.' : 'Nothing is underway.'}</h1>
        {working.length ? null : <p>Open an idea and choose Working above its title, and it waits here.</p>}
      </header>

      {working.length ? (
        <ol className="think-desk__working" aria-label="Working">
          {working.map(item => (
            <li key={item.id}>
              <h2>{item.title}</h2>
              {item.nextTimeLine ? <p className="think-desk__next"><span>Next</span> {item.nextTimeLine}</p> : null}
              <p className="think-desk__meta">
                <button type="button" onClick={() => onOpen(item)}>{item.nextTimeLine ? 'Write the next sentence' : 'Open it'}</button>
                <span>Last written {dayLabel(item.updatedAt)}</span>
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      <form className="think-desk__start" onSubmit={start}>
        <label htmlFor="think-desk-thought">A new thought becomes an idea</label>
        <input
          id="think-desk-thought"
          value={thought}
          maxLength={200}
          placeholder="Start typing. Enter keeps it."
          disabled={creating}
          onChange={event => setThought(event.target.value)}
        />
      </form>
      {children}

      {ideas.length ? (
        <section className="think-desk__ideas" aria-labelledby="think-desk-ideas">
          <h2 id="think-desk-ideas">Ideas, by when you last thought about them</h2>
          <ul>
            {ideas.slice(0, IDEAS_ON_DESK).map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpen(item)}><span>{item.title}</span><small>{dayLabel(item.updatedAt)}</small></button>
              </li>
            ))}
          </ul>
          {ideas.length > IDEAS_ON_DESK ? <button type="button" className="think-desk__more" onClick={() => onView('ideas')}>All {ideas.length} ideas</button> : null}
        </section>
      ) : null}

      {closedLately.length || cutting ? (
        <div className="think-desk__lately">
          {closedLately.length ? (
            <section aria-labelledby="think-desk-closed">
              <h2 id="think-desk-closed">Closed this month</h2>
              <ul>
                {closedLately.map(item => (
                  <li key={item.id}><button type="button" onClick={() => onOpen(item)}>{item.title}</button>{item.board?.became ? <span>{item.board.became}</span> : null}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {cutting ? (
            <section aria-labelledby="think-desk-cutting">
              <h2 id="think-desk-cutting">A cutting you could use</h2>
              <blockquote>{cutting.text}</blockquote>
              <p>{WHERE[cutting.kind]} <button type="button" onClick={() => onOpen({ kind: 'note', id: cutting.noteId })}>{cutting.noteTitle}</button></p>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default ThinkDesk;
