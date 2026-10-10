import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { handsOf, issueLine, publicSourceHref } from '../../pages/editionModel';
import AgentMark from './AgentMark';
import { handOf } from './editionAgent';
import { EditionBoundary } from './EditionFinding';
import SourcePeek from './SourcePeek';
import { useEditionThoughts } from './ThoughtComposer';
import useEditionArrivals from './useEditionArrivals';

const metaLine = (row) => [
  [row.profileLabel, issueLine(row)].filter(Boolean).join(' · '),
  row.sourceLabel,
  row.sourceDate
].filter(Boolean).join(' · ');

const isTyping = (target) => target?.matches?.('input, textarea, select, [contenteditable="true"]');

/* Reading the source here needs the issue's thoughts beside it. */
function PowerPeek({ row, onClose }) {
  const thoughts = useEditionThoughts(row.editionId);
  return <SourcePeek item={row} view="source" origin={null} onClose={onClose} thoughtProps={thoughts} />;
}

/* A row of choices that narrow the stack; the chosen one is pressed. */
const Scope = ({ label, options, value, onChoose }) => (
  <div className="power-through__scope" role="group" aria-label={label}>
    <span>{label}</span>
    {options.map(option => (
      <button key={option.value || 'all'} type="button" aria-pressed={value === option.value} onClick={() => onChoose(option.value)}>
        {option.label}
      </button>
    ))}
  </div>
);

/**
 * What is new, one finding at a time: read it, test its edge, decide. Narrow
 * the stack to one paper or one agent's hand; open the source here or the
 * original beside it. Untouched findings stay new.
 */
export default function EditionPowerThrough({ papers = [], paper = '', by = '', onScope, onClose }) {
  const { items, error, busy, receipt, undo, more, load, loadMore, keep, later, seen, undoChoice } =
    useEditionArrivals({ paper, by });
  const [index, setIndex] = useState(0);
  const [decided, setDecided] = useState(0);
  const [reading, setReading] = useState(false);
  const row = items?.length ? items[Math.min(index, items.length - 1)] : null;
  const total = decided + (items?.length || 0) + more;
  const scoped = paper ? papers.filter(row => row.profile === paper) : papers;
  const hands = handsOf({ items: scoped.flatMap(row => row.issues.flatMap(issue => issue.filings || [])) });

  useEffect(() => {
    if (items && !items.length && more) loadMore();
  }, [items, more, loadMore]);

  useEffect(() => {
    const decide = async (work) => {
      if (row && !busy && await work(row)) setDecided(value => value + 1);
    };
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || reading) return;
      const key = event.key.toLowerCase();
      const act = {
        s: () => decide(keep),
        l: () => decide(later),
        e: () => decide(seen),
        j: () => setIndex(value => Math.min(value + 1, (items?.length || 1) - 1)),
        k: () => setIndex(value => Math.max(value - 1, 0)),
        o: () => {
          const href = publicSourceHref(row?.url);
          if (!event.shiftKey) setReading(true);
          else if (href) window.open(href, '_blank', 'noopener,noreferrer');
        }
      }[key];
      if (!act || !row) return;
      event.preventDefault();
      act();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, items, keep, later, reading, row, seen]);

  const choose = async (work) => {
    if (await work(row)) setDecided(value => value + 1);
  };
  const undoSeen = async () => {
    if (await undoChoice()) setDecided(value => Math.max(0, value - 1));
  };
  const href = publicSourceHref(row?.url);

  return (
    <section className="power-through" aria-labelledby="power-through-title">
      <header className="power-through__head">
        <h1 id="power-through-title">Power through</h1>
        <p aria-live="polite">
          {items === null ? 'Opening the stack…' : row ? `${decided + Math.min(index, items.length - 1) + 1} of ${total}` : ''}
        </p>
      </header>

      {papers.length > 1 ? (
        <Scope
          label="Papers"
          value={paper}
          options={[{ value: '', label: 'Every paper' }, ...papers.map(row => ({ value: row.profile, label: row.title }))]}
          onChoose={value => onScope({ paper: value })}
        />
      ) : null}
      {hands.length > 1 ? (
        <Scope
          label="Filed by"
          value={by}
          options={[{ value: '', label: 'Everyone' }, ...hands.map(({ agent }) => ({ value: agent.key, label: <AgentMark {...handOf(agent)} /> }))]}
          onChoose={value => onScope({ by: value })}
        />
      ) : null}

      {total ? (
        <div className="power-through__progress" aria-hidden="true">
          <span style={{ '--done': decided / total }} />
        </div>
      ) : null}

      {error ? (
        <p className="power-through__error" role="alert">
          {error} <button type="button" onClick={() => load({ replace: true })}>Retry</button>
        </p>
      ) : null}
      {receipt ? (
        <p className="power-through__receipt" role="status">
          {receipt.action === 'kept'
            ? <>Kept <i>{receipt.row.title}</i> in your Library.</>
            : receipt.fromSetAside ? 'Moved from Set Aside to Later.' : <>Saved <i>{receipt.row.title}</i> for later.</>}
        </p>
      ) : null}
      {undo ? (
        <p className="power-through__receipt" role="status">
          Marked seen. <button type="button" onClick={undoSeen} disabled={Boolean(busy)}>Undo</button>
        </p>
      ) : null}

      {row ? (
        <article className="power-item" key={`${row.editionId}:${row.itemId}`}>
          <p className="power-item__meta">{metaLine(row)}</p>
          <h2>{row.title}</h2>
          <p className="power-item__finding">{row.finding}</p>
          <EditionBoundary>{row.boundary}</EditionBoundary>
          {row.note ? <p className="power-item__note">{row.note}</p> : null}
          {row.filedBy ? (
            <p className="power-item__filed">
              Filed by <AgentMark runtime={row.filedByRuntime} label={row.filedBy} />
            </p>
          ) : null}
          <nav className="power-item__source" aria-label="Open the source">
            <button type="button" onClick={() => setReading(true)}>Read it here <kbd>O</kbd></button>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer">The original ↗ <kbd>⇧O</kbd></a> : null}
          </nav>
          <nav className="power-item__actions" aria-label={`Decide: ${row.title}`}>
            <button disabled={Boolean(busy)} onClick={() => choose(keep)}>
              <span>{row.savedArticleId ? 'Keep and clear' : 'Keep in Library'}</span><kbd>S</kbd>
            </button>
            <button disabled={Boolean(busy)} onClick={() => choose(later)}><span>Later</span><kbd>L</kbd></button>
            <button disabled={Boolean(busy)} onClick={() => choose(seen)}><span>Seen</span><kbd>E</kbd></button>
          </nav>
        </article>
      ) : items && !more ? (
        <div className="power-through__done">
          <h2>{decided ? 'All caught up.' : 'Nothing waiting.'}</h2>
          <p>New findings join the stack as your agents file them.</p>
          <button type="button" onClick={onClose}>Back to your papers</button>
        </div>
      ) : null}

      <footer className="power-through__legend">
        <span><kbd>J</kbd><kbd>K</kbd> Move</span>
        <span><kbd>O</kbd> Read it here</span>
        <span><kbd>Esc</kbd> Done for now</span>
        <Link to="/library?scope=later">Open Later</Link>
      </footer>
      {reading && row ? <PowerPeek row={row} onClose={() => setReading(false)} /> : null}
    </section>
  );
}
