import React, { useEffect, useState } from 'react';
import {
  beginCarry,
  beginContributions,
  bringParagraphBackLabel,
  bringSourceBackLabel,
  bringTheParagraphBack,
  bringTheSourceBack,
  canCarryOut,
  canFillCarryBetween,
  canFillCarryQuestion,
  canFillContributionQuestion,
  canIncludeCarryPassage,
  canKeepAsExhibit,
  canKeepAsRehearsal,
  canKeepAsUnwritten,
  canMeetContributions,
  canTryWithoutParagraph,
  canTryWithoutSource,
  carryClip,
  carrySlotName,
  CONTRIBUTION_KINDS,
  contributionKindLabel,
  contributionName,
  fillCarryBetween,
  fillCarryQuestion,
  fillContributionQuestion,
  includeCarryPassage,
  isWithoutParagraph,
  isWithoutSource,
  keepAsExhibit,
  keepAsRehearsal,
  keepAsUnwritten,
  leaveCarry,
  leaveCarryPassage,
  leaveContributions,
  leaveExhibit,
  leaveRehearsal,
  leaveUnwritten,
  liveCarry,
  liveContributions,
  liveExhibit,
  liveRehearsal,
  liveUnwritten,
  pendingCarry,
  pendingContributions,
  pendingExhibit,
  pendingRehearsal,
  pendingUnwritten,
  rehearsalStillBeside,
  setCarryField,
  setContributionField,
  setContributionKind,
  setExhibitField,
  setRehearsalAttempt,
  setUnwrittenField,
  showExhibitWay,
  tryWithoutThisParagraph,
  tryWithoutThisSource
} from './openSentenceModel';

export const PocketField = ({ id, label, value, onChange, placeholder, rows = 2 }) => (
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

export const CopyClip = ({ clip, idleLabel, copiedLabel = 'Copied.' }) => {
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
      {copied ? copiedLabel : idleLabel}
    </button>
  );
};

const SetAsideWork = ({ aside, caption, bringLabel, tryLabel, onBring, onTry }) => (
  aside ? (
    <>
      <p className="open-sentence-pocket__qualification">{caption}</p>
      <button type="button" onClick={onBring}>{bringLabel}</button>
    </>
  ) : (
    <button type="button" onClick={onTry}>{tryLabel}</button>
  )
);

export const WithoutParagraphWork = ({ exploration, onCommit }) => {
  if (!canTryWithoutParagraph(exploration)) return null;
  return (
    <SetAsideWork
      aside={isWithoutParagraph(exploration)}
      caption="Trying without this paragraph."
      bringLabel={bringParagraphBackLabel(exploration)}
      tryLabel="Try without this paragraph"
      onBring={() => onCommit(bringTheParagraphBack(exploration))}
      onTry={() => onCommit(tryWithoutThisParagraph(exploration))}
    />
  );
};

export const WithoutSourceWork = ({ exploration, onCommit }) => {
  if (!canTryWithoutSource(exploration)) return null;
  return (
    <SetAsideWork
      aside={isWithoutSource(exploration)}
      caption="This source is set aside. Support that remains is this sentence."
      bringLabel={bringSourceBackLabel(exploration)}
      tryLabel="Try without this source"
      onBring={() => onCommit(bringTheSourceBack(exploration))}
      onTry={() => onCommit(tryWithoutThisSource(exploration))}
    />
  );
};

const ExhibitWork = ({ pocketId, exploration, onCommit }) => {
  const pending = pendingExhibit(exploration);
  const exhibit = liveExhibit(exploration);
  if (!pending) {
    if (!canKeepAsExhibit(exploration)) return null;
    return (
      <button type="button" onClick={() => onCommit(keepAsExhibit(exploration))}>
        Keep this as an exhibit
      </button>
    );
  }
  const shown = pending.showing === 'other' ? pending.otherWay : pending.thisWay;
  return (
    <div className="open-sentence-pocket__pressure">
      {exhibit ? (
        <p className="open-sentence-pocket__proposal">
          An exhibit, not evidence{exhibit.name ? `: ${exhibit.name}` : ''}
        </p>
      ) : null}
      {shown ? (
        <p className="open-sentence-pocket__qualification">{shown}</p>
      ) : null}
      <PocketField
        id={`${pocketId}-exhibit-name`}
        label="Name this exhibit"
        value={pending.name}
        onChange={(value) => onCommit(setExhibitField(exploration, 'name', value))}
        placeholder="Name the illustration. Do not claim evidence."
        rows={1}
      />
      <PocketField
        id={`${pocketId}-exhibit-this`}
        label="This way"
        value={pending.thisWay}
        onChange={(value) => onCommit(setExhibitField(exploration, 'thisWay', value))}
        placeholder="One reading. Visible assumptions stay yours."
      />
      <PocketField
        id={`${pocketId}-exhibit-other`}
        label="The other way"
        value={pending.otherWay}
        onChange={(value) => onCommit(setExhibitField(exploration, 'otherWay', value))}
        placeholder="A different reading of the same material."
      />
      <button
        type="button"
        aria-pressed={pending.showing === 'this'}
        onClick={() => onCommit(showExhibitWay(exploration, 'this'))}
      >
        Show this way
      </button>
      <button
        type="button"
        aria-pressed={pending.showing === 'other'}
        onClick={() => onCommit(showExhibitWay(exploration, 'other'))}
      >
        Show the other way
      </button>
      <button type="button" onClick={() => onCommit(leaveExhibit(exploration))}>
        Leave the exhibit
      </button>
    </div>
  );
};

