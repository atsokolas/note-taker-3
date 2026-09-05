import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  cancelPlacement,
  changedWordSpans,
  closeExploration,
  isOpen,
  keepQuestion,
  leaveMark,
  openExploration,
  placeSource,
  putItBack,
  setReturnNote,
  tryWording,
  wikiAcceptedText,
  wordingChanged
} from './openSentenceModel';
import './open-sentence.css';

const selectionInside = (root) => {
  if (!root || typeof window === 'undefined' || !window.getSelection) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
  const range = selection.rangeAt(0);
  return root.contains(range.commonAncestorContainer);
};

const SourceHome = ({ source }) => {
  if (!source?.href) return null;
  const label = source.isLibrary ? 'Open in Library →' : 'Return to source →';
  if (source.isLibrary) {
    return <Link className="open-sentence-pocket__home" to={source.href}>{label}</Link>;
  }
  return <a className="open-sentence-pocket__home" href={source.href}>{label}</a>;
};

const OpenSentence = ({
  exploration,
  onChange,
  mocked = false,
  heldInteractive = true,
  lineProps = {},
  lineRef = null,
  children
}) => {
  const pocketId = useId();
  const heldRef = useRef(null);
  const wasOpen = useRef(false);
  const [armed, setArmed] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const open = isOpen(exploration);
  const [keepPocket, setKeepPocket] = useState(open);
  const source = exploration?.source;
  const accepted = wikiAcceptedText(exploration);
  const { className: lineClassName, ...restLine } = lineProps;

  const commit = useCallback((next) => {
    onChange?.(next);
  }, [onChange]);

  const openPocket = useCallback(() => {
    setArmed(false);
    commit(openExploration(exploration));
  }, [commit, exploration]);

  const closePocket = useCallback(() => {
    setPreviewing(false);
    setInspecting(false);
    commit(closeExploration(exploration));
  }, [commit, exploration]);

  useEffect(() => {
    const onPointer = () => setArmed(selectionInside(heldRef.current));
    document.addEventListener('selectionchange', onPointer);
    return () => document.removeEventListener('selectionchange', onPointer);
  }, []);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setLeftOpen(Boolean(String(exploration.question || '').trim()));
    }
    if (!open) setLeftOpen(false);
    wasOpen.current = open;
  }, [exploration.question, open]);

  useEffect(() => {
    if (open) {
      setKeepPocket(true);
      return undefined;
    }
    if (!keepPocket) return undefined;
    const timer = window.setTimeout(() => setKeepPocket(false), 320);
    return () => window.clearTimeout(timer);
  }, [keepPocket, open]);

  useEffect(() => {
    if (!exploration?.placed) {
      setSettling(false);
      return undefined;
    }
    setSettling(true);
    const timer = window.setTimeout(() => setSettling(false), 220);
    return () => window.clearTimeout(timer);
  }, [exploration?.placed]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (previewing) {
        setPreviewing(false);
        return;
      }
      closePocket();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePocket, open, previewing]);

  const onHeldKey = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (open) closePocket();
    else openPocket();
  };

  const spans = wordingChanged(exploration)
    ? changedWordSpans(accepted, exploration.provisionalText)
    : [];
  const aroundMissing = Boolean(source)
    && source.available !== false
    && !source.aroundBefore
    && !source.aroundAfter;

  return (
    <div className={`open-sentence${open ? ' is-open' : ''}${armed ? ' is-armed' : ''}${exploration?.placed ? ' is-placed' : ''}`}>
      <p
        ref={lineRef}
        className={['open-sentence__line', lineClassName].filter(Boolean).join(' ')}
        {...restLine}
      >
        <span
          ref={heldRef}
          className={`open-sentence__held${open ? ' is-open' : ''}`}
          tabIndex={heldInteractive ? 0 : undefined}
          role={heldInteractive ? 'button' : undefined}
          aria-expanded={heldInteractive ? open : undefined}
          aria-controls={heldInteractive ? pocketId : undefined}
          onKeyDown={heldInteractive ? onHeldKey : undefined}
        >
          {children ?? accepted}
        </span>
        <button
          type="button"
          className="open-sentence__open"
          aria-expanded={open}
          aria-controls={pocketId}
          onClick={open ? closePocket : openPocket}
        >
          {open ? 'Close' : 'Open'}
        </button>
        {armed && !open ? (
          <button type="button" className="open-sentence__chip" onClick={openPocket}>
            Open
          </button>
        ) : null}
      </p>

      <div
        className={`open-sentence__reveal${open ? ' is-open' : ''}`}
        data-mocked={mocked ? 'true' : undefined}
      >
        <section
          id={pocketId}
          className="open-sentence-pocket"
          aria-hidden={!open}
          inert={!open}
          aria-label="Opened sentence"
        >
          {open || keepPocket ? (
            <>
          {mocked ? <p className="open-sentence-pocket__kicker">Illustrated source · not live retrieval</p> : null}
          {leftOpen && String(exploration.question || '').trim() ? (
            <p className="open-sentence-pocket__whisper">You left this open.</p>
          ) : null}

          <div className="open-sentence-pocket__source">
            {!source ? (
              <p className="open-sentence-pocket__silence">Nothing beside this sentence yet.</p>
            ) : source.available === false ? (
              <p className="open-sentence-pocket__unavailable">
                {source.title || 'This source'} is unavailable. A similar passage was not attached.
              </p>
            ) : (
              <>
                <p className="open-sentence-pocket__source-title">{source.title}</p>
                {inspecting && source.aroundBefore ? (
                  <p className="open-sentence-pocket__around">{source.aroundBefore}</p>
                ) : null}
                {source.passage ? (
                  <p className={`open-sentence-pocket__passage${exploration.placed ? ' is-placed' : ''}${settling ? ' is-settling' : ''}`}>
                    {source.passage}
                  </p>
                ) : (
                  <p className="open-sentence-pocket__silence">The exact passage was not saved with this citation.</p>
                )}
                {inspecting && source.aroundAfter ? (
                  <p className="open-sentence-pocket__around">{source.aroundAfter}</p>
                ) : null}
                {inspecting && aroundMissing ? (
                  <p className="open-sentence-pocket__silence">
                    The surrounding lines were not saved with this passage.
                  </p>
                ) : null}
                {source.qualification ? (
                  <p className="open-sentence-pocket__qualification">{source.qualification}</p>
                ) : null}
                {exploration.placed ? (
                  <p className="open-sentence-pocket__placed">Placed beside {source.title}</p>
                ) : null}
                <button
                  type="button"
                  className="open-sentence-pocket__marginalia"
                  aria-pressed={exploration.mark === '!'}
                  aria-label={exploration.mark === '!' ? 'Remove mark' : 'Leave a mark'}
                  onClick={() => commit(leaveMark(exploration, exploration.mark !== '!'))}
                >
                  {exploration.mark || '!'}
                </button>
                <div className="open-sentence-pocket__actions">
                  <button type="button" onClick={() => setInspecting((current) => !current)}>
                    {inspecting ? 'Hide surrounding' : 'Read around this'}
                  </button>
                  <SourceHome source={source} />
                  {exploration.placed ? (
                    <button type="button" onClick={() => commit(cancelPlacement(exploration))}>
                      Remove passage
                    </button>
                  ) : previewing ? (
                    <>
                      <div className="open-sentence-pocket__preview">
                        <p className="open-sentence-pocket__label">Beside the thought</p>
                        <p className="open-sentence-pocket__passage">{source.passage}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          commit(placeSource(exploration));
                          setPreviewing(false);
                        }}
                      >
                        Place here
                      </button>
                      <button type="button" onClick={() => setPreviewing(false)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setPreviewing(true)}>Place beside</button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="open-sentence-pocket__write">
            <label className="open-sentence-pocket__label" htmlFor={`${pocketId}-wording`}>
              Try a narrower wording
            </label>
            <textarea
              id={`${pocketId}-wording`}
              rows={3}
              value={exploration.provisionalText}
              onChange={(event) => commit(tryWording(exploration, event.target.value))}
            />
            {spans.length ? (
              <p className="open-sentence-pocket__diff" aria-label="Changed words">
                {spans.map((span, index) => (
                  span.changed ? <mark key={`${span.text}-${index}`}>{span.text}</mark> : span.text
                ))}
              </p>
            ) : null}
            {wordingChanged(exploration) ? (
              <button type="button" onClick={() => commit(putItBack(exploration))}>
                Put it back
              </button>
            ) : null}
            <p className="open-sentence-pocket__qualification">
              The article still reads: {accepted}
            </p>
          </div>

          <div className="open-sentence-pocket__question">
            <label className="open-sentence-pocket__label" htmlFor={`${pocketId}-question`}>
              Leave this open
            </label>
            <textarea
              id={`${pocketId}-question`}
              rows={2}
              value={exploration.question}
              onChange={(event) => commit(keepQuestion(exploration, event.target.value))}
              placeholder="An unfinished question can stay unfinished."
            />
            <label className="open-sentence-pocket__label" htmlFor={`${pocketId}-return`}>
              A note for your return
            </label>
            <input
              id={`${pocketId}-return`}
              value={exploration.returnNote}
              onChange={(event) => commit(setReturnNote(exploration, event.target.value))}
              placeholder="Next: …"
            />
          </div>

          <button type="button" className="open-sentence-pocket__close" onClick={closePocket}>
            Close
          </button>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default OpenSentence;
