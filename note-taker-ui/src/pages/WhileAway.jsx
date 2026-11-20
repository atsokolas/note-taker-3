import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cancelHandoff, getHandoff, listHandoffs } from '../api/handoffs';
import { getTaste, inkPencil, listPencil, strikePencil } from '../api/pencil';
import { listDisagreements, settleDisagreement } from '../api/disagreements';
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

const keyOf = item => `${item.kind}:${item.id}:${item.highlightId || ''}`;

const hand = side => (side.agent ? `${side.agent} says` : 'You hold');

const SETTLED = { inked: 'Inked.', removed: 'Struck.', restored: 'Struck; your version is back.' };

/* What the reader comes back to: each thing they handed off, what the agent
   says it did, what is open and what it would do next, and what it wrote;
   then where two hands cannot both be right; then everything else agents
   left in pencil, by agent; then what agents
   learn from what the reader keeps and strikes. j and k move through what
   was written, i inks it, x strikes it (with a why, if they like), Return
   opens it. */
const WhileAway = ({ only }) => {
  const [handoffs, setHandoffs] = useState(null);
  const [loose, setLoose] = useState([]);
  const [settled, setSettled] = useState({});
  const [striking, setStriking] = useState('');
  const [why, setWhy] = useState('');
  const [taste, setTaste] = useState(null);
  const [disagreements, setDisagreements] = useState([]);
  const [at, setAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [actionError, setActionError] = useState('');
  const version = useRef(0);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);
    const [listed, pencil, learnt, open] = await Promise.allSettled([
      listHandoffs(), only ? [] : listPencil(), only ? null : getTaste(), only ? [] : listDisagreements()
    ]);
    const summaries = (listed.value || []).filter(h => !only || h.id === only);
    const details = await Promise.allSettled(summaries.map(h => (h.takenBy ? getHandoff(h.id) : h)));
    if (request !== version.current) return;
    if (listed.status === 'fulfilled') {
      setHandoffs(current => {
        const previous = new Map((current || []).map(handoff => [handoff.id, handoff]));
        return summaries.map((summary, index) => details[index].value || { ...previous.get(summary.id), ...summary });
      });
    }
    if (pencil.status === 'fulfilled') setLoose(pencil.value || []);
    if (learnt.status === 'fulfilled') setTaste(learnt.value);
    if (open.status === 'fulfilled') setDisagreements(open.value || []);
    setUnavailable([listed, pencil, learnt, open, ...details].some(result => result.status === 'rejected'));
    setLoading(false);
  }, [only]);
  useEffect(() => {
    load();
    return () => { version.current += 1; };
  }, [load]);

  const byAgent = useMemo(() => {
    const theirs = new Set((handoffs || []).flatMap(h => (h.wrote || []).map(keyOf)));
    const groups = new Map();
    loose.filter(item => !theirs.has(keyOf(item))).forEach(item => {
      if (!groups.has(item.agent)) groups.set(item.agent, []);
      groups.get(item.agent).push(item);
    });
    return [...groups];
  }, [handoffs, loose]);
  // In the order they are shown, so j and k walk down the page.
  const written = useMemo(() => [...(handoffs || []).flatMap(h => h.wrote || []), ...byAgent.flatMap(([, items]) => items)].map(item => ({ ...item, key: keyOf(item) })), [handoffs, byAgent]);
  const act = useCallback(async (message, operation) => {
    setActionError('');
    try { await operation(); } catch (_) { setActionError(message); }
  }, []);
  const ink = useCallback(item => act('Couldn’t keep this change. Try again.', async () => {
    await inkPencil(item);
    setSettled(current => ({ ...current, [item.key]: 'inked' }));
  }), [act]);
  const strike = item => act('Couldn’t strike this change. Your reason is still here.', async () => {
    const struck = await strikePencil({ ...item, why: why.trim() });
    setSettled(current => ({ ...current, [item.key]: struck }));
    setStriking('');
    setWhy('');
  });
  const beginStrike = useCallback(key => {
    setWhy('');
    setStriking(key);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey
        || event.target.closest?.('a, button, input, select, textarea, [contenteditable="true"]')
        || !written.length) return;
      const item = written[Math.min(at, written.length - 1)];
      if (event.key === 'j') setAt(index => Math.min(index + 1, written.length - 1));
      else if (event.key === 'k') setAt(index => Math.max(index - 1, 0));
      else if (event.key === 'i' && !settled[item.key]) ink(item);
      else if (event.key === 'x' && !settled[item.key]) { event.preventDefault(); beginStrike(item.key); }
      else if (event.key === 'Enter') navigate(hrefOf(item));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [written, at, beginStrike, ink, navigate, settled]);

  const renderWritten = (items = []) => (items.length ? (
    <ul className="while-away__wrote">
      {items.map((item) => {
        const key = keyOf(item);
        return (
          <li key={key} className={written[at]?.key === key ? 'is-current' : ''}>
            <Link to={hrefOf(item)}>{item.text || item.title || 'Untitled'}</Link>
            {settled[key] ? <span role="status"> {SETTLED[settled[key]]}</span> : striking === key ? (
              <form className="handoff-form" onSubmit={(event) => { event.preventDefault(); strike({ ...item, key }); }}>
                <input autoFocus aria-label="Why strike it" placeholder="Why? An agent reads this next time." value={why} onChange={event => setWhy(event.target.value)} onKeyDown={event => event.key === 'Escape' && setStriking('')} />
                <button type="submit">Strike</button>
              </form>
            ) : (
              <>
                <button type="button" onClick={() => ink({ ...item, key })}>Keep change</button>
                <button type="button" onClick={() => beginStrike(key)}>Strike…</button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  ) : null);

  return (
    <main className="while-away">
      <h1>While you were away</h1>
      {loading && !handoffs ? <p role="status">Gathering what you handed off…</p> : null}
      {unavailable ? <p className="while-away__quiet" role="status">
        Some handoff details could not load. <button type="button" onClick={load} disabled={loading}>Retry handoffs</button>
      </p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {!loading && !unavailable && !handoffs?.length && !loose.length ? (
        <p className="while-away__quiet">{only ? 'This handoff is unavailable.' : 'Nothing handed off yet. Press ⌘⇧Return on a page to hand it off.'}</p>
      ) : null}
      {(handoffs || []).map(handoff => (
        <section key={handoff.id} className="while-away__handoff">
          <h2>{handoff.ask}</h2>
          <p className="while-away__standing">
            {handoff.context?.title ? <>From <Link to={hrefOf(handoff.context)}>{handoff.context.title}</Link>. </> : null}
            {standing(handoff)}
            {['waiting', 'taken'].includes(handoff.status)
              ? <> <button type="button" onClick={() => act('Couldn’t call off this handoff. Try again.', async () => {
                await cancelHandoff(handoff.id);
                await load();
              })}>Call it off</button></>
              : null}
          </p>
          {['did', 'open', 'next'].filter(field => handoff[field]).map(field => (
            <p key={field} className="while-away__said"><b>{{ did: 'Did', open: 'Open', next: 'Next' }[field]}</b> {handoff[field]}</p>
          ))}
          {renderWritten(handoff.wrote)}
        </section>
      ))}
      {disagreements.length ? (
        <section className="while-away__handoff">
          <h2>Where they disagree</h2>
          {disagreements.map(row => (
            <p key={row.id} className="while-away__said">
              {hand(row.a)}: {row.a.says} {hand(row.b)}: {row.b.says}
              <button type="button" onClick={() => act('Couldn’t settle this disagreement. Try again.', async () => {
                await settleDisagreement(row.id);
                setDisagreements(current => current.filter(item => item.id !== row.id));
              })}>Settled</button>
            </p>
          ))}
        </section>
      ) : null}
      {byAgent.map(([agent, items]) => (
        <section key={agent} className="while-away__handoff">
          <h2>Also in pencil, by {agent}</h2>
          {renderWritten(items)}
        </section>
      ))}
      {taste?.lately?.length ? (
        <section className="while-away__handoff">
          <h2>What agents learn from you</h2>
          <p className="while-away__standing">You have inked {taste.inked} and struck {taste.struck} of what agents wrote. Every agent reads this in its brief.</p>
          <ul className="while-away__wrote">
            {taste.lately.map(verdict => (
              <li key={`${verdict.at}:${verdict.title}`}>
                {verdict.verdict === 'ink' ? 'Kept' : 'Struck'} {verdict.agent}’s {verdict.title || verdict.kind}{verdict.why ? `: ${verdict.why}` : '.'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {written.length ? <p className="while-away__keys">j and k move, i inks, x strikes, Return opens.</p> : null}
      <p className="while-away__keys"><Link to="/editions?paper=agents_reading">What your agents read, by the week</Link> · <Link to="/knows">Does Noeis know you?</Link></p>
    </main>
  );
};

export default function WhileAwayRoute() {
  const [params] = useSearchParams();
  const only = params.get('handoff');
  return <WhileAway key={only} only={only} />;
}
