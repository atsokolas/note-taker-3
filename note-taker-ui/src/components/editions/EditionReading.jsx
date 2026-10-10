import React, { useEffect, useCallback, useRef, useState } from 'react';
import { setEditionItemState } from '../../api/editions';
import {
  byHand,
  datelineLine,
  foreignFilers,
  handsOf,
  issueLine,
  passageHref,
  WATCH_STATUS,
  latestFilingLine,
  sectionTones,
  standLayout,
  stateOf
} from '../../pages/editionModel';
import EditionShare from './EditionShare';
import { EditionSourcesJump, EditionSourcesList, useEditionSources } from './EditionSources';
import AgentMark, { KeeperMark } from './AgentMark';
import { agentOf, handOf } from './editionAgent';
import EditionDesk from './EditionDesk';
import EditionFinding from './EditionFinding';
import SectionSilence from './SectionSilence';
import SourcePeek from './SourcePeek';
import ThoughtComposer, { useEditionThoughts } from './ThoughtComposer';
import useEditionIssue from './useEditionIssue';
import {
  findingAnchor,
  readEditionLocal,
  readingPosition,
  writeEditionLocal
} from './editionReadingState';

const READ_AFTER_MS = 4000;

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 9H5v12h14V9h-3M12 15V2m-4 4 4-4 4 4" />
  </svg>
);

