import React, { useState } from 'react';
import ThinkMark from './ThinkMark';
import { STAGES, dayLabel, stageLine } from './notebook/notebookStages';

const SENSE = {
  ...Object.fromEntries(STAGES.map(({ key, sense }) => [key, sense])),
  concept: 'Names you keep, each with what you know about it.',
  question: 'What you are still asking, and what you settled.'
};
const EMPTY = {
  in_progress: 'Nothing underway. Open an idea and choose Working above its title.',
  idea: 'No ideas yet. Choose New idea and write a line.',
  done: 'Nothing closed yet.',
  concept: 'No concepts yet.',
  question: 'No questions yet.'
};
const NAMING = {
  concept: { kind: 'concept', label: 'Name a concept', limit: 80 },
  question: { kind: 'question', label: 'Ask a question', limit: 500 }
};

/* One way of looking at Think, as a ruled list: Working, Ideas, Closed,
   Concepts or Questions. Concepts and questions are started from here. */
const ThinkIndex = ({ view, items, onOpen, onName, creating }) => {
  const naming = NAMING[view.mark];
  const [draft, setDraft] = useState('');
  const [saying, setSaying] = useState('');

  const name = async (event) => {
    event.preventDefault();
    const words = draft.trim();
    if (!words) return;
    setSaying('');
    try {
      if (await onName(naming.kind, words)) setDraft('');
    } catch (_error) {
      setSaying(`Could not start that ${naming.kind}. Try again in a moment.`);
    }
  };

  return (
    <section className="think-index" aria-labelledby="think-index-title">
      <header className="think-index__head">
        <h1 id="think-index-title">{view.label} <small>{items.length}</small></h1>
        <p>{SENSE[view.mark]}</p>
      </header>
      {naming ? (
        <form className="think-index__name" onSubmit={name}>
          <input aria-label={naming.label} placeholder={naming.label} maxLength={naming.limit} value={draft} disabled={creating} onChange={event => setDraft(event.target.value)} />
          {saying ? <p role="status">{saying}</p> : null}
        </form>
      ) : null}
      {items.length ? (
        <ul className="think-index__list">
          {items.map(item => (
            <li key={`${item.kind}:${item.id}`}>
              <button type="button" onClick={() => onOpen(item)}>
                <ThinkMark mark={item.kind === 'note' ? item.stage : item.kind} />
                <span>{item.title}</span>
                <small>{stageLine(item) || (item.settled ? 'settled' : dayLabel(item.updatedAt))}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="think-index__empty">{EMPTY[view.mark]}</p>}
    </section>
  );
};

export default ThinkIndex;