const RehearsalWork = ({ pocketId, exploration, onCommit }) => {
  const pending = pendingRehearsal(exploration);
  const beside = rehearsalStillBeside(exploration);
  if (!pending) {
    if (!canKeepAsRehearsal(exploration)) return null;
    return (
      <button type="button" onClick={() => onCommit(keepAsRehearsal(exploration))}>
        Try saying it
      </button>
    );
  }
  return (
    <div className="open-sentence-pocket__pressure">
      {liveRehearsal(exploration) ? (
        <p className="open-sentence-pocket__proposal">A rehearsal, not a grade.</p>
      ) : null}
      <PocketField
        id={`${pocketId}-rehearsal`}
        label="Try saying it"
        value={pending.attempt}
        onChange={(value) => onCommit(setRehearsalAttempt(exploration, value))}
        placeholder="Your explanation stays yours."
      />
      {beside ? (
        <>
          <p className="open-sentence-pocket__qualification">Still beside this explanation.</p>
          {beside.title ? (
            <p className="open-sentence-pocket__source-title">{beside.title}</p>
          ) : null}
          <p className="open-sentence-pocket__passage">{beside.passage}</p>
        </>
      ) : null}
      <button type="button" onClick={() => onCommit(leaveRehearsal(exploration))}>
        Leave the rehearsal
      </button>
    </div>
  );
};

const UnwrittenWork = ({ pocketId, exploration, onCommit }) => {
  const pending = pendingUnwritten(exploration);
  if (!pending) {
    if (!canKeepAsUnwritten(exploration)) return null;
    return (
      <button type="button" onClick={() => onCommit(keepAsUnwritten(exploration))}>
        Keep this as unwritten work
      </button>
    );
  }
  return (
    <div className="open-sentence-pocket__pressure">
      {liveUnwritten(exploration) ? (
        <p className="open-sentence-pocket__proposal">Unwritten work, not the article.</p>
      ) : null}
      <PocketField
        id={`${pocketId}-unwritten`}
        label="What this collection could become"
        value={pending.question}
        onChange={(value) => onCommit(setUnwrittenField(exploration, 'question', value))}
        placeholder="An organizing question. Do not ghostwrite the thesis."
      />
      <PocketField
        id={`${pocketId}-unwritten-gap`}
        label="What still stops it"
        value={pending.gap}
        onChange={(value) => onCommit(setUnwrittenField(exploration, 'gap', value))}
        placeholder="The gap stays a gap."
      />
      <button type="button" onClick={() => onCommit(leaveUnwritten(exploration))}>
        Leave the unwritten work
      </button>
    </div>
  );
};

const CarryPassage = ({ source }) => (
  <>
    {source.title ? (
      <p className="open-sentence-pocket__source-title">{source.title}</p>
    ) : null}
    <p className="open-sentence-pocket__passage">{source.passage}</p>
  </>
);

const CarryInclude = ({ slot, exploration, onCommit }) => {
  const pending = pendingCarry(exploration);
  if (!pending) return null;
  const included = pending[slot];
  const name = carrySlotName(exploration, slot);
  if (included) {
    return (
      <button type="button" onClick={() => onCommit(leaveCarryPassage(exploration, slot))}>
        Leave {name} out
      </button>
    );
  }
  if (!canIncludeCarryPassage(exploration, slot)) return null;
  return (
    <button type="button" onClick={() => onCommit(includeCarryPassage(exploration, slot))}>
      Include {name}
    </button>
  );
};

