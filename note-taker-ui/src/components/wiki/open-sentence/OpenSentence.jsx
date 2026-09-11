import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import useCssMagneticLerp from '../../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import {
  beginPressure,
  chooseLibraryPassage,
  setReturnNote,
  thoughtTitle,
  bringTheParagraphBack,
  bringTheSourceBack,
  cancelPlacement,
  canApplyInstrument,
  canKeepAsInstrument,
  canKeepBetweenAsEssay,
  canKeepBetweenAsExperiment,
  canMakeThisTheTitle,
  canProposeBetween,
  canProposeWording,
  canRearrange,
  changedWordSpans,
  closeExploration,
  applyInstrument,
  closedWayHome,
  endMeet,
  endPressure,
  formatNamedOn,
  hasPersonalWork,
  inspectableOther,
  isMeeting,
  isOpen,
  isPressured,
  isRearranged,
  isWithoutParagraph,
  isWithoutSource,
  keepAsInstrument,
  keepBetweenAsEssay,
  keepBetweenAsExperiment,
  keepPressureName,
  keepPressurePassage,
  keepQuestion,
  leaveEssay,
  leaveInstrument,
  leaveMark,
  liveBearing,
  liveEssay,
  liveInstrument,
  liveProposal,
  liveThen,
  meetSlots,
  namedOn,
  openExploration,
  pendingInstrument,
  placeSource,
  pressurePassages,
  proposeWording,
  putItBack,
  putThemBack,
  setDistinction,
  setInstrumentName,
  setMeetField,
  setPressureField,
  sourceClip,
  tryTheOtherWay,
  tryWording,
  wikiAcceptedText,
  withdrawProposal,
  wordingChanged
} from './openSentenceModel';
import {
  readHeldInstrument,
  rememberHeldInstrument,
  writeHeldInstrument
} from './openSentenceJourney';
import { listenOpenSentenceStore } from './openSentenceStore';
import { CopyClip, KeptWork, PocketField, WithoutParagraphWork, WithoutSourceWork } from './OpenSentenceKept';
import AuthoredWriting, { AuthoredContext } from './AuthoredWriting';
import FindWhatIAlreadyHave from './FindWhatIAlreadyHave';
import UseDistinctionHere from './UseDistinctionHere';
import {
  distinctionExternalId,
  distinctionRecord,
  eligibleDistinctions,
  heldInstrumentForOwner,
  recordedDefinition,
  retainDistinction,
  sourceStatus
} from '../../../utils/distinctionUse';
import { createNotebookEntry, getNotebookEntry, getNotebookSummaries } from '../../../api/notebook';
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

const CopyWithSource = ({ source }) => (
  <CopyClip clip={sourceClip(source)} idleLabel="Copy with source" />
);

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

const PlacementActions = ({
  exploration,
  source,
  canPlace,
  besideLabel,
  previewing,
  setPreviewing,
  onCommit
}) => {
  if (!canPlace) return null;
  if (exploration.placed) {
    return (
      <button type="button" onClick={() => onCommit(cancelPlacement(exploration))}>
        Remove passage
      </button>
    );
  }
  if (previewing) {
    return (
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
    );
  }
  return (
    <button type="button" onClick={() => setPreviewing(true)}>Place beside</button>
  );
};

const BearingPassage = ({ exploration, mocked, onOpenSourceHome }) => {
  const bearing = liveBearing(exploration);
  if (!bearing) return null;
  return (
    <div className="open-sentence-pocket__bearing">
      <p className="open-sentence-pocket__qualification">Bears on this distinction.</p>
      <ThenPassage
        source={bearing}
        mocked={mocked}
        copyable
        onOpen={() => onOpenSourceHome?.(bearing, exploration)}
      />
    </div>
  );
};