export default function EditionReading({
  issue,
  paperTitle = '',
  issueLabel,
  keepers = {},
  deskOf = () => [],
  focusItem = '',
  focusSection = '',
  source = false,
  by = '',
  focus,
  onFocus,
  onItem,
  onBy
}) {
  const { edition, pending, error, busy, receipts, act, showPending } = useEditionIssue(issue._id);
  const root = useRef(null);
  const focusButton = useRef(null);
  const [peek, setPeek] = useState(null);
  const [selection, setSelection] = useState(null);
  const [resume, setResume] = useState(() => readEditionLocal(issue._id, 'place'));
  const thoughts = useEditionThoughts(issue._id);
  const sources = useEditionSources(edition);
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
  const sections = hand
    ? shaped
      .map(section => ({ ...section, items: section.items.filter(item => byHand(item, hand.agent.key)) }))
      .filter(section => section.items.length)
    : shaped;
  const items = sections.flatMap((section) => section.items);
  const hidden = hand ? shaped.flatMap(section => section.items).length - items.length : 0;
  const quietHidden = hand ? shaped.filter(section => !section.items.length).length : 0;
  const jump = useCallback((id, dismiss = true) => {
    const element = document.getElementById(findingAnchor(id));
    element?.scrollIntoView({ block: 'start', behavior: 'auto' });
    element?.focus({ preventScroll: true });
    if (dismiss) setResume(null);
  }, []);
  const loaded = Boolean(edition);
  useEffect(() => {
    if (!loaded || !focusItem) return;
    const frame = requestAnimationFrame(() => jump(focusItem));
    /* Stepping past a finding is not reading it: it counts as read once the
       reader has stayed on it a moment, so new counts hold while J skims. */
    const read = setTimeout(() => {
      Promise.resolve(setEditionItemState(issue._id, focusItem, 'opened')).catch(() => {});
    }, READ_AFTER_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(read);
    };
    // An explicit incoming finding link wins over a remembered place.
  }, [loaded, focusItem, issue._id, jump]);
  useEffect(() => {
    if (!loaded || !focusSection || focusItem) return undefined;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`edition-section-${focusSection}`);
      element?.scrollIntoView({ block: 'start', behavior: 'auto' });
      element?.focus({ preventScroll: true });
      setResume(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded, focusSection, focusItem]);
  useEffect(() => {
    if (!loaded) return;
    let frame;
    const remember = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (peek) return;
        const el = readingPosition(root.current);
        if (el) {
          const place = {
            profile: edition.profile,
            issueId: issue._id,
            itemId: el.dataset.readingItem,
            title: el.querySelector('h2')?.textContent
          };
          writeEditionLocal(issue._id, 'place', place);
          writeEditionLocal('last', 'place', place);
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
      if (event.key !== 'Escape' || event.defaultPrevented || peek) return;
      if (selection) setSelection(null);
      else if (focus) {
        onFocus(false);
        focusButton.current?.focus({ preventScroll: true });
      } else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [focus, peek, selection, onFocus]);
  /* The finding the reader is on: the one in focus, else the one in view. */
  const current = useCallback(
    () => items.find(item => item.itemId === focusItem)
      || items.find(item => item.itemId === readingPosition(root.current)?.dataset.readingItem),
    [items, focusItem]
  );
  /* J and K step through findings at any power; O opens the source here, and
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
  /* The source is a power of its own, so it has a URL; a thought is a note in
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
  const status = stateOf(row);
  const collectionState = status === 'closed'
    ? 'Collection ended'
    : status === 'filling'
      ? 'Still filling'
      : 'Collection window ahead';
  const filingState = latestFilingLine(edition);
  const mastheadTitle = paperTitle || edition?.profileLabel || edition?.title || issue.title || '';
  const newCount =
    pending?.items?.filter((item) => !edition?.items?.some((held) => held.itemId === item.itemId))
      .length || 0;
  const sourceDoor = id => document.getElementById(findingAnchor(id))?.querySelector('.reading-actions button');
  const shown = peek || (source && focusItem ? { itemId: focusItem, view: 'source', origin: sourceDoor(focusItem) } : null);
  const currentPeek = shown && edition?.items.find((item) => item.itemId === shown.itemId);
  const tones = sectionTones(sections);
  /* The editor's mark only matters once more than one hand is on the paper. */
  const writer = agentOf({ label: row.writtenBy, runtime: row.writtenByRuntime });
  /* Read off the opened issue, so a Keep shows in "Kept by you" at once. */
  const desk = deskOf(edition);
  const foreign = foreignFilers(edition || {}, keepers);
  const editor = desk.length > 1 && writer ? handOf(writer) : null;
  return (
    <div ref={root} data-testid="edition-read">
      <div className="edition-paper-tools">
        <button
          ref={focusButton}
          type="button"
          className="edition-paper-tools__just-read"
          onClick={() => onFocus(!focus)}
          aria-pressed={focus}
        >
          Just read
        </button>
        <div className="edition-paper-tools__share">
          <EditionShare editionId={issue._id} edition={edition} triggerIcon={<ShareIcon />} />
        </div>
      </div>
      {mastheadTitle ? (
        <header className="edition-nameplate">
          <h1>{mastheadTitle}</h1>
        </header>
      ) : null}
      <div className="reading-dateline" aria-label="Issue dateline">
        <span className="reading-dateline__number">
          {issueLine({ ...row, issueLabel }) || issueLine(row)}
        </span>
        <span className="reading-dateline__when">{datelineLine(row)}</span>
        <span className="reading-dateline__state">
          {[filingState, collectionState].filter(Boolean).join(' · ')}
        </span>
      </div>
      <EditionDesk hands={desk} />
      {hands.length > 1 ? (
        <div className="reading-hands" role="group" aria-label="Filed by">
          <span>Filed by</span>
          <button type="button" aria-pressed={!hand} onClick={() => onBy('')}>Everyone</button>
          {hands.map(row => (
            <button key={row.agent.key} type="button" aria-pressed={hand?.agent.key === row.agent.key} onClick={() => onBy(row.agent.key)}>
              <AgentMark {...handOf(row.agent)} /> <span className="reading-hands__count">{row.count}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="reading-intro">
        {row.headline ? <h2 className="reading-headline">{row.headline}</h2> : null}
        {row.standfirst ? <p>{row.standfirst}</p> : null}
        {row.standfirst && editor ? <p className="reading-editor"><AgentMark {...editor} glyph /> Standfirst by the editor</p> : null}
      </div>
      {focus ? (
        <button className="reading-focus-exit" onClick={() => onFocus(false)}>
          Return to paper · Esc
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="reading-error">
          {error}
        </p>
      ) : null}
      {!edition ? (
        <p role="status">Opening this issue…</p>
      ) : (
        <>
          {resume && !focusItem && items.some((item) => item.itemId === resume.itemId) ? (
            <div className="reading-resume">
              <button onClick={() => jump(resume.itemId)}>
                Back to where you stopped <i>{resume.title}</i>
              </button>
              <button aria-label="Dismiss resume" onClick={() => setResume(null)}>
                ×
              </button>
            </div>
          ) : null}
          {hand && (hidden || quietHidden) ? (
            <p className="reading-hidden" role="status">
              {[
                hidden ? `${hidden} finding${hidden === 1 ? '' : 's'} by other hands` : '',
                quietHidden ? `${quietHidden} empty column${quietHidden === 1 ? '' : 's'}` : ''
              ].filter(Boolean).join(' and ')} hidden while you read {hand.agent.name}’s filings.{' '}
              <button type="button" onClick={() => onBy('')}>Show everyone</button>
            </p>
          ) : null}
          <div className="reading-layout">
            <div className={`reading-sequence${focusItem ? ' is-zoomed' : ''}`}>
              {sections.map((section) => (
                <section
                  key={section.key}
                  id={section.key ? `edition-section-${section.key}` : undefined}
                  tabIndex={section.key ? -1 : undefined}
                  className={`reading-section${section.label ? ` reading-section--block edition-tone--${tones[section.key] || 'ink'}` : ''}`}
                  aria-label={section.label || 'Readings'}
                >
                  {section.label ? (
                    <h2 className="reading-section-label">
                      <span className="reading-section-label__name">{section.label}</span>
                      <span className="reading-section-label__count" aria-label={`${section.items.length} filed`}>
                        {section.items.length || '—'}
                      </span>
                      <span className="reading-section-label__marks">
                        <KeeperMark keeper={keepers[section.key]} />
                        {(foreign[section.key] || []).map(agent => (
                          <AgentMark key={agent.key} {...handOf(agent)} glyph />
                        ))}
                      </span>
                    </h2>
                  ) : null}
                  <div className="reading-section__body">
                  {section.items.length ? (
                    section.items.map((item) => (
                      <EditionFinding
                        key={item.itemId}
                        item={item}
                        lead={item === items[0]}
                        zoomed={item.itemId === focusItem}
                        editionId={issue._id}
                        busy={busy}
                        receipt={receipts[item.itemId]}
                        onAct={act}
                        onPeek={openPeek}
                        onSelection={captureSelection}
                      />
                    ))
                  ) : (
                    <div className={`reading-bay reading-bay--${edition.silences?.find((silence) => silence.key === section.key)?.state || 'unknown'}`}>
                      <SectionSilence
                        className="reading-empty"
                        silence={edition.silences?.find((silence) => silence.key === section.key)}
                        fallback={section.label
                          ? `Nothing filed under ${section.label} in this issue.`
                          : 'No findings filed in this issue yet.'}
                      />
                    </div>
                  )}
                  </div>
                </section>
              ))}
              {edition.throughLine ? (
                <section className="reading-afterword">
                  <h2>{editor ? <AgentMark {...editor} caption="Written by" glyph /> : null}Across the week</h2>
                  <p>{edition.throughLine}</p>
                </section>
              ) : null}
              {edition.followUps?.length ? (
                <section className="reading-afterword">
                  <h2>What became of last issue’s watch list</h2>
                  <ul className="reading-follow-ups">
                    {edition.followUps.map(({ watch, status, note }) => (
                      <li key={watch}>
                        <span className={`reading-status reading-status--${status}`}>{WATCH_STATUS[status]}</span>
                        {watch}
                        {note ? <small>{note}</small> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {edition.watchNext?.length ? (
                <section className="reading-afterword">
                  <h2>What to watch next</h2>
                  <ul>
                    {edition.watchNext.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {sources.sources.length ? (
                <EditionSourcesList {...sources} listRef={sources.listRef} />
              ) : null}
              <footer className="reading-ending">
                <p>
                  {status === 'closed' ? 'That’s this issue’s paper.' : 'That’s the paper for now.'}
                </p>
                <ThoughtComposer {...thoughts} itemId="" label="What stayed with you?" />
              </footer>
            </div>
            <aside className="reading-margin">
              <nav aria-label="In this issue">
                <h2>In this issue</h2>
                <ol>
                  {items.map((item) => (
                    <li key={item.itemId}>
                      <a
                        href={`#${findingAnchor(item.itemId)}`}
                        onClick={(event) => {
                          event.preventDefault();
                          jump(item.itemId);
                        }}
                      >
                        {item.title}
                      </a>
                      {item.sourceLabel ? <small>{item.sourceLabel}</small> : null}
                    </li>
                  ))}
                </ol>
              </nav>
              {sources.sources.length ? (
                <EditionSourcesJump listId={sources.listId} onJump={sources.jump} />
              ) : null}
            </aside>
          </div>
        </>
      )}
      {pending ? (
        <div className="reading-arrivals" role="status">
          <button onClick={absorb}>
            {newCount
              ? `${newCount} finding${newCount === 1 ? '' : 's'} added`
              : 'This issue has an update'}{' '}
            · Show
          </button>
        </div>
      ) : null}
      {selection && !peek ? (
        <button
          className="reading-selection"
          style={{ top: selection.top, left: selection.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const item = items.find((item) => item.itemId === selection.itemId);
            const origin = document
              .getElementById(findingAnchor(item.itemId))
              ?.querySelector('.reading-actions button:last-child');
            openPeek(item, 'thought', origin, selection.quote);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Leave a thought
        </button>
      ) : null}
      {currentPeek ? (
        <SourcePeek
          key={`${currentPeek.itemId}:${shown.view}`}
          item={currentPeek}
          {...shown}
          onClose={() => (peek ? setPeek(null) : onItem(focusItem))}
          thoughtProps={thoughts}
        />
      ) : null}
    </div>
  );
}
