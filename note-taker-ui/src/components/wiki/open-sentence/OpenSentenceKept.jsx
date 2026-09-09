import React from 'react';
import {
  bringParagraphBackLabel,
  bringSourceBackLabel,
  bringTheParagraphBack,
  bringTheSourceBack,
  canKeepAsExhibit,
  canKeepAsRehearsal,
  canKeepAsUnwritten,
  canTryWithoutParagraph,
  canTryWithoutSource,
  isWithoutParagraph,
  isWithoutSource,
  keepAsExhibit,
  keepAsRehearsal,
  keepAsUnwritten,
  leaveExhibit,
  leaveRehearsal,
  leaveUnwritten,
  liveExhibit,
  liveRehearsal,
  liveUnwritten,
  pendingExhibit,
  pendingRehearsal,
  pendingUnwritten,
  rehearsalStillBeside,
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

export const KeptWork = ({ pocketId, exploration, onCommit }) => (
  <>
    <ExhibitWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    <RehearsalWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
    <UnwrittenWork pocketId={pocketId} exploration={exploration} onCommit={onCommit} />
  </>
);