const CarryWork = ({ pocketId, exploration, onCommit }) => {
  const pending = pendingCarry(exploration);
  const carry = liveCarry(exploration);
  if (!pending) {
    if (!canCarryOut(exploration)) return null;
    return (
      <button type="button" onClick={() => onCommit(beginCarry(exploration))}>
        Carry this out
      </button>
    );
  }
  return (
    <div className="open-sentence-pocket__pressure">
      {carry ? (
        <p className="open-sentence-pocket__proposal">A snapshot. It is not a publication.</p>
      ) : null}
      {carry ? (
        <div className="open-sentence-pocket__preview" aria-label="What a recipient would see">
          <p className="open-sentence-pocket__qualification">{carry.question}</p>
          <CarryPassage source={carry.source} />
          <CarryPassage source={carry.other} />
          <p className="open-sentence-pocket__qualification">{carry.conclusion}</p>
        </div>
      ) : null}
      <PocketField
        id={`${pocketId}-carry-question`}
        label="The question"
        value={pending.question}
        onChange={(value) => onCommit(setCarryField(exploration, 'question', value))}
        placeholder="One question. Do not share the whole Library."
      />
      {canFillCarryQuestion(exploration) ? (
        <button type="button" onClick={() => onCommit(fillCarryQuestion(exploration))}>
          Use the unfinished question
        </button>
      ) : null}
      <CarryInclude slot="source" exploration={exploration} onCommit={onCommit} />
      <CarryInclude slot="other" exploration={exploration} onCommit={onCommit} />
      <PocketField
        id={`${pocketId}-carry-conclusion`}
        label="A provisional conclusion"
        value={pending.conclusion}
        onChange={(value) => onCommit(setCarryField(exploration, 'conclusion', value))}
        placeholder="Provisional. Not a published finding."
      />
      {canFillCarryBetween(exploration) ? (
        <button type="button" onClick={() => onCommit(fillCarryBetween(exploration))}>
          Use the space between
        </button>
      ) : null}
      <CopyClip clip={carryClip(exploration)} idleLabel="Copy this snapshot" />
      <button type="button" onClick={() => onCommit(leaveCarry(exploration))}>
        Leave this snapshot
      </button>
    </div>
  );
};

const ContributionWork = ({ pocketId, exploration, onCommit }) => {
  const pending = pendingContributions(exploration);
  const live = liveContributions(exploration);
  if (!pending) {
    if (!canMeetContributions(exploration)) return null;
    return (
      <button type="button" onClick={() => onCommit(beginContributions(exploration))}>
        Let two contributions meet
      </button>
    );
  }
  const kindId = `${pocketId}-contribution-kind`;
  const namedKind = contributionKindLabel(live?.kind);
  return (
    <div className="open-sentence-pocket__pressure">
      {live ? (
        <p className="open-sentence-pocket__proposal">Two contributions. Not a consensus.</p>
      ) : null}
      {namedKind ? (
        <p className="open-sentence-pocket__qualification">{namedKind}</p>
      ) : null}
      <PocketField
        id={`${pocketId}-contribution-question`}
        label="Shared question"
        value={pending.question}
        onChange={(value) => onCommit(setContributionField(exploration, 'question', value))}
        placeholder="One question both are answering. Not a merged belief."
      />
      {canFillContributionQuestion(exploration) ? (
        <button type="button" onClick={() => onCommit(fillContributionQuestion(exploration))}>
          Use the unfinished question
        </button>
      ) : null}
      <p className="open-sentence-pocket__label" id={kindId}>Kind of difference</p>
      <div className="open-sentence-pocket__actions" role="group" aria-labelledby={kindId}>
        {CONTRIBUTION_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={pending.kind === kind}
            onClick={() => onCommit(setContributionKind(exploration, kind))}
          >
            {contributionKindLabel(kind)}
          </button>
        ))}
      </div>
      <PocketField
        id={`${pocketId}-contribution-accept`}
        label="What both accept"
        value={pending.bothAccept}
        onChange={(value) => onCommit(setContributionField(exploration, 'bothAccept', value))}
        placeholder="What both still hold. Silence is allowed."
      />
      <PocketField
        id={`${pocketId}-contribution-this`}
        label={`What ${contributionName(exploration, 'source')} still disputes`}
        value={pending.thisDisputes}
        onChange={(value) => onCommit(setContributionField(exploration, 'thisDisputes', value))}
        placeholder="This contribution's remaining dispute. Not a motive."
      />
      <PocketField
        id={`${pocketId}-contribution-other`}
        label={`What ${contributionName(exploration, 'other')} still disputes`}
        value={pending.otherDisputes}
        onChange={(value) => onCommit(setContributionField(exploration, 'otherDisputes', value))}
        placeholder="The other contribution's remaining dispute. Not a motive."
      />
      <PocketField
        id={`${pocketId}-contribution-observation`}
        label="What observation might help"
        value={pending.observation}
        onChange={(value) => onCommit(setContributionField(exploration, 'observation', value))}
        placeholder="What would help. Not a verdict."
      />
      <button type="button" onClick={() => onCommit(leaveContributions(exploration))}>
        Leave this meeting
      </button>
    </div>
  );
};

export const KeptWork = ({ pocketId, exploration, onCommit }) => (
  <>
    <ExhibitWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    <RehearsalWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    <UnwrittenWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    <CarryWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    <ContributionWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
  </>
);
