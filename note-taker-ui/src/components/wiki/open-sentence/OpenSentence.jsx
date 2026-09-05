import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import useCssMagneticLerp from '../../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
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
  return root.contains(selection.rangeAt(0).commonAncestorContainer);
};

const SourceHome = ({ source, mocked, onOpen }) => {
  if (!source?.href || source.here) return null;
  const label = source.isLibrary ? 'Open in Library →' : 'Return to source →';
  const go = (event) => {
    onOpen?.(event);
    if (mocked) event.preventDefault();
  };
  if (source.isLibrary) {
    return <Link className="open-sentence-pocket__home" to={source.href} onClick={go}>{label}</Link>;
  }
  return <a className="open-sentence-pocket__home" href={source.href} onClick={go}>{label}</a>;
};

const SourceBeside = ({
  exploration,
  mocked,
  inspecting,
  setInspecting,
  previewing,
  setPreviewing,
  settling,
  placeBesideTitle,
  onCommit,
  onOpenSourceHome
}) => {
  const source = exploration?.source;
  if (!source) {
    return <p className="open-sentence-pocket__silence">Nothing beside this sentence yet.</p>;
  }
  if (source.available === false) {
    return (
      <p className="open-sentence-pocket__unavailable">
        {source.title || 'This source'} is unavailable. A similar passage was not attached.
      </p>
    );
  }

  const aroundMissing = !source.aroundBefore && !source.aroundAfter;
  const canPlace = Boolean(source.passage) && (!source.here || placeBesideTitle);
  const besideLabel = placeBesideTitle || source.title || 'the thought';

  return (
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
      {source.stale ? (
        <p className="open-sentence-pocket__stale">
          This is an older copy. A newer line was not attached.
        </p>
      ) : null}
      {source.qualification ? (
        <p className="open-sentence-pocket__qualification">{source.qualification}</p>
      ) : null}
      {exploration.placed ? (
        <p className="open-sentence-pocket__placed">Placed beside {besideLabel}</p>
      ) : null}
      <button
        type="button"
        className="open-sentence-pocket__marginalia"
        aria-pressed={exploration.mark === '!'}
        aria-label={exploration.mark === '!' ? 'Remove mark' : 'Leave a mark'}
        onClick={() => onCommit(leaveMark(exploration, exploration.mark !== '!'))}
      >
        {exploration.mark || '!'}
      </button>
      <div className="open-sentence-pocket__actions">
        <button type="button" onClick={() => setInspecting((current) => !current)}>
          {inspecting ? 'Hide surrounding' : 'Read around this'}
        </button>
        <SourceHome
          source={source}
          mocked={mocked}
          onOpen={() => onOpenSourceHome?.(source, exploration)}
        />
        {canPlace && exploration.placed ? (
          <button type="button" onClick={() => onCommit(cancelPlacement(exploration))}>
            Remove passage
          </button>
        ) : null}
        {canPlace && !exploration.placed && previewing ? (
          <>
            <div className="open-sentence-pocket__preview">
              <p className="open-sentence-pocket__label">Beside {besideLabel}</p>
              <p className="open-sentence-pocket__passage">{source.passage}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onCommit(placeSource(exploration));
                setPreviewing(false);
              }}
            >
              Place here
            </button>
            <button type="button" onClick={() => setPreviewing(false)}>Cancel</button>
          </>
        ) : null}
        {canPlace && !exploration.placed && !previewing ? (
          <button type="button" onClick={() => setPreviewing(true)}>Place beside</button>
        ) : null}
      </div>
    </>
  );
};

const PocketBody = ({
  pocketId,
  exploration,
  mocked,
  leftOpen,
  inspecting,
  setInspecting,
  previewing,
  setPreviewing,
  settling,
  accepted,
  acceptedLabel,
  placeBesideTitle,
  onCommit,
  onOpenSourceHome
}) => {
  const spans = wordingChanged(exploration)
    ? changedWordSpans(accepted, exploration.provisionalText)
    : [];

  return (
    <>
      {mocked ? <p className="open-sentence-pocket__kicker">Illustrated source · not live retrieval</p> : null}
      {leftOpen && String(exploration.question || '').trim() ? (
        <p className="open-sentence-pocket__whisper">You left this open.</p>
      ) : null}

      <div className="open-sentence-pocket__source">
        <SourceBeside
          exploration={exploration}
          mocked={mocked}
          inspecting={inspecting}
          setInspecting={setInspecting}
          previewing={previewing}
          setPreviewing={setPreviewing}
          settling={settling}
          placeBesideTitle={placeBesideTitle}
          onCommit={onCommit}
          onOpenSourceHome={onOpenSourceHome}
        />
      </div>

      <div className="open-sentence-pocket__write">
        <label className="open-sentence-pocket__label" htmlFor={`${pocketId}-wording`}>
          Try a narrower wording
        </label>
        <textarea
          id={`${pocketId}-wording`}
          rows={3}
          value={exploration.provisionalText}
          onChange={(event) => onCommit(tryWording(exploration, event.target.value))}
        />
        {spans.length ? (
          <p className="open-sentence-pocket__diff" aria-label="Changed words">
            {spans.map((span, index) => (
              span.changed ? <mark key={`${span.text}-${index}`}>{span.text}</mark> : span.text
            ))}
          </p>
        ) : null}
        {wordingChanged(exploration) ? (
          <button type="button" onClick={() => onCommit(putItBack(exploration))}>
            Put it back
          </button>
        ) : null}
        <p className="open-sentence-pocket__qualification">
          {acceptedLabel}: {accepted}
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
          onChange={(event) => onCommit(keepQuestion(exploration, event.target.value))}
          placeholder="An unfinished question can stay unfinished."
        />
        <label className="open-sentence-pocket__label" htmlFor={`${pocketId}-return`}>
          A note for your return
        </label>
        <input
          id={`${pocketId}-return`}
          value={exploration.returnNote}
          onChange={(event) => onCommit(setReturnNote(exploration, event.target.value))}
          placeholder="Next: …"
        />
      </div>
    </>
  );
};