const RecordedDefinition = ({
  exploration,
  mocked,
  sourceState
}) => {
  const instrument = liveInstrument(exploration);
  const recorded = recordedDefinition(instrument);
  if (!recorded) return null;
  const status = sourceState || (instrument.sourceId ? null : 'unbound');
  const href = instrument.sourceHref;
  return (
    <>
      <p className="open-sentence-pocket__prior-writing">{recorded.definition}</p>
      <p className="open-sentence-pocket__qualification">
        {status === 'missing' || status === 'foreign'
          ? 'The notebook page is gone. These are the words used here.'
          : 'Used here as written.'}
      </p>
      {href && status !== 'missing' && status !== 'foreign' ? (
        mocked ? (
          <span className="open-sentence-pocket__save">Open the definition</span>
        ) : (
          <Link className="open-sentence-pocket__home" to={href}>Open the definition</Link>
        )
      ) : null}
    </>
  );
};

const DistinctionField = ({
  pocketId,
  exploration,
  onCommit,
  mocked,
  onOpenSourceHome,
  heldInstrument,
  onHeld,
  authorship,
  savedDistinctions = []
}) => {
  const dated = formatNamedOn(namedOn(exploration));
  const pending = pendingInstrument(exploration);
  const instrument = liveInstrument(exploration);
  const [sourceState, setSourceState] = useState(null);
  const ownerId = authorship?.owner || '';
  const instrumentName = instrument?.name || '';
  const instrumentDefinition = instrument?.definition || '';
  const instrumentSourceId = instrument?.sourceId || '';
  const instrumentAgainst = instrument?.against || '';
  const instrumentOwnerId = instrument?.ownerId || '';
  const externalId = distinctionExternalId(authorship?.record?.saved);
  const explorationRef = useRef(exploration);
  const onCommitRef = useRef(onCommit);
  const onHeldRef = useRef(onHeld);
  explorationRef.current = exploration;
  onCommitRef.current = onCommit;
  onHeldRef.current = onHeld;
  const nameInstrument = (name) => {
    const next = setInstrumentName(exploration, name);
    const live = liveInstrument(next);
    const bound = live && ownerId ? distinctionRecord({ ...live, ownerId }) : live;
    const named = bound ? { ...next, instrument: bound } : next;
    onHeld?.(rememberHeldInstrument(named, exploration));
    onCommit(named);
  };

  useEffect(() => {
    if (mocked || !instrumentName || instrumentSourceId || !ownerId || !externalId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const notes = await getNotebookSummaries({ force: true });
        const retained = await retainDistinction({
          notes,
          createNote: createNotebookEntry,
          name: instrumentName,
          definition: instrumentDefinition,
          externalId
        });
        if (cancelled || !retained?.sourceId) return;
        const current = explorationRef.current;
        const next = {
          ...current,
          instrument: distinctionRecord({
            name: instrumentName,
            definition: instrumentDefinition,
            against: instrumentAgainst,
            ...retained,
            ownerId
          })
        };
        onHeldRef.current?.(rememberHeldInstrument(next, current));
        onCommitRef.current(next);
      } catch (_ignored) {
        return;
      }
    })();
    return () => { cancelled = true; };
  }, [mocked, instrumentName, instrumentDefinition, instrumentSourceId, instrumentAgainst, ownerId, externalId]);

  useEffect(() => {
    if (mocked || !instrumentSourceId) {
      setSourceState(instrumentSourceId ? 'ok' : null);
      return undefined;
    }
    let cancelled = false;
    const used = distinctionRecord({
      name: instrumentName,
      definition: instrumentDefinition,
      sourceId: instrumentSourceId,
      ownerId: instrumentOwnerId
    });
    const load = async () => {
      try {
        const note = await getNotebookEntry(instrumentSourceId);
        if (!cancelled) setSourceState(sourceStatus(used, note));
      } catch (_ignored) {
        if (!cancelled) setSourceState('missing');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [mocked, instrumentName, instrumentDefinition, instrumentSourceId, instrumentOwnerId]);

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
      {canKeepAsInstrument(exploration) ? (
        <button type="button" onClick={() => onCommit(keepAsInstrument(exploration))}>
          Keep this as an instrument
        </button>
      ) : null}
      {pending ? (
        <>
          {instrument ? (
            <p className="open-sentence-pocket__proposal">
              An instrument, not the line: {instrument.name}
            </p>
          ) : null}
          <RecordedDefinition
            exploration={exploration}
            mocked={mocked}
            sourceState={sourceState}
          />
          {!instrument ? (
            <p className="open-sentence-pocket__qualification">{pending.definition}</p>
          ) : null}
          <PocketField
            id={`${pocketId}-instrument`}
            label="Name this instrument"
            value={pending.name}
            onChange={nameInstrument}
            placeholder="Name the instrument. Do not generate a definition."
            rows={1}
          />
          <button type="button" onClick={() => onCommit(leaveInstrument(exploration))}>
            Leave the instrument
          </button>
        </>
      ) : null}
      {canApplyInstrument(exploration, heldInstrument) ? (
        <UseDistinctionHere
          held={heldInstrument}
          distinctions={savedDistinctions}
          onUse={(record) => {
            const next = applyInstrument(exploration, record);
            onHeld?.(rememberHeldInstrument(next, exploration));
            onCommit(next);
          }}
        />
      ) : null}
      <BearingPassage
        exploration={exploration}
        mocked={mocked}
        onOpenSourceHome={onOpenSourceHome}
      />
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
  onOpenSourceHome,
  writing = true,
  allowPlacement = true
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
        placed={writing && exploration.placed}
        settling={writing && settling}
      />
      {writing && exploration.placed ? (
        <p className="open-sentence-pocket__placed">Placed beside {besideLabel}</p>
      ) : null}
      {writing ? (
        <button
          type="button"
          className="open-sentence-pocket__marginalia"
          aria-pressed={exploration.mark === '!'}
          aria-label={exploration.mark === '!' ? 'Remove mark' : 'Leave a mark'}
          onClick={() => onCommit(leaveMark(exploration, exploration.mark !== '!'))}
        >
          {exploration.mark || '!'}
        </button>
      ) : null}
      <div className="open-sentence-pocket__actions">
        <AroundToggle inspecting={inspecting} onToggle={() => setInspecting((current) => !current)} />
        <SourceCite
          source={source}
          mocked={mocked}
          onOpen={() => onOpenSourceHome?.(source, exploration)}
        />
        {writing && allowPlacement ? (
          <PlacementActions
            exploration={exploration}
            source={source}
            canPlace={canPlace}
            besideLabel={besideLabel}
            previewing={previewing}
            setPreviewing={setPreviewing}
            onCommit={onCommit}
          />
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

const MeetNaming = ({ pocketId, exploration, onCommit }) => {
  const meet = meetSlots(isMeeting(exploration) ? exploration.meet : {});
  const written = Boolean(meet.relation || meet.limit || meet.between);
  return (
    <>
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
        <button type="button" onClick={() => onCommit(keepBetweenAsExperiment(exploration))}>
          Keep this as an experiment
        </button>
      ) : null}
      {canProposeBetween(exploration) ? (
        <button type="button" onClick={() => onCommit(proposeWording(exploration, meet.between))}>
          Propose this as the line
        </button>
      ) : null}
      {canKeepBetweenAsEssay(exploration) ? (
        <button type="button" onClick={() => onCommit(keepBetweenAsEssay(exploration))}>
          Keep this as an essay
        </button>
      ) : null}
      {written ? (
        <button type="button" onClick={() => onCommit(endMeet(exploration))}>
          Leave this meeting
        </button>
      ) : null}
    </>
  );
};

const MeetPassage = ({
  exploration,
  mocked,
  onOpenSourceHome,
  lead = false,
  besideQuestion = false
}) => {
  const other = inspectableOther(exploration);
  const [inspecting, setInspecting] = useState(false);
  if (!other) return null;
  return (
    <div className="open-sentence-pocket__meet">
      {lead ? (
        <p className="open-sentence-pocket__qualification">
          {besideQuestion ? 'Beside this question' : 'Also beside'}
        </p>
      ) : null}
      <PassageRead source={other} inspecting={inspecting} />
      <div className="open-sentence-pocket__actions">
        <AroundToggle inspecting={inspecting} onToggle={() => setInspecting((current) => !current)} />
        <SourceCite
          source={other}
          mocked={mocked}
          onOpen={() => onOpenSourceHome?.(other, exploration)}
        />
      </div>
    </div>
  );
};

const WordingWork = ({
  pocketId,
  exploration,
  accepted,
  pageTitle,
  onCommit,
  onAccept,
  onMakeTitle,
  acceptSilence
}) => {
  const spans = wordingChanged(exploration)
    ? changedWordSpans(accepted, exploration.provisionalText)
    : [];
  const proposal = liveProposal(exploration);
  const essay = liveEssay(exploration);
  const sameAsProposal = Boolean(
    proposal && String(exploration.provisionalText || '').trim() === proposal.text
  );
  const mayPropose = canProposeWording(exploration);
  const wording = String(exploration.provisionalText || '').trim();
  return (
    <>
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
      {onMakeTitle && canMakeThisTheTitle(pageTitle, wording) ? (
        <button type="button" onClick={() => onMakeTitle(wording)}>
          Make this the title
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
  pageTitle,
  onCommit,
  onOpenSourceHome,
  onAccept,
  onMakeTitle,
  acceptSilence,
  fresh = false,
  onFresh,
  heldInstrument,
  onHeld,
  authorship,
  savedDistinctions = []
}) => {
  const [previousChoice, setPreviousChoice] = useState(null);
  const composing = Boolean(authorship);
  const sources = [exploration.source, exploration.other].filter(source => source?.available !== false && source?.passage);
  const then = liveThen(exploration);
  const writing = !fresh;
  const rearranged = isRearranged(exploration);
  const other = inspectableOther(exploration);
  const boundSource = isWithoutSource(exploration) ? null : (
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
      writing={writing}
      allowPlacement={!composing || Boolean(placeBesideTitle)}
    />
  );
  const alsoSource = (
    <MeetPassage
      key={`${exploration?.other?.title || ''}:${exploration?.other?.passage || ''}`}
      exploration={exploration}
      mocked={mocked}
      onOpenSourceHome={onOpenSourceHome}
      lead={!rearranged}
      besideQuestion={composing}
    />
  );
  const meetControls = writing && other ? (
    <div className="open-sentence-pocket__meet">
      {canRearrange(exploration) ? (
        <button
          type="button"
          onClick={() => onCommit(rearranged ? putThemBack(exploration) : tryTheOtherWay(exploration))}
        >
          {rearranged ? 'Put them back' : 'Try the other way'}
        </button>
      ) : null}
      <MeetNaming pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    </div>
  ) : null;
  const findAlreadyHave = composing ? (
    <FindWhatIAlreadyHave
      excluded={sources}
      canUndo={Boolean(previousChoice)}
      onUndo={() => {
        onCommit({ ...exploration, ...previousChoice });
        setPreviousChoice(null);
      }}
      onPlace={source => {
        setPreviousChoice({
          selectedSource: exploration.selectedSource || null,
          other: exploration.other,
          meet: exploration.meet
        });
        onCommit(chooseLibraryPassage(exploration, source));
      }}
    />
  ) : null;

  return (
    <>
      {mocked ? <p className="open-sentence-pocket__kicker">Illustrated source · not live retrieval</p> : null}
      {writing && leftOpen && String(exploration.question || '').trim() ? (
        <p className="open-sentence-pocket__whisper">You left this open.</p>
      ) : null}

      {composing && !authorship.ready ? <div>
        <p role="status">{authorship.error || 'Opening your private work…'}</p>
        {authorship.error ? <button type="button" onClick={authorship.retryLoad}>Try opening again</button> : null}
      </div> : null}
      <fieldset className="open-sentence-pocket__contents" disabled={composing && !authorship.ready}>
      <div className="open-sentence-pocket__source">
        {rearranged && !composing ? (
          <>
            <p className="open-sentence-pocket__qualification">Tried the other way.</p>
            {alsoSource}
            {boundSource}
          </>
        ) : (
          <>
            {boundSource}
            {composing ? null : alsoSource}
          </>
        )}
        {composing ? null : meetControls}
      </div>

      {composing ? (
        <>
          <details className="open-sentence-pocket__context">
            <summary>Working with {sources.length ? `${sources.length} passage${sources.length === 1 ? '' : 's'} and your writing` : 'this sentence and your writing'}</summary>
            <AuthoredContext exploration={exploration} sources={sources} />
          </details>
          <AuthoredWriting exploration={exploration} onChange={onCommit} authorship={authorship} pocketId={pocketId} />
        </>
      ) : null}

      <details open={!composing || wordingChanged(exploration)}><summary>Try a wording for the article</summary>
      <div className="open-sentence-pocket__write">
        {writing ? (
          <WordingWork
            pocketId={pocketId}
            exploration={exploration}
            accepted={accepted}
            pageTitle={pageTitle}
            onCommit={onCommit}
            onAccept={onAccept}
            onMakeTitle={onMakeTitle}
            acceptSilence={acceptSilence}
          />
        ) : null}
        <p className="open-sentence-pocket__qualification">
          {acceptedLabel}: {accepted}
        </p>
        <WithoutParagraphWork exploration={exploration} onCommit={onCommit} />
        <WithoutSourceWork exploration={exploration} onCommit={onCommit} />
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
            {writing && then.question ? (
              <>
                <ThenPassage source={{ title: 'Then you left this open', passage: then.question }} />
                <DistinctionField
                  pocketId={pocketId}
                  exploration={exploration}
                  onCommit={onCommit}
                  mocked={mocked}
                  onOpenSourceHome={onOpenSourceHome}
                  heldInstrument={heldInstrument}
                  onHeld={onHeld}
                  authorship={authorship}
                  savedDistinctions={savedDistinctions}
                />
              </>
            ) : null}
            {writing && then.draft ? (
              <ThenPassage source={{ title: 'Then you wrote', passage: then.draft }} />
            ) : null}
          </div>
        ) : null}
      </div>

      </details>
      {writing ? (
        <PressureBody pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
      ) : null}

      {writing ? (
        <KeptWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
      ) : null}

      {writing ? (
        <div className="open-sentence-pocket__question">
          <PocketField
            id={`${pocketId}-question`}
            label="Leave this open"
            value={exploration.question}
            onChange={(value) => onCommit(keepQuestion(exploration, value))}
            placeholder="An unfinished question can stay unfinished."
          />
          {composing ? (
            <>
              {rearranged ? (
                <p className="open-sentence-pocket__qualification">Tried the other way.</p>
              ) : null}
              {alsoSource}
              {meetControls}
              {findAlreadyHave}
            </>
          ) : null}
          {then?.question ? null : (
            <DistinctionField
              pocketId={pocketId}
              exploration={exploration}
              onCommit={onCommit}
              mocked={mocked}
              onOpenSourceHome={onOpenSourceHome}
              heldInstrument={heldInstrument}
              onHeld={onHeld}
              authorship={authorship}
              savedDistinctions={savedDistinctions}
            />
          )}
        </div>
      ) : (
        <BearingPassage
          exploration={exploration}
          mocked={mocked}
          onOpenSourceHome={onOpenSourceHome}
        />
      )}
      {composing ? <label className="open-sentence-pocket__label">
        A note for your return
        <input value={exploration.returnNote || ''} onChange={event => onCommit(setReturnNote(exploration, event.target.value))} placeholder="Next: …" />
      </label> : null}
      </fieldset>
      {!composing && hasPersonalWork(exploration) ? (
        <button
          type="button"
          className="open-sentence-pocket__fresh"
          onClick={() => {
            if (!fresh) setPreviewing(false);
            onFresh?.(!fresh);
          }}
        >
          {fresh ? 'Show what I wrote' : 'Read it fresh'}
        </button>
      ) : null}
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
  pageTitle = '',
  homecoming = '',
  stillness = false,
  onOpenSourceHome,
  onAccept,
  onMakeTitle,
  acceptSilence = '',
  authorship = null,
  suspended = false,
  children
}) => {
  const pocketId = useId();
  const heldRef = useRef(null);
  const openButton = useRef(null);
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
  const [fresh, setFresh] = useState(false);
  const [heldInstrument, setHeldInstrument] = useState(readHeldInstrument);
  const [savedDistinctions, setSavedDistinctions] = useState([]);
  const open = isOpen(exploration);
  const [keepPocket, setKeepPocket] = useState(open);
  const accepted = wikiAcceptedText(exploration);
  const { className: lineClassName, ...restLine } = lineProps;
  const split = Boolean(hosts?.controls && hosts?.pocket);
  const followChip = !suspended && finePointer && !reducedMotion && armed && !open;

  const openPocket = useCallback(() => {
    setArmed(false);
    onChange(openExploration(exploration));
  }, [exploration, onChange]);

  const closePocket = useCallback(() => {
    setPreviewing(false);
    setInspecting(false);
    onChange(closeExploration(exploration));
    openButton.current?.focus();
  }, [exploration, onChange]);

  useEffect(() => {
    setInspecting(false);
    setPreviewing(false);
  }, [exploration?.source?.aroundBefore, exploration?.source?.available, exploration?.source?.passage, exploration?.source?.stale]);

  useEffect(() => {
    if (suspended) return undefined;
    const onPointer = () => setArmed(selectionInside(armRoot || heldRef.current));
    document.addEventListener('selectionchange', onPointer);
    return () => document.removeEventListener('selectionchange', onPointer);
  }, [armRoot, suspended]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setLeftOpen(Boolean(String(exploration.question || '').trim()));
      setFresh(false);
    }
    if (!open) setLeftOpen(false);
    wasOpen.current = open;
  }, [exploration.question, open]);

  useEffect(() => {
    const refreshHeld = () => setHeldInstrument(readHeldInstrument());
    refreshHeld();
    return listenOpenSentenceStore(refreshHeld);
  }, []);

  useEffect(() => {
    const live = liveInstrument(exploration);
    if (!live) return;
    writeHeldInstrument(authorship?.owner ? distinctionRecord({ ...live, ownerId: authorship.owner }) : live);
    setHeldInstrument(readHeldInstrument());
  }, [authorship?.owner, exploration]);

  useEffect(() => {
    if (mocked || !authorship?.owner) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const notes = typeof getNotebookSummaries === 'function'
          ? await getNotebookSummaries({ force: true })
          : [];
        if (!cancelled) setSavedDistinctions(eligibleDistinctions(notes));
      } catch (_ignored) {
        if (!cancelled) setSavedDistinctions([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [mocked, authorship?.owner, exploration?.instrument?.sourceId]);

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
    if (!open || suspended) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      event.stopPropagation();
      if (previewing) {
        setPreviewing(false);
        return;
      }
      if (fresh) {
        setFresh(false);
        return;
      }
      if (isWithoutParagraph(exploration)) {
        onChange(bringTheParagraphBack(exploration));
        return;
      }
      if (isWithoutSource(exploration)) {
        onChange(bringTheSourceBack(exploration));
        return;
      }
      closePocket();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePocket, exploration, fresh, onChange, open, previewing, suspended]);

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

  const wayHomeLabel = authorship ? thoughtTitle(exploration) || closedWayHome(exploration) : closedWayHome(exploration);
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
    exploration?.placed ? 'is-placed' : '',
    isWithoutParagraph(exploration) ? 'is-without' : ''
  ].filter(Boolean).join(' ');

  const controls = (
    <>
      <button
        type="button"
        ref={openButton}
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
              pageTitle={pageTitle}
              onCommit={onChange}
              onOpenSourceHome={onOpenSourceHome}
              onAccept={onAccept}
              onMakeTitle={onMakeTitle}
              acceptSilence={acceptSilence}
              fresh={fresh}
              onFresh={setFresh}
              heldInstrument={heldInstrumentForOwner(heldInstrument, authorship?.owner)}
              onHeld={setHeldInstrument}
              authorship={authorship}
              savedDistinctions={savedDistinctions}
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
