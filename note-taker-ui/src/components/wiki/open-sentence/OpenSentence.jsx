import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import useCssMagneticLerp from '../../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import {
  beginPressure,
  cancelPlacement,
  canKeepBetweenAsEssay,
  canKeepBetweenAsExperiment,
  canProposeBetween,
  canProposeWording,
  changedWordSpans,
  closeExploration,
  endMeet,
  endPressure,
  essayWayHome,
  formatNamedOn,
  inspectableOther,
  isMeeting,
  isOpen,
  isPressured,
  keepBetweenAsEssay,
  keepBetweenAsExperiment,
  keepPressureName,
  keepPressurePassage,
  keepQuestion,
  leaveEssay,
  leaveMark,
  liveDistinction,
  liveEssay,
  liveProposal,
  liveThen,
  meetSlots,
  meetWayHome,
  namedOn,
  openExploration,
  placeSource,
  pressurePassages,
  pressureWayHome,
  proposeWording,
  putItBack,
  setDistinction,
  setMeetField,
  setPressureField,
  sourceClip,
  tryWording,
  wikiAcceptedText,
  withdrawProposal,
  wordingChanged
} from './openSentenceModel';
import './open-sentence.css';

const selectionInside = (root) => {
  if (!root || typeof window === 'undefined' || !window.getSelection) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
  return root.contains(selection.getRangeAt(0).commonAncestorContainer);
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

const CopyWithSource = ({ source }) => {
  const clip = sourceClip(source);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (!clip) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (!navigator.clipboard?.writeText) return;
        navigator.clipboard.writeText(clip).then(() => setCopied(true)).catch(() => {});
      }}
    >
      {copied ? 'Copied.' : 'Copy with source'}
    </button>
  );
};

const SourceCite = ({ source, mocked, onOpen, copyable = true }) => (
  <>
    <SourceHome source={source} mocked={mocked} onOpen={onOpen} />
    {copyable ? <CopyWithSource source={source} /> : null}
  </>
);

const ThenQuote = ({ text }) => (
  <blockquote className="open-sentence-pocket__quote">{text}</blockquote>
);

const ThenPassage = ({ source, mocked, onOpen, copyable = false }) => (
  <div className="open-sentence-pocket__then-source">
    {source.title ? <p className="open-sentence-pocket__source-title">{source.title}</p> : null}
    {source.aroundBefore ? (
      <p className="open-sentence-pocket__around">{source.aroundBefore}</p>
    ) : null}
    <ThenQuote text={source.passage} />
    {source.aroundAfter ? (
      <p className="open-sentence-pocket__around">{source.aroundAfter}</p>
    ) : null}
    {copyable || (source.href && !source.here) ? (
      <div className="open-sentence-pocket__actions">
        <SourceCite
          source={source}
          mocked={mocked}
          copyable={copyable}
          onOpen={onOpen}
        />
      </div>
    ) : null}
  </div>
);

const AroundToggle = ({ inspecting, onToggle }) => (
  <button type="button" onClick={onToggle}>
    {inspecting ? 'Hide surrounding' : 'Read around this'}
  </button>
);

const PocketField = ({ id, label, value, onChange, placeholder, rows = 2 }) => (
  <>
    <label className="open-sentence-pocket__label" htmlFor={id}>
      {label}
    </label>
    <textarea
      id={id}
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  </>
);

const DistinctionField = ({ pocketId, exploration, onCommit }) => {
  const dated = formatNamedOn(namedOn(exploration));
  return (
    <>
      <PocketField
        id={`${pocketId}-distinction`}
        label="The distinction that would help"
        value={exploration.distinction || ''}
        onChange={(value) => onCommit(setDistinction(exploration, value))}
        placeholder="Name the fork. Do not close the question."
      />
      {dated ? (
        <p className="open-sentence-pocket__qualification">{dated}</p>
      ) : null}
    </>
  );
};

