import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import {
  cancelPlacement,
  changedWordSpans,
  closeExploration,
  isOpen,
  keepQuestion,
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
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer);
};

const OpenSentence = ({
  exploration,
  onChange,
  mocked = false
}) => {
  const pocketId = useId();
  const heldRef = useRef(null);
  const [armed, setArmed] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [marginalNote, setMarginalNote] = useState('');
  const reduceMotion = usePrefersReducedMotion();
  const open = isOpen(exploration);
  const source = exploration?.source;
  const accepted = wikiAcceptedText(exploration);

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

  return (
    <div className={`open-sentence${open ? ' is-open' : ''}${armed ? ' is-armed' : ''}`}>
      <p className="open-sentence__line">
        <span
          ref={heldRef}
          className={`open-sentence__held${open ? ' is-open' : ''}`}
          tabIndex={0}
          role="button"
          aria-expanded={open}
          aria-controls={pocketId}
          onKeyDown={onHeldKey}
        >
          {accepted}
        </span>
        <button type="button" className="open-sentence__open" onClick={open ? closePocket : openPocket}>
          {open ? 'Close' : 'Open'}
        </button>
        {armed && !open ? (
          <button type="button" className="open-sentence__chip" onClick={openPocket}>
            Open
          </button>
        ) : null}
      </p>

      <div
        className={`open-sentence__reveal${open ? ' is-open' : ''}${reduceMotion ? ' is-instant' : ''}`}
        data-mocked={mocked ? 'true' : undefined}
      >
        <section
          id={pocketId}
          className="open-sentence-pocket"
          aria-hidden={!open}
          inert={!open}
          aria-label="Opened sentence"
        >
          {mocked ? <p className="open-sentence-pocket__kicker">Illustrated source · not live retrieval</p> : null}

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
                <p className="open-sentence-pocket__passage">{source.passage}</p>
                {inspecting && source.aroundAfter ? (
                  <p className="open-sentence-pocket__around">{source.aroundAfter}</p>
                ) : null}
                {source.qualification ? (
                  <p className="open-sentence-pocket__qualification">{source.qualification}</p>
                ) : null}
                <button
                  type="button"
                  className="open-sentence-pocket__marginalia"
                  aria-pressed={Boolean(marginalNote)}
                  aria-label={marginalNote ? 'Remove mark' : 'Leave a mark'}
                  onClick={() => setMarginalNote((current) => (current ? '' : '!'))}
                >
                  {marginalNote || '!'}
                </button>
                <div className="open-sentence-pocket__actions">
                  <button type="button" onClick={() => setInspecting((current) => !current)}>
                    {inspecting ? 'Hide surrounding' : 'Read around this'}
                  </button>
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
        </section>
      </div>
    </div>
  );
};

export default OpenSentence;
