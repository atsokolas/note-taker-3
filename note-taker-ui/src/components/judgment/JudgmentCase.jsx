import React, { useLayoutEffect, useRef, useState } from 'react';
import { CitationMark, MorningInbox, UpdateComposer } from '../../pages/JudgmentThread';
import { sameWeek, speaksWith, weekKey } from '../../pages/judgmentLog';
import { formatLedgerDate } from '../../pages/judgmentModel';
import { flySentenceInto } from '../../motion/columnMotion';
import { useFlightDecision } from '../../motion/useFlightDecision';

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
  /* A column of full sentences is a wall. Two lines is enough to know which
     one this is; the rest is one click away, as it is on an edition. */
  const [open, setOpen] = useState(false);
  const sources = line.sources || [];
  /* Kinship runs two ways: lines resting on the same source, and lines
     written in the same week. Hovering either lights the other. */
  const related = kin?.week
    ? sameWeek(line.at, kin)
    : sources.some(source => speaksWith(source, kin));
  /* A sentence that flew here from the inbox has already made its entrance.
     Fading it in as well would play the arrival twice. */
  const willFly = useFlightDecision(arriving, line.text);
  const when = formatLedgerDate(line.at);
  const week = weekKey(line.at);

  useLayoutEffect(() => {
    if (!arriving) return;
    flySentenceInto(textRef.current, line.text);
  }, [arriving, line.text]);

  return (
    <div className={[
      'judgment-block__entry',
      open ? 'is-open' : '',
      related ? 'is-kin' : '',
      arriving && !willFly ? 'is-arriving' : ''
    ].filter(Boolean).join(' ')}>
      <p
        className="judgment-block__text"
        ref={textRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setOpen(value => !value);
        }}
      >
        {line.text}
        {sources.length ? (
          <sup className="judgment__cites">
            {sources.map(source => (
              <CitationMark key={source.id} source={source} onKin={onKin} />
            ))}
          </sup>
        ) : null}
      </p>
      {/* The date only — what it rests on is already said by the [n] after the
          sentence. Hovering it lights everything written the same week, which
          is how a case shows you the sitting it came from. */}
      {when ? (
        <time
          className="judgment-block__when"
          dateTime={line.at}
          tabIndex={0}
          onMouseEnter={() => week && onKin?.({ week, label: 'Same week' })}
          onMouseLeave={() => onKin?.(null)}
          onFocus={() => week && onKin?.({ week, label: 'Same week' })}
          onBlur={() => onKin?.(null)}
        >
          {when}
        </time>
      ) : null}
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
  /* Newest first, and the field above them: what you just wrote appears
     directly under where you wrote it, rather than at the foot of a column
     you have to go looking down. */
  const newestFirst = [...lines].reverse();

  return (
    <section className="judgment-block" aria-label={label}>
      <div className="judgment-block__head">
        <h3>{label}</h3>
        {lines.length ? <span className="judgment-block__count">{lines.length}</span> : null}
      </div>

      {kind ? (writing ? composer(kind) : (
        <button type="button" className="judgment-block__add" onClick={() => setWriting(true)}>
          {invitation}
        </button>
      )) : null}

      {children}

      {newestFirst.length
        ? newestFirst.map(line => (
          <Entry
            key={line.id}
            line={line}
            arriving={line.id === arrivingId}
            kin={kin}
            onKin={onKin}
          />
        ))
        : <p className="judgment-block__none">{empty}</p>}
    </section>
  );
};

const JudgmentCase = ({
  view,
  boundSources = [],
  onWrite,
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
  const composer = kind => (
    <UpdateComposer
      key={`${view.id}:${kind}`}
      kind={kind}
      boundSources={boundSources}
      onWrite={onWrite}
      onSettle={onSettle}
    />
  );

  /* Kinship lights the lines it applies to and leaves the rest alone. It used
     to dim everything else, which read as the page going soft — and because a
     scroll drags entries under a still cursor, the dimming flickered on and
     off the whole way down. A highlight says the same thing and holds still. */
  const listening = Boolean(kin?.week || kin?.n != null);
  const everyLine = [...view.why, ...view.changeMindIf, ...view.against, ...view.whatIDid];
  const speaking = listening
    ? everyLine.filter(line => (kin.week
      ? sameWeek(line.at, kin)
      : (line.sources || []).some(source => speaksWith(source, kin)))).length
    : 0;

  return (
    <div className="judgment-case">
      {/* How far a source reaches. A number worth saying only when it is more
          than the line you are already looking at. */}
      {kin ? (
        <p className="judgment-case__whisper" aria-live="polite">
          {kin.label || `Source ${kin.n}`}
          {speaking > 1 ? ` · ${speaking} lines` : ''}
        </p>
      ) : null}
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
