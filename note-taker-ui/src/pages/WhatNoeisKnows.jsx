import React, { useCallback, useEffect, useState } from 'react';
import { addKnows, dropKnows, listKnows, recallFor } from '../api/knows';

const ORDINALS = ['first', 'second', 'third'];
const placed = rank => (rank <= ORDINALS.length ? `Found ${ORDINALS[rank - 1]}` : `Found, ${rank}th`);

/* Does Noeis know you? The questions you expect your library to answer,
   asked of it now, and whether what you said answers each still comes back
   near the top. Recall is the whole product, so its quality is yours to see. */
const WhatNoeisKnows = () => {
  const [standing, setStanding] = useState(null);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(null);
  const [picked, setPicked] = useState(() => new Set());

  const load = useCallback(() => listKnows().then(setStanding).catch(() => setStanding({ found: 0, of: 0, checks: [] })), []);
  useEffect(() => { load(); }, [load]);

  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    setPicked(new Set());
    setAnswers(await recallFor(question.trim()));
  };
  const pick = id => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const keep = async () => {
    await addKnows({ question: question.trim(), expects: [...picked] });
    setQuestion('');
    setAnswers(null);
    load();
  };

  if (!standing) return <main className="while-away"><p>Asking your questions…</p></main>;

  return (
    <main className="while-away">
      <h1>Does Noeis know you?</h1>
      <p className="while-away__standing">
        {standing.of
          ? `Noeis finds what answers ${standing.found} of your ${standing.of} question${standing.of === 1 ? '' : 's'}, among the first eight it brings back.`
          : 'Ask the questions you expect your library to answer, and say what answers each. Noeis asks them again every time you come here.'}
      </p>
      {standing.checks.map(check => (
        <section key={check.id} className="while-away__handoff">
          <h2>{check.question}</h2>
          <p className="while-away__standing">
            {check.found ? placed(check.rank) : 'Missed: what you named did not come back.'}
            <button type="button" onClick={() => dropKnows(check.id).then(load)}>Drop it</button>
          </p>
        </section>
      ))}
      <form className="handoff-form" onSubmit={ask}>
        <input aria-label="A question your library should answer" placeholder="A question your library should answer" value={question} onChange={event => setQuestion(event.target.value)} />
        <button type="submit">Ask</button>
      </form>
      {answers ? (
        <section className="while-away__handoff">
          <p className="while-away__standing">{answers.length ? 'Which of these answer it?' : 'Nothing came back. Ask it another way, or save what answers it first.'}</p>
          <ul className="while-away__wrote">
            {answers.map(hit => (
              <li key={`${hit.id}:${hit.highlightId || ''}`}>
                <label>
                  <input type="checkbox" checked={picked.has(hit.id)} onChange={() => pick(hit.id)} />
                  {' '}{hit.title}: {hit.passage}
                </label>
              </li>
            ))}
          </ul>
          {picked.size ? <button type="button" className="handoff-open" onClick={keep}>Keep this question</button> : null}
        </section>
      ) : null}
    </main>
  );
};

export default WhatNoeisKnows;
