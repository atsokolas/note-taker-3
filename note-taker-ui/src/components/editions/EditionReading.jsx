import React, { useEffect, useCallback, useRef, useState } from 'react';
import { setEditionItemState } from '../../api/editions';
import { datelineLine, issueLine, standLayout, stateOf } from '../../pages/editionModel';
import EditionShare from './EditionShare';
import { EditionSourcesJump, EditionSourcesList, useEditionSources } from './EditionSources';
import EditionFinding from './EditionFinding';
import SourcePeek from './SourcePeek';
import ThoughtComposer, { useEditionThoughts } from './ThoughtComposer';
import useEditionIssue from './useEditionIssue';
import {
  findingAnchor,
  readEditionLocal,
  readingPosition,
  writeEditionLocal
} from './editionReadingState';

export default function EditionReading({
  issue,
  issues,
  onChoose,
  focusItem,
  focus,
  onFocus,
  utilityOpen,
  onInspect
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
    if (utilityOpen) setPeek(null);
  }, [utilityOpen]);
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
  const sections = columns.length ? columns : [{ key: '', label: '', items: looseItems }];
  const items = sections.flatMap((section) => section.items);
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
    Promise.resolve(setEditionItemState(issue._id, focusItem, 'opened')).catch(() => {});
    return () => cancelAnimationFrame(frame);
    // An explicit incoming finding link wins over a remembered place.
  }, [loaded, focusItem, issue._id, jump]);
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
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [focus, peek, selection, onFocus]);
  const openPeek = (item, view, origin, quote = '') => {
    onInspect?.();
    setSelection(null);
    setPeek({ itemId: item.itemId, view, origin, quote });
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
  const newCount =
    pending?.items?.filter((item) => !edition?.items?.some((held) => held.itemId === item.itemId))
      .length || 0;
  const currentPeek = peek && edition?.items.find((item) => item.itemId === peek.itemId);
  return (
    <div ref={root} data-testid="edition-read">
      {!issue.title && edition ? (
        <header className="edition-nameplate">
          <h1>{edition.profileLabel || edition.title}</h1>
        </header>
      ) : null}
      <div className="reading-dateline">
        <label>
          <span className="sr-only">Dated issue</span>
          <select
            aria-label="Dated issue"
            value={issue._id}
            onChange={(event) => onChoose(event.target.value)}
          >
            {(issues.length ? issues : [row]).map((item) => (
              <option key={item._id} value={item._id}>
                {[issueLine(item), datelineLine(item)].filter(Boolean).join(' · ') || 'This issue'}
              </option>
            ))}
          </select>
        </label>
        <span>
          {status === 'closed'
            ? 'Collection ended'
            : status === 'filling'
              ? 'Still filling'
              : 'Collection window ahead'}
        </span>
        <EditionShare editionId={issue._id} edition={edition} />
      </div>
      <div className="reading-intro">
        {row.standfirst ? <p>{row.standfirst}</p> : <span />}
        <button ref={focusButton} onClick={() => onFocus(!focus)} aria-pressed={focus}>
          Just read
        </button>
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
          <div className="reading-layout">
            <div className="reading-sequence">
              {sections.map((section) => (
                <section
                  key={section.key}
                  className="reading-section"
                  aria-label={section.label || 'Readings'}
                >
                  {section.label ? (
                    <h2 className="reading-section-label">{section.label}</h2>
                  ) : null}
                  {section.items.length ? (
                    section.items.map((item) => (
                      <EditionFinding
                        key={item.itemId}
                        item={item}
                        lead={item === items[0]}
                        busy={busy}
                        receipt={receipts[item.itemId]}
                        onAct={act}
                        onPeek={openPeek}
                        onSelection={captureSelection}
                      />
                    ))
                  ) : (
                    <p className="reading-empty">
                      {section.label
                        ? `Nothing filed under ${section.label} in this issue.`
                        : 'No findings filed in this issue yet.'}
                    </p>
                  )}
                </section>
              ))}
              {edition.throughLine ? (
                <section className="reading-afterword">
                  <h2>Across the week</h2>
                  <p>{edition.throughLine}</p>
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
          key={`${currentPeek.itemId}:${peek.view}`}
          item={currentPeek}
          {...peek}
          onClose={() => setPeek(null)}
          thoughtProps={thoughts}
        />
      ) : null}
    </div>
  );
}