const PassageRead = ({ source, inspecting = false, placed = false, settling = false }) => (
  <>
    <p className="open-sentence-pocket__source-title">{source.title}</p>
    {inspecting && source.aroundBefore ? (
      <p className="open-sentence-pocket__around">{source.aroundBefore}</p>
    ) : null}
    {source.passage ? (
      <p className={`open-sentence-pocket__passage${placed ? ' is-placed' : ''}${settling ? ' is-settling' : ''}`}>
        {source.passage}
      </p>
    ) : (
      <p className="open-sentence-pocket__silence">The exact passage was not saved with this citation.</p>
    )}
    {inspecting && source.aroundAfter ? (
      <p className="open-sentence-pocket__around">{source.aroundAfter}</p>
    ) : null}
    {inspecting && !source.aroundBefore && !source.aroundAfter ? (
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
  </>
);

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

  const canPlace = Boolean(source.passage) && (!source.here || placeBesideTitle);
  const besideLabel = placeBesideTitle || source.title || 'the thought';

  return (
    <>
      <PassageRead
        source={source}
        inspecting={inspecting}
        placed={exploration.placed}
        settling={settling}
      />
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
        <AroundToggle inspecting={inspecting} onToggle={() => setInspecting((current) => !current)} />
        <SourceCite
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

const keepPressureLabel = (field, source, passages) => {
  const name = keepPressureName(source, passages);
  if (field === 'stillHolds') return `Keep ${name} as what still holds`;
  if (field === 'unknown') return `Keep ${name} as unknown`;
  return '';
};

const PressureSlot = ({
  id,
  label,
  field,
  placeholder,
  keep = false,
  exploration,
  onCommit
}) => {
  const value = exploration.pressure[field];
  const passages = keep ? pressurePassages(exploration) : [];
  const taken = new Set(
    ['stillHolds', 'unknown'].map((slot) => String(exploration.pressure[slot] || '').trim())
  );
  const kept = passages.find((source) => source.passage === String(value || '').trim());
  return (
    <>
      <PocketField
        id={id}
        label={label}
        value={value}
        placeholder={placeholder}
        onChange={(next) => onCommit(setPressureField(exploration, field, next))}
      />
      {kept?.title ? (
        <p className="open-sentence-pocket__qualification">{kept.title}</p>
      ) : null}
      {passages.filter((source) => !taken.has(source.passage)).map((source) => (
        <button
          key={`${field}:${source.passage}`}
          type="button"
          onClick={() => onCommit(keepPressurePassage(exploration, field, source))}
        >
          {keepPressureLabel(field, source, passages)}
        </button>
      ))}
    </>
  );
};

const PressureBody = ({ pocketId, exploration, onCommit }) => {
  if (!isPressured(exploration)) {
    return (
      <div className="open-sentence-pocket__pressure">
        <button type="button" onClick={() => onCommit(beginPressure(exploration))}>
          Suppose this stops being true
        </button>
      </div>
    );
  }
  return (
    <div className="open-sentence-pocket__pressure">
      <PressureSlot
        id={`${pocketId}-premise`}
        label="For this experiment"
        field="premise"
        placeholder="Name the change. Do not invent a chain."
        exploration={exploration}
        onCommit={onCommit}
      />
      <PressureSlot
        id={`${pocketId}-holds`}
        label="What still holds"
        field="stillHolds"
        keep
        exploration={exploration}
        onCommit={onCommit}
      />
      <PressureSlot
        id={`${pocketId}-unknown`}
        label="What remains unknown"
        field="unknown"
        keep
        exploration={exploration}
        onCommit={onCommit}
      />
      <button type="button" onClick={() => onCommit(endPressure(exploration))}>
        Leave the experiment
      </button>
    </div>
  );
};

const MeetBody = ({ pocketId, exploration, mocked, onCommit, onOpenSourceHome }) => {
  const other = inspectableOther(exploration);
  const [inspecting, setInspecting] = useState(false);
  if (!other) return null;
  const meet = meetSlots(isMeeting(exploration) ? exploration.meet : {});
  const written = Boolean(meet.relation || meet.limit || meet.between);

  return (
    <div className="open-sentence-pocket__meet">
      <p className="open-sentence-pocket__qualification">Also beside</p>
      <PassageRead source={other} inspecting={inspecting} />
      <div className="open-sentence-pocket__actions">
        <AroundToggle inspecting={inspecting} onToggle={() => setInspecting((current) => !current)} />
        <SourceCite
          source={other}
          mocked={mocked}
          onOpen={() => onOpenSourceHome?.(other, exploration)}
        />
      </div>
      <PocketField
        id={`${pocketId}-meet`}
        label="How they meet"
        value={meet.relation}
        onChange={(value) => onCommit(setMeetField(exploration, 'relation', value))}
        placeholder="Support, tension, analogy, exception, or unrelated."
      />
      <PocketField
        id={`${pocketId}-limit`}
        label="Where that stops"
        value={meet.limit}
        onChange={(value) => onCommit(setMeetField(exploration, 'limit', value))}
      />
      <PocketField
        id={`${pocketId}-between`}
        label="The space between"
        value={meet.between}
        onChange={(value) => onCommit(setMeetField(exploration, 'between', value))}
        rows={3}
      />
      {canKeepBetweenAsExperiment(exploration) ? (
        <button
          type="button"
          onClick={() => onCommit(keepBetweenAsExperiment(exploration))}
        >
          Keep this as an experiment
        </button>
      ) : null}
      {canProposeBetween(exploration) ? (
        <button
          type="button"
          onClick={() => onCommit(proposeWording(exploration, meet.between))}
        >
          Propose this as the line
        </button>
      ) : null}
      {canKeepBetweenAsEssay(exploration) ? (
        <button
          type="button"
          onClick={() => onCommit(keepBetweenAsEssay(exploration))}
        >
          Keep this as an essay
        </button>
      ) : null}
      {written ? (
        <button type="button" onClick={() => onCommit(endMeet(exploration))}>
          Leave this meeting
        </button>
      ) : null}
    </div>
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
  onOpenSourceHome,
  onAccept,
  acceptSilence
}) => {
  const spans = wordingChanged(exploration)
    ? changedWordSpans(accepted, exploration.provisionalText)
    : [];
  const proposal = liveProposal(exploration);
  const essay = liveEssay(exploration);
  const then = liveThen(exploration);
  const sameAsProposal = Boolean(
    proposal && String(exploration.provisionalText || '').trim() === proposal.text
  );
  const mayPropose = canProposeWording(exploration);

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
        <MeetBody
          key={`${exploration?.other?.title || ''}:${exploration?.other?.passage || ''}`}
          pocketId={pocketId}
          exploration={exploration}
          mocked={mocked}
          onCommit={onCommit}
          onOpenSourceHome={onOpenSourceHome}
        />
      </div>

      <div className="open-sentence-pocket__write">
        <PocketField
          id={`${pocketId}-wording`}
          label="Try a narrower wording"
          value={exploration.provisionalText}
          onChange={(value) => onCommit(tryWording(exploration, value))}
          rows={3}
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
        {mayPropose && wordingChanged(exploration) && !sameAsProposal ? (
          <button type="button" onClick={() => onCommit(proposeWording(exploration))}>
            Propose this wording
          </button>
        ) : null}
        {proposal ? (
          <>
            <p className="open-sentence-pocket__proposal">
              Proposed, not accepted: {proposal.text}
            </p>
            {onAccept ? (
              <button type="button" onClick={() => onAccept(exploration)}>
                Accept this wording
              </button>
            ) : null}
            <button type="button" onClick={() => onCommit(withdrawProposal(exploration))}>
              Withdraw the proposal
            </button>
          </>
        ) : null}
        {essay ? (
          <>
            <p className="open-sentence-pocket__proposal">
              An essay, not the line: {essay.text}
            </p>
            <button type="button" onClick={() => onCommit(leaveEssay(exploration))}>
              Leave the essay
            </button>
          </>
        ) : null}
        {acceptSilence ? (
          <p className="open-sentence-pocket__silence">{acceptSilence}</p>
        ) : null}
        <p className="open-sentence-pocket__qualification">
          {acceptedLabel}: {accepted}
        </p>
        {then ? (
          <div className="open-sentence-pocket__then">
            <p className="open-sentence-pocket__qualification">Then</p>
            <ThenQuote text={then.text} />
            {(then.sources || []).map((source) => (
              <ThenPassage
                key={`${source.title}:${source.passage}`}
                source={source}
                mocked={mocked}
                copyable
                onOpen={() => onOpenSourceHome?.(source, exploration)}
              />
            ))}
            {then.question ? (
              <>
                <ThenPassage source={{ title: 'Then you left this open', passage: then.question }} />
                <DistinctionField
                  pocketId={pocketId}
                  exploration={exploration}
                  onCommit={onCommit}
                />
              </>
            ) : null}
            {then.draft ? (
              <ThenPassage source={{ title: 'Then you wrote', passage: then.draft }} />
            ) : null}
          </div>
        ) : null}
      </div>

      <PressureBody pocketId={pocketId} exploration={exploration} onCommit={onCommit} />

      <div className="open-sentence-pocket__question">
        <PocketField
          id={`${pocketId}-question`}
          label="Leave this open"
          value={exploration.question}
          onChange={(value) => onCommit(keepQuestion(exploration, value))}
          placeholder="An unfinished question can stay unfinished."
        />
        {then?.question ? null : (
          <DistinctionField
            pocketId={pocketId}
            exploration={exploration}
            onCommit={onCommit}
          />
        )}
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
  onAccept,
  acceptSilence = '',
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

  const closedDistinction = liveDistinction(exploration);
  const closedQuestion = String(exploration.question || '').trim();
  const closedProposal = liveProposal(exploration);
  const wayHomeLabel = closedDistinction
    || (closedQuestion ? 'You left this open.' : '')
    || (closedProposal ? 'Proposed, not accepted.' : '')
    || pressureWayHome(exploration)
    || meetWayHome(exploration)
    || essayWayHome(exploration);
  const wayHome = !open && !keepPocket && (homecoming || wayHomeLabel) ? (
    <div className="open-sentence__way-home">
      {homecoming ? <p className="open-sentence__been">{homecoming}</p> : null}
      {wayHomeLabel ? (
        <button type="button" className="open-sentence__next" onClick={openPocket}>
          {wayHomeLabel}
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
              onAccept={onAccept}
              acceptSilence={acceptSilence}
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
