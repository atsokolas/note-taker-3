import React, { useLayoutEffect, useRef, useState } from 'react';
import { CitationMark, MorningInbox, UpdateComposer } from '../../pages/JudgmentThread';
import { sameWeek, speaksWith } from '../../pages/judgmentLog';
import { formatLedgerDate } from '../../pages/judgmentModel';
import { flySentenceInto } from '../../motion/columnMotion';

/**
 * The case, two by two.
 *
 * This was a chronological log behind two rows of tabs — Why / Against /
 * Change / Did to write with, All / Why / Against to read with — which meant
 * the four things a belief is made of were never on screen together, and an
 * empty Against read as a tab you had not opened rather than as an absence.
 *
 * They are four blocks now. The top row is what you claim: your reasons, and
 * the exit you gave yourself. Both are written the day you form the belief and
 * both are your own assertions. The bottom row is what happened since: the
 * world's reply, and yours. So the grid reads down the page as time.
 *
 * One rule holds everywhere on it. What is written is plain text on the page —
 * no border, no box, a record reads as a document. What you are writing is a
 * field, and a field is the only thing here that ever looks like one. At rest
 * the page carries none; clicking a block opens exactly one, in place.
 */

/* A written line. Plain text on the page, its citations after it, and the
   date it was written under it — the record, in the register the record uses
   everywhere else here. */
const Entry = ({ line, arriving, kin, onKin }) => {
  const textRef = useRef(null);
  const sources = line.sources || [];
  /* Kinship runs two ways: lines resting on the same source, and lines
     written in the same week. Hovering either lights the other. */
  const related = kin?.week
    ? sameWeek(line.at, kin)
    : sources.some(source => speaksWith(source, kin));

  useLayoutEffect(() => {
    if (!arriving) return;
    flySentenceInto(textRef.current, line.text);
  }, [arriving, line.text]);

  return (
    <div className={[
      'judgment-block__entry',
      related ? 'is-kin' : '',
      arriving ? 'is-arriving' : ''
    ].filter(Boolean).join(' ')}>
      <p ref={textRef}>
        {line.text}
        {sources.length ? (
          <sup className="judgment__cites">
            {sources.map(source => (
              <CitationMark key={source.id} source={source} onKin={onKin} />
            ))}
          </sup>
        ) : null}
      </p>
      {/* The date only. What it rests on is already said by the [n] after the
          sentence, and saying it twice is not saying it better. */}
      {line.at ? <cite>{formatLedgerDate(line.at)}</cite> : null}
    </div>
  );
};

const Block = ({
  label,
  lines = [],
  empty,
  kind,
  invitation,
  arrivingId,
  kin,
  onKin,
  composer,
  children
}) => {
  const [writing, setWriting] = useState(false);
  return (
    <section className="judgment-block" aria-label={label}>
      <div className="judgment-block__head">
        <h3>{label}</h3>
        <span className="judgment-block__count">{lines.length || 'none'}</span>
      </div>

      {lines.length
        ? lines.map(line => (
          <Entry
            key={line.id}
            line={line}
            arriving={line.id === arrivingId}
            kin={kin}
            onKin={onKin}
          />
        ))
        : <p className="judgment-block__none">{empty}</p>}

      {children}

      {/* A field only exists once you have asked for one, and then it stays:
          a reader writing reasons writes several, and closing it after each
          would charge a click for the next. */}
      {kind ? (writing ? (
        composer(kind)
      ) : (
        <button type="button" className="judgment-block__add" onClick={() => setWriting(true)}>
          {invitation}
        </button>
      )) : null}
    </section>
  );
};

const JudgmentCase = ({
  view,
  boundSources = [],
  onWrite,
  onPending,
  onSettle,
  arrivingId = '',
  inbox = null,
  onFile,
  kin,
  onKin,
  /* The test's own machinery — setting it, and recording what happened when
     the date arrived — stays where it was built and is shown inside the block
     that is about it. */
  test = null
}) => {
  const composer = fixedKind => (
    <UpdateComposer
      key={`${view.id}:${fixedKind}`}
      fixedKind={fixedKind}
      boundSources={boundSources}
      onWrite={onWrite}
      onPending={onPending}
      onSettle={onSettle}
      inbox={inbox}
      onFile={onFile}
      view={view}
      kin={kin}
      onKin={onKin}
    />
  );

  return (
    <div className="judgment-case">
      {/* What the library has found that bears on this sentence. It is about
          the case, not about the line you happen to be writing, so it stands
          above the grid rather than inside whichever block is open. */}
      <MorningInbox
        candidates={inbox}
        kind="why"
        view={view}
        kin={kin}
        onKin={onKin}
        onFile={onFile}
      />

      <div className="judgment-case__grid">
        {/* What you claim. */}
        <Block
          label="Why you believe it"
          lines={view.why}
          empty="Nothing written. The reasons are the case."
          kind="why"
          invitation="+ Add a reason"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        />

        <Block
          label="What would change your mind"
          lines={view.changeMindIf}
          empty="Nothing written. A belief with no exit is not a judgment."
          kind="changeMindIf"
          invitation="+ Add a test"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        >
          {/* A test nobody is watching is a test in name only, and this page is
              the only place that knows. */}
          {view.changeMindIf.some(line => !line.signal) ? (
            <p className="judgment-block__unwatched">
              Nothing is watching this — no observable signal named.
            </p>
          ) : null}
          {test}
        </Block>

        {/* What happened since. */}
        <Block
          label="What argues against it"
          lines={view.against}
          empty="Nothing written. This is the side that changes your mind."
          kind="against"
          invitation="+ Add counterevidence"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        />

        <Block
          label="What you did about it"
          lines={view.whatIDid}
          empty="Nothing recorded. A belief you never acted on is cheaper than it looks."
          kind="whatIDid"
          invitation="+ Record what you did"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        />
      </div>
    </div>
  );
};

export default JudgmentCase;
