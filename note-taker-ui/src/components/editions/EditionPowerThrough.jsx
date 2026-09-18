import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { issueLine, publicSourceHref } from '../../pages/editionModel';
import { EditionBoundary } from './EditionFinding';
import useEditionArrivals, { rowKey } from './useEditionArrivals';

const metaLine = (row) => [
  row.sourceLabel,
  row.sourceDate,
  [row.profileLabel, issueLine(row)].filter(Boolean).join(' · ')
].filter(Boolean).join(' · ');

const isTyping = (target) => target?.matches?.('input, textarea, select, [contenteditable="true"]');

function PowerItem({ row, active, busy, onActive, onDecision, register }) {
  const key = rowKey(row);
  const href = publicSourceHref(row.url);
  return (
    <article
      ref={(node) => register(key, node)}
      className={`power-item${active ? ' is-active' : ''}`}
      data-power-item={key}
      tabIndex={-1}
      onFocus={() => onActive(key)}
      onPointerEnter={() => onActive(key)}
    >
      <div className="power-item__body">
        <p className="power-item__meta">{metaLine(row)}</p>
        <h2>{row.title}</h2>
        <p className="power-item__finding">{row.finding}</p>
        <EditionBoundary>{row.boundary}</EditionBoundary>
        {row.note ? <p className="power-item__note">{row.note}</p> : null}
        {row.filedBy ? <p className="power-item__filed">Filed by {row.filedBy}</p> : null}
      </div>
      <nav className="power-item__actions" aria-label={`Decide: ${row.title}`}>
        <button disabled={Boolean(busy)} onClick={() => onDecision(row, 'keep')}>
          <span>{row.savedArticleId ? 'Keep and clear' : 'Keep in Library'}</span><kbd>S</kbd>
        </button>
        <button disabled={Boolean(busy)} onClick={() => onDecision(row, 'later')}>
          <span>Later</span><kbd>L</kbd>
        </button>
        <button disabled={Boolean(busy)} onClick={() => onDecision(row, 'seen')}>
          <span>Seen</span><kbd>E</kbd>
        </button>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">Open source ↗</a> : null}
      </nav>
    </article>
  );
}

export default function EditionPowerThrough({ onClose }) {
  const {
    items, error, busy, receipt, undo, more,
    load, loadMore, keep, later, seen, undoChoice
  } = useEditionArrivals({ limit: 40, view: 'power' });
  const [activeId, setActiveId] = useState('');
  const [decided, setDecided] = useState(0);
  const nodes = useRef(new Map());

  const register = useCallback((key, node) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);

  useEffect(() => {
    if (!items?.length) return;
    if (!items.some(row => rowKey(row) === activeId)) setActiveId(rowKey(items[0]));
  }, [activeId, items]);

  const jump = useCallback((delta) => {
    if (!items?.length) return;
    const index = Math.max(0, items.findIndex(row => rowKey(row) === activeId));
    const next = items[Math.min(items.length - 1, Math.max(0, index + delta))];
    const key = rowKey(next);
    setActiveId(key);
    const node = nodes.current.get(key);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node?.focus({ preventScroll: true });
  }, [activeId, items]);

  const decide = useCallback(async (row, kind) => {
    const before = items || [];
    const index = before.findIndex(item => rowKey(item) === rowKey(row));
    const work = kind === 'keep' ? keep : kind === 'later' ? later : seen;
    const completed = await work(row);
    if (!completed) return;
    setDecided(value => value + 1);
    const remaining = before.filter(item => rowKey(item) !== rowKey(row));
    const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
    if (!next) return setActiveId('');
    const key = rowKey(next);
    setActiveId(key);
    requestAnimationFrame(() => {
      const node = nodes.current.get(key);
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node?.focus({ preventScroll: true });
    });
  }, [items, keep, later, seen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') return onClose();
      if (key === 'j') { event.preventDefault(); return jump(1); }
      if (key === 'k') { event.preventDefault(); return jump(-1); }
      const active = items?.find(row => rowKey(row) === activeId);
      if (!active || busy) return;
      if (key === 's' || key === 'l' || key === 'e') {
        event.preventDefault();
        decide(active, key === 's' ? 'keep' : key === 'l' ? 'later' : 'seen');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeId, busy, decide, items, jump, onClose]);

  useEffect(() => {
    let frame;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nearest = [...nodes.current.entries()]
          .map(([key, node]) => ({ key, distance: Math.abs(node.getBoundingClientRect().top - 170) }))
          .sort((left, right) => left.distance - right.distance)[0];
        if (nearest) setActiveId(nearest.key);
      });
    };
    window.addEventListener('scroll', follow, { passive: true });
    return () => { window.removeEventListener('scroll', follow); cancelAnimationFrame(frame); };
  }, []);

  const undoSeen = async () => {
    if (await undoChoice()) setDecided(value => Math.max(0, value - 1));
  };

  return (
    <section className="power-through" aria-labelledby="power-through-title">
      <header className="power-through__head">
        <div>
          <p className="power-through__eyebrow">Editions · New arrivals</p>
          <h1 id="power-through-title">Power through</h1>
          <p>Read the finding, test its edge, then decide. Untouched arrivals stay new.</p>
        </div>
        <button type="button" onClick={onClose}>Return to paper · Esc</button>
      </header>

      <div className="power-through__status" aria-live="polite">
        <span>{items === null ? 'Opening the stack…' : `${items.length} waiting`}</span>
        {decided ? <span>{`${decided} decided`}</span> : null}
        {items?.length ? <span>J/K to move</span> : null}
      </div>

      {error ? (
        <p className="power-through__error" role="alert">
          {error} <button type="button" onClick={() => load({ replace: true })}>Retry</button>
        </p>
      ) : null}

      {receipt ? (
        <p className="power-through__receipt" role="status">
          {receipt.action === 'kept'
            ? 'Kept in your Library.'
            : receipt.fromSetAside ? 'Moved from Set Aside to Later.' : 'Saved for later.'}
        </p>
      ) : null}
      {undo ? (
        <p className="power-through__receipt" role="status">
          Marked seen. <button type="button" onClick={undoSeen} disabled={Boolean(busy)}>Undo</button>
        </p>
      ) : null}

      {items?.length ? (
        <div className="power-through__stack">
          {items.map(row => (
            <PowerItem
              key={rowKey(row)}
              row={row}
              active={rowKey(row) === activeId}
              busy={busy}
              onActive={setActiveId}
              onDecision={decide}
              register={register}
            />
          ))}
        </div>
      ) : items ? (
        <div className="power-through__done">
          <h2>{decided ? 'All caught up.' : 'Nothing waiting.'}</h2>
          <p>The active papers stay open as new work is filed.</p>
          <button type="button" onClick={onClose}>Return to the current issue</button>
        </div>
      ) : null}

      {more ? <button className="power-through__more" type="button" onClick={loadMore}>Open {more} more</button> : null}
      <footer className="power-through__legend">
        <span><kbd>S</kbd> Keep</span><span><kbd>L</kbd> Later</span><span><kbd>E</kbd> Seen</span>
        <Link to="/library?scope=later">Open Later</Link>
      </footer>
    </section>
  );
}
