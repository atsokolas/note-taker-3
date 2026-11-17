import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cancelHandoff, getHandoff, listHandoffs } from '../api/handoffs';
import { inkPencil } from '../api/pencil';
import { WHO, timeOf } from '../components/handoff/HandOff';

const hrefOf = item => ({
  note: `/think?tab=notebook&entryId=${item.id}`,
  article: `/articles/${item.id}`,
  highlight: `/library?articleId=${item.id}&highlightId=${item.highlightId}`,
  work_note: '/work',
  wiki_page: `/wiki/workspace?page=${item.id}`
}[item.kind] || '/');

const standing = (handoff) => {
  if (handoff.status === 'done') return `${handoff.takenBy} finished at ${timeOf(handoff.finishedAt)}.`;
  if (handoff.status === 'taken') return `With ${handoff.takenBy} since ${timeOf(handoff.takenAt)}.`;
  if (handoff.status === 'cancelled') return 'Called off.';
  return `Waiting for ${WHO[handoff.to] || 'an agent'} since ${timeOf(handoff.createdAt)}.`;
};

/* What the reader comes back to: each thing they handed off, what the agent
   says it did, what is open and what it would do next, and what it wrote,
   in pencil, to take up. j and k move through what was written, i inks it,
   Return opens it. */
const WhileAway = () => {
  const [handoffs, setHandoffs] = useState(null);
  const [inked, setInked] = useState(() => new Set());
  const [at, setAt] = useState(0);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const only = searchParams.get('handoff');

  const load = useCallback(async () => {
    const listed = await listHandoffs();
    setHandoffs(await Promise.all(listed.filter(h => !only || h.id === only).map(h => (h.takenBy ? getHandoff(h.id) : h))));
  }, [only]);
  useEffect(() => { load().catch(() => setHandoffs([])); }, [load]);

  const written = useMemo(() => (handoffs || []).flatMap(h => (h.wrote || []).map(item => ({ ...item, key: `${item.kind}:${item.id}:${item.highlightId || ''}` }))), [handoffs]);
  const ink = useCallback(async (item) => {
    await inkPencil(item);
    setInked(current => new Set(current).add(item.key));
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, [contenteditable="true"]') || !written.length) return;
      if (event.key === 'j') setAt(index => Math.min(index + 1, written.length - 1));
      else if (event.key === 'k') setAt(index => Math.max(index - 1, 0));
      else if (event.key === 'i') ink(written[at]);
      else if (event.key === 'Enter') navigate(hrefOf(written[at]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [written, at, ink, navigate]);

  if (!handoffs) return <main className="while-away"><p>Gathering what you handed off…</p></main>;

  return (
    <main className="while-away">
      <h1>While you were away</h1>
      {handoffs.length ? null : <p className="while-away__quiet">Nothing handed off yet. Press ⌘⇧Return on a page to hand it off.</p>}
      {handoffs.map(handoff => (
        <section key={handoff.id} className="while-away__handoff">
          <h2>{handoff.ask}</h2>
          <p className="while-away__standing">
            {handoff.context?.title ? <>From <Link to={hrefOf(handoff.context)}>{handoff.context.title}</Link>. </> : null}
            {standing(handoff)}
            {['waiting', 'taken'].includes(handoff.status)
              ? <> <button type="button" onClick={() => cancelHandoff(handoff.id).then(load)}>Call it off</button></>
              : null}
          </p>
          {['did', 'open', 'next'].filter(field => handoff[field]).map(field => (
            <p key={field} className="while-away__said"><b>{{ did: 'Did', open: 'Open', next: 'Next' }[field]}</b> {handoff[field]}</p>
          ))}
          {handoff.wrote?.length ? (
            <ul className="while-away__wrote">
              {handoff.wrote.map((item) => {
                const key = `${item.kind}:${item.id}:${item.highlightId || ''}`;
                const index = written.findIndex(entry => entry.key === key);
                return (
                  <li key={key} className={index === at ? 'is-current' : ''}>
                    <Link to={hrefOf(item)}>{item.text || item.title || 'Untitled'}</Link>
                    {inked.has(key) ? <span> Inked.</span> : <button type="button" onClick={() => ink({ ...item, key })}>Ink it</button>}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ))}
      {written.length ? <p className="while-away__keys">j and k move, i inks, Return opens.</p> : null}
    </main>
  );
};

export default WhileAway;