const OpenSentence = ({
  exploration,
  onChange = () => {},
  mocked = false,
  heldInteractive = true,
  hideHeld = false,
  hosts = null,
  lineProps = {},
  lineRef = null,
  armRoot = null,
  acceptedLabel = 'The article still reads',
  placeBesideTitle = '',
  homecoming = '',
  stillness = false,
  onOpenSourceHome,
  children
}) => {
  const pocketId = useId();
  const heldRef = useRef(null);
  const wasOpen = useRef(false);
  const chipMagnet = useCssMagneticLerp('--open-chip-x', 0.28);
  const finePointer = useFinePointer();
  const prefersReduced = usePrefersReducedMotion();
  const reducedMotion = stillness || prefersReduced;
  const [armed, setArmed] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const open = isOpen(exploration);
  const [keepPocket, setKeepPocket] = useState(open);
  const accepted = wikiAcceptedText(exploration);
  const { className: lineClassName, ...restLine } = lineProps;
  const split = Boolean(hosts?.controls && hosts?.pocket);
  const followChip = finePointer && !reducedMotion && armed && !open;

  const openPocket = useCallback(() => {
    setArmed(false);
    onChange(openExploration(exploration));
  }, [exploration, onChange]);

  const closePocket = useCallback(() => {
    setPreviewing(false);
    setInspecting(false);
    onChange(closeExploration(exploration));
  }, [exploration, onChange]);

  useEffect(() => {
    setInspecting(false);
    setPreviewing(false);
  }, [exploration?.source?.aroundBefore, exploration?.source?.available, exploration?.source?.passage, exploration?.source?.stale]);

  useEffect(() => {
    const onPointer = () => setArmed(selectionInside(armRoot || heldRef.current));
    document.addEventListener('selectionchange', onPointer);
    return () => document.removeEventListener('selectionchange', onPointer);
  }, [armRoot]);

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
    if (reducedMotion) {
      setKeepPocket(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setKeepPocket(false), 320);
    return () => window.clearTimeout(timer);
  }, [keepPocket, open, reducedMotion]);

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

  useEffect(() => {
    if (!followChip) {
      chipMagnet.reset(0);
      return undefined;
    }
    const onMove = (event) => {
      const root = hosts?.line
        || lineRef?.current
        || heldRef.current?.closest('p, li, blockquote')
        || heldRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (event.clientY < rect.top - 12 || event.clientY > rect.bottom + 48) {
        chipMagnet.setTarget(0);
        return;
      }
      chipMagnet.setTarget(Math.max(0, Math.min(rect.width - 56, event.clientX - rect.left)));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [chipMagnet, followChip, hosts, lineRef]);

  const onHeldKey = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (open) closePocket();
    else openPocket();
  };

  const closedNote = String(exploration.returnNote || '').trim();
  const closedQuestion = String(exploration.question || '').trim();
  const wayHome = !open && !keepPocket && (homecoming || closedNote || closedQuestion) ? (
    <div className="open-sentence__way-home">
      {homecoming ? <p className="open-sentence__been">{homecoming}</p> : null}
      {closedNote || closedQuestion ? (
        <button type="button" className="open-sentence__next" onClick={openPocket}>
          {closedNote || 'You left this open.'}
        </button>
      ) : null}
    </div>
  ) : null;

  const className = [
    'open-sentence',
    hideHeld || split ? 'is-embedded' : '',
    open ? 'is-open' : '',
    armed ? 'is-armed' : '',
    exploration?.placed ? 'is-placed' : ''
  ].filter(Boolean).join(' ');

  const controls = (
    <>
      <button
        type="button"
        className="open-sentence__open"
        aria-expanded={open}
        aria-controls={pocketId}
        onClick={open ? closePocket : openPocket}
      >
        {open ? 'Close' : 'Open'}
      </button>
      {followChip ? (
        <button
          type="button"
          className="open-sentence__chip"
          ref={chipMagnet.elRef}
          onClick={openPocket}
        >
          Open
        </button>
      ) : null}
    </>
  );

  const line = hideHeld ? (
    <span className={className}>{controls}</span>
  ) : (
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
      {controls}
    </p>
  );

  const reveal = (
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
            <PocketBody
              pocketId={pocketId}
              exploration={exploration}
              mocked={mocked}
              leftOpen={leftOpen}
              inspecting={inspecting}
              setInspecting={setInspecting}
              previewing={previewing}
              setPreviewing={setPreviewing}
              settling={settling}
              accepted={accepted}
              acceptedLabel={acceptedLabel}
              placeBesideTitle={placeBesideTitle}
              onCommit={onChange}
              onOpenSourceHome={onOpenSourceHome}
            />
            <button type="button" className="open-sentence-pocket__close" onClick={closePocket}>
              Close
            </button>
          </>
        ) : null}
      </section>
    </div>
  );

  if (split) {
    return (
      <>
        {createPortal(line, hosts.controls)}
        {createPortal(
          <>
            {wayHome}
            {reveal}
          </>,
          hosts.pocket
        )}
      </>
    );
  }

  return (
    <div className={className}>
      {line}
      {wayHome}
      {reveal}
    </div>
  );
};

export default OpenSentence;
