import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { setEditionItemState } from '../../api/editions';
import {
  aheadLine,
  byHand,
  costLine,
  handsOf,
  issueLine,
  passageHref,
  WATCH_STATUS,
  standLayout,
  stateOf,
  windowLine
} from '../../pages/editionModel';
import EditionShare from './EditionShare';
import EditionFinding from './EditionFinding';
import SectionSilence from './SectionSilence';
import SourcePeek from './SourcePeek';
import ThoughtComposer, { useEditionThoughts } from './ThoughtComposer';
import useEditionIssue from './useEditionIssue';
import { findingAnchor, readingPosition, writeEditionLocal } from './editionReadingState';

const READ_AFTER_MS = 4000;

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 9H5v12h14V9h-3M12 15V2m-4 4 4-4 4 4" />
  </svg>
);

const issuePath = issue => `/editions/${encodeURIComponent(issue._id)}`;

/**
 * An issue, read the way the mocks drew it: the headline first and what it
 * costs to read, the findings in short, then each finding led by what it
 * means, and a closing line that says what you took and what comes next.
 *
 * With a finding in focus the issue steps back to a line of context and the
 * finding has the page to itself, with the ones either side a step away.
 */
export default function EditionReading({
  issue,
  paper = null,
  focusItem = '',
  focusSection = '',
  source = false,
  by = '',
  onItem,
  onBy
}) {
  const { edition, pending, error, busy, receipts, act, showPending } = useEditionIssue(issue._id);
  const root = useRef(null);
  const [peek, setPeek] = useState(null);
  const [selection, setSelection] = useState(null);
  const thoughts = useEditionThoughts(issue._id);
  useEffect(() => {
    const clear = () => setSelection(null);
    const check = () => {
      if (window.getSelection()?.isCollapsed) clear();
    };
    window.addEventListener('scroll', clear, { passive: true });
    document.addEventListener('selectionchange', check);
    return () => {
      window.removeEventListener('scroll', clear);
      document.removeEventListener('selectionchange', check);
    };
  }, []);
  const { columns, looseItems } = standLayout(edition);
  const hands = handsOf(edition);
  /* A filter only means something when more than one hand is on the issue. */
  const hand = hands.length > 1 ? hands.find(row => row.agent.key === by) : null;
  const shaped = columns.length ? columns : [{ key: '', label: '', items: looseItems }];
  const all = shaped.flatMap(section => section.items.map(item => ({ item, section: section.label })));
  const shown = hand ? all.filter(({ item }) => byHand(item, hand.agent.key)) : all;
  const items = shown.map(({ item }) => item);
  const quiet = hand ? [] : shaped.filter(section => section.label && !section.items.length);
  const jump = useCallback((id) => {
    const element = document.getElementById(findingAnchor(id));
    element?.scrollIntoView({ block: 'start', behavior: 'auto' });
    element?.focus({ preventScroll: true });
  }, []);
  const loaded = Boolean(edition);
  const latest = useRef(edition);
  latest.current = edition;
  useEffect(() => {
    if (!loaded || !focusItem) return;
    /* A finding on its own opens at the top, under its line of context. */
    const frame = requestAnimationFrame(() => {
      window.scrollTo?.(0, 0);
      document.getElementById(findingAnchor(focusItem))?.focus({ preventScroll: true });
    });
    /* Stepping past a finding is not reading it: it counts as read once the
       reader has had it on screen a moment, so new counts hold while J skims
       or the tab sits in the background. Only a new finding becomes read; a
       Later or a Keep made meanwhile stands. */
    let read;
    const markRead = () => {
      const status = latest.current?.items.find(row => row.itemId === focusItem)?.readerStatus || 'new';
      if (status === 'new') Promise.resolve(setEditionItemState(issue._id, focusItem, 'opened')).catch(() => {});
    };
    const dwell = () => {
      clearTimeout(read);
      if (!document.hidden) read = setTimeout(markRead, READ_AFTER_MS);
    };
    dwell();
    document.addEventListener('visibilitychange', dwell);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(read);
      document.removeEventListener('visibilitychange', dwell);
    };
  }, [loaded, focusItem, issue._id]);
  /* A link to a column opens at its first finding. */
  useEffect(() => {
    const first = !focusItem && focusSection && latest.current?.items.find(row => row.section === focusSection);
    if (!loaded || !first) return undefined;
    const frame = requestAnimationFrame(() => jump(first.itemId));
    return () => cancelAnimationFrame(frame);
  }, [loaded, focusSection, focusItem, jump]);
  useEffect(() => {
    if (!loaded) return;
    let frame;
    const remember = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (peek) return;
        const el = readingPosition(root.current);
        if (el) {
          writeEditionLocal('last', 'place', {
            profile: edition.profile,
            issueId: issue._id,
            itemId: el.dataset.readingItem,
            title: el.querySelector('h2')?.textContent
          });
        }
      });
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      window.removeEventListener('scroll', remember);
      cancelAnimationFrame(frame);
    };
  }, [loaded, edition?.profile, issue._id, peek]);
  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || peek || !selection) return;
      setSelection(null);
      event.preventDefault();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [peek, selection]);
  /* The finding the reader is on: the one in focus, else the one in view. */
  const current = useCallback(
    () => items.find(item => item.itemId === focusItem)
      || items.find(item => item.itemId === readingPosition(root.current)?.dataset.readingItem),
    [items, focusItem]
  );
  /* J and K step through findings at any scale; O opens the source here, and
     with Shift the original in a new tab. */
  useEffect(() => {
    const step = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || peek) return;
      if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      const here = current();
      if (!here || !['j', 'k', 'o'].includes(key)) return;
      event.preventDefault();
      if (key === 'o') {
        const href = passageHref(here);
        if (event.shiftKey) {
          if (href) window.open(href, '_blank', 'noopener,noreferrer');
        } else onItem(here.itemId, { source: '1' });
        return;
      }
      const index = items.indexOf(here);
      const next = !focusItem && key === 'j' ? here : items[index + (key === 'j' ? 1 : -1)];
      if (next) onItem(next.itemId, {}, { replace: Boolean(focusItem) });
    };
    document.addEventListener('keydown', step);
    return () => document.removeEventListener('keydown', step);
  }, [current, focusItem, items, onItem, peek]);
  /* The source is a scale of its own, so it has a URL; a thought is a note in
     the margin, so it does not. */
  const openPeek = (item, view, origin, quote = '') => {
    setSelection(null);
    if (view === 'source') onItem(item.itemId, { source: '1' });
    else setPeek({ itemId: item.itemId, view, origin, quote });
  };
  const captureSelection = (event) => {
    const value = window.getSelection();
    const text = value?.toString().trim();
    if (!text || text.length < 3 || text.length > 1000 || !value.rangeCount) {
      setSelection(null);
      return;
    }
    const range = value.getRangeAt(0);
    if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    setSelection({
      itemId: event.currentTarget.dataset.findingText,
      quote: text,
      top: Math.max(8, Math.min(window.innerHeight - 48, rect.bottom + 8)),
      left: Math.max(12, Math.min(window.innerWidth - 170, rect.left))
    });
  };
  const absorb = () => {
    const anchor = readingPosition(root.current);
    const before = anchor?.getBoundingClientRect().top;
    const id = anchor?.id;
    showPending();
    requestAnimationFrame(() => {
      const after = document.getElementById(id)?.getBoundingClientRect().top;
      if (Number.isFinite(before) && Number.isFinite(after)) window.scrollBy(0, after - before);
    });
  };

  const row = edition || issue;
  const issueLabel = paper?.issueLabel;
  const name = issueLine({ ...row, issueLabel }) || 'This issue';
  const paperTitle = paper?.title || row.profileLabel || row.title || '';
  const run = paper?.issues || [];
  const place = run.findIndex(other => other._id === issue._id);
  const before = place > 0 ? run[place - 1] : null;
  const after = place >= 0 ? run[place + 1] : null;
  const closed = stateOf(row) === 'closed';
  const kept = items.filter(item => item.savedArticleId).length;
  const newCount = pending?.items?.filter(item => !edition?.items?.some(held => held.itemId === item.itemId)).length || 0;
  const sourceDoor = id => document.getElementById(findingAnchor(id))?.querySelector('.reading-open');
  const side = peek || (source && focusItem ? { itemId: focusItem, view: 'source', origin: sourceDoor(focusItem) } : null);
  const sideItem = side && edition?.items.find(item => item.itemId === side.itemId);
  const focused = focusItem ? shown.findIndex(({ item }) => item.itemId === focusItem) : -1;

  const finding = ({ item, section }, index) => (
    <EditionFinding
      key={item.itemId}
      item={item}
      number={index + 1}
      section={section}
      zoomed={item.itemId === focusItem}
      editionId={issue._id}
      busy={busy}
      receipt={receipts[item.itemId]}
      onAct={act}
      onPeek={openPeek}
      onSelection={captureSelection}
    />
  );

  return (
    <div ref={root} data-testid="edition-read" className="edition-issue">
      {error ? <p role="alert" className="reading-error">{error}</p> : null}
      {!edition ? <p role="status">Opening this issue…</p> : null}
      {edition && focused >= 0 ? (
        <section className="edition-focus" aria-label="One finding">
          <Link className="edition-focus__context" to={issuePath(issue)}>
            {[name, row.headline || paperTitle].filter(Boolean).join(' · ')}
          </Link>
          <p className="edition-focus__count">Finding {focused + 1} of {shown.length}</p>
          {finding(shown[focused], focused)}
          <nav className="edition-focus__steps" aria-label="Other findings">
            {focused > 0 ? (
              <button type="button" onClick={() => onItem(items[focused - 1].itemId, {}, { replace: true })}>← Previous</button>
            ) : (
              <Link to={issuePath(issue)}>← Back to {name.toLowerCase().startsWith('this') ? 'the issue' : name}</Link>
            )}
            {items[focused + 1] ? (
              <button type="button" onClick={() => onItem(items[focused + 1].itemId, {}, { replace: true })}>
                Next: {items[focused + 1].plain || items[focused + 1].title} →
              </button>
            ) : null}
          </nav>
        </section>
      ) : null}
      {edition && focused < 0 ? (
        <>
          <header className="edition-issue__head">
            <p className="edition-issue__dateline">
              {[issueLine({ ...row, issueLabel }), windowLine(row) ? `covers ${windowLine(row)}` : ''].filter(Boolean).join(' · ')}
            </p>
            <h1>{row.headline || paperTitle || name}</h1>
            {row.standfirst ? <p className="edition-issue__deck">{row.standfirst}</p> : null}
            <div className="edition-issue__meta">
              <p>{costLine(items)}</p>
              {hands.length > 1 ? (
                <label className="reading-by">
                  Filed by{' '}
                  <select value={hand ? hand.agent.key : ''} onChange={event => onBy(event.target.value)}>
                    <option value="">Everyone</option>
                    {hands.map(row => <option key={row.agent.key} value={row.agent.key}>{row.agent.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="edition-issue__share">
                <EditionShare editionId={issue._id} edition={edition} triggerIcon={<ShareIcon />} />
              </div>
            </div>
          </header>
          {items.length || quiet.length || edition.followUps?.length ? (
            <section className="edition-short" aria-label="In short">
              <div>
                <h2>In short</h2>
                <ol>
                  {shown.map(({ item }, index) => (
                    <li key={item.itemId}>
                      <a
                        href={`#${findingAnchor(item.itemId)}`}
                        onClick={(event) => {
                          event.preventDefault();
                          jump(item.itemId);
                        }}
                      >
                        <span className="edition-short__number">{String(index + 1).padStart(2, '0')}</span>
                        {item.plain || item.title}
                      </a>
                    </li>
                  ))}
                  {quiet.map(section => (
                    <li key={section.key} className="edition-short__quiet">
                      <span className="edition-short__number" aria-hidden="true">—</span>
                      <span>
                        <span className="edition-short__label">{section.label}</span>
                        <SectionSilence
                          silence={edition.silences?.find(silence => silence.key === section.key)}
                          fallback={`Nothing filed under ${section.label} in this issue.`}
                        />
                      </span>
                    </li>
                  ))}
                  {!items.length && !quiet.length ? <li className="edition-short__quiet">No findings filed in this issue yet.</li> : null}
                </ol>
              </div>
              {edition.followUps?.length ? (
                <aside className="edition-since" aria-labelledby="edition-since-title">
                  <h2 id="edition-since-title">
                    Since {issueLine({ issueLabel, number: Number(row.number) - 1 }) || 'last issue'}
                  </h2>
                  <ul>
                    {edition.followUps.map(({ watch, status, note }) => (
                      <li key={watch}>
                        <span className={`reading-status reading-status--${status}`}>{WATCH_STATUS[status]}</span>
                        {watch}
                        {note ? <small>{note}</small> : null}
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </section>
          ) : null}
          {hand && all.length > items.length ? (
            <p className="reading-hidden" role="status">
              {all.length - items.length} finding{all.length - items.length === 1 ? '' : 's'} by other hands hidden while you read {hand.agent.name}’s.{' '}
              <button type="button" onClick={() => onBy('')}>Show everyone</button>
            </p>
          ) : null}
          {shown.map(finding)}
          {edition.throughLine || edition.watchNext?.length ? (
            <section className="edition-take" aria-label="The take">
              {edition.throughLine ? (
                <div>
                  <h2>What it adds up to</h2>
                  <p className="edition-take__line">{edition.throughLine}</p>
                </div>
              ) : null}
              {edition.watchNext?.length ? (
                <div>
                  <h2>Watching for next time</h2>
                  <ul>
                    {edition.watchNext.map(line => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
          <footer className="edition-receipt">
            <p className="edition-receipt__line">
              {kept ? `You kept ${kept} of ${items.length}. ` : ''}
              {closed ? 'That’s the whole issue.' : 'That’s the issue so far.'}
            </p>
            <nav className="edition-receipt__run" aria-label="Other issues">
              {before ? <Link to={issuePath(before)}>← {issueLine({ ...before, issueLabel }) || windowLine(before)}</Link> : <span />}
              {after
                ? <Link to={issuePath(after)}>{issueLine({ ...after, issueLabel }) || windowLine(after)} →</Link>
                : <span className="edition-receipt__ahead">{aheadLine(row, issueLabel)}</span>}
            </nav>
            <ThoughtComposer {...thoughts} itemId="" label="What stayed with you?" />
          </footer>
        </>
      ) : null}
      {pending ? (
        <div className="reading-arrivals" role="status">
          <button onClick={absorb}>
            {newCount ? `${newCount} finding${newCount === 1 ? '' : 's'} added` : 'This issue has an update'} · Show
          </button>
        </div>
      ) : null}
      {selection && !peek ? (
        <button
          className="reading-selection"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const item = items.find((row) => row.itemId === selection.itemId);
            const origin = document.getElementById(findingAnchor(item.itemId))?.querySelector('.reading-actions button:last-child');
            openPeek(item, 'thought', origin, selection.quote);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Leave a thought
        </button>
      ) : null}
      {sideItem ? (
        <SourcePeek
          key={`${sideItem.itemId}:${side.view}`}
          item={sideItem}
          {...side}
          onClose={() => (peek ? setPeek(null) : onItem(focusItem))}
          thoughtProps={thoughts}
        />
      ) : null}
    </div>
  );
}
