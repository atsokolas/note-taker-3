import React, { useLayoutEffect, useRef, useState } from 'react';
import { countWord } from '../../pages/judgmentModel';
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
 *
 * A block rests as one sentence: its newest line, and a door to what is older.
 * Folding the whole block to its title would bring the tabs back — an empty
 * Against would read as a tab you had not opened rather than as an absence —
 * so the fold happens a level down, at the sentence, and the four names stay
 * on screen together.
 */

/* A written line. Plain text on the page, its citations after it, and the
   date it was written under it — the record, in the register the record uses
   everywhere else here. */
/* Kinship runs two ways: lines resting on the same source, and lines written
   in the same week. One predicate, so a line and the block holding it can
   never disagree about whether it is kin. */
const speaksFor = (line, kin) => (kin?.week
  ? sameWeek(line.at, kin)
  : (line.sources || []).some(source => speaksWith(source, kin)));

const Entry = ({ line, open, textRef: leadRef, arriving, kin, onKin }) => {
  const ownRef = useRef(null);
  const textRef = leadRef || ownRef;
  const sources = line.sources || [];
  const related = speaksFor(line, kin);
  /* A sentence that flew here from the inbox has already made its entrance.
     Fading it in as well would play the arrival twice. */
  const willFly = useFlightDecision(arriving, line.text);
  const when = formatLedgerDate(line.at);
  const week = weekKey(line.at);

  useLayoutEffect(() => {
    if (!arriving) return;
    flySentenceInto(textRef.current, line.text);
  }, [arriving, line.text, textRef]);

  return (
    <div className={[
      'judgment-block__entry',
      open ? 'is-open' : '',
      related ? 'is-kin' : '',
      arriving && !willFly ? 'is-arriving' : ''
    ].filter(Boolean).join(' ')}>
      <p className="judgment-block__text" ref={textRef}>
        {line.text}
        {sources.length ? (
          <sup className="judgment__cites">
            {sources.map(source => (
              <CitationMark key={source.id} source={source} onKin={onKin} />
            ))}
          </sup>
        ) : null}
      </p>
      {/* Open, a line names what it rests on. The [n] after the sentence is
          the hook for kinship; the name is the thing you can actually read,
          and it is only worth the room once you have asked for the detail. */}
      {open && sources.length ? (
        <p className="judgment-block__source">{sources.map(source => source.label).filter(Boolean).join(' · ')}</p>
      ) : null}
      {/* A test with a signal says what is watching it. Only tests carry one,
          so no branch on the kind is needed here. */}
      {line.signal ? <p className="judgment-block__signal">Watching: {line.signal}</p> : null}
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

/* Whether the lead sentence is taller than the two lines it is given. A door
   is only honest if it opens onto something, and one line of held text can be
   either three words or a paragraph — so this is measured, not guessed.
   Measure only while the lead is clamped: opening it to full height would
   report no overflow, and the Fold door would vanish under the reader. */
const useClipped = (ref, text, measuring) => {
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    if (!measuring) return undefined;
    const node = ref.current;
    if (!node) {
      setClipped(false);
      return undefined;
    }
    const measure = () => {
      setClipped(current => {
        const next = node.scrollHeight - node.clientHeight > 1;
        return current === next ? current : next;
      });
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    });
    observer.observe(node);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, text, measuring]);
  return clipped;
};

const Block = ({
  label,
  lines = [],
  kind,
  invitation,
  arrivingId,
  kin,
  onKin,
  composer,
  children
}) => {
  const [writing, setWriting] = useState(false);
  const [opened, setOpened] = useState(false);
  const leadRef = useRef(null);
  /* Newest first, and the field above them: what you just wrote appears
     directly under where you wrote it, rather than at the foot of a column
     you have to go looking down. */
  const newestFirst = [...lines].reverse();
  const lead = newestFirst[0];
  const earlier = newestFirst.length - 1;
  /* Hovering a source says how many lines rest on it. If the fold is hiding
     one of them the block opens, so the count and the page agree — otherwise
     the whisper says three lines while one is on screen, which is the page
     knowing the truth and losing it at the last inch. A block whose kin is
     already showing stays where it is. */
  const holdsKin = Boolean(kin) && newestFirst.slice(1).some(line => speaksFor(line, kin));
  const open = opened || holdsKin;
  const clipped = useClipped(leadRef, lead?.text, Boolean(lead) && !open);
  /* At rest a block is its newest sentence. Everything older is behind one
     door, so four blocks read as four sentences and the page can be taken in
     at a glance before any of it is opened. `opened` keeps Fold on screen
     after a long single line has been read in full, even if the live measure
     would now say the sentence fits. */
  const showing = open ? newestFirst : newestFirst.slice(0, 1);
  const hidden = earlier > 0 || clipped || opened;

  return (
    <section className="judgment-block" aria-label={label}>
      <div className="judgment-block__head">
        <h3>{label}</h3>
        {lines.length ? <span className="judgment-block__count">{lines.length}</span> : null}
      </div>

      {/* Not a box and not a button: the next sentence of the block, faint,
          in the block's own hand. It becomes a field the moment you reach for
          it, so nothing on this page looks like a form until you are writing
          — and on an empty block it is the empty state as well. */}
      {kind ? (writing ? composer(kind) : (
        <button type="button" className="judgment-block__ghost" onClick={() => setWriting(true)}>
          {invitation}
        </button>
      )) : null}

      {children}

      {showing.map((line, index) => (
        <Entry
          key={line.id}
          line={line}
          open={open}
          textRef={index === 0 ? leadRef : null}
          arriving={line.id === arrivingId}
          kin={kin}
          onKin={onKin}
        />
      ))}

      {lines.length && hidden ? (
        <button
          type="button"
          className={`judgment-block__door${open ? ' is-open' : ''}`}
          aria-expanded={open}
          onClick={() => setOpened(value => !value)}
        >
          {open ? 'Fold' : (earlier > 0 ? `and ${countWord(earlier)} earlier` : 'Read it in full')}
        </button>
      ) : null}
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
  const speaking = listening ? everyLine.filter(line => speaksFor(line, kin)).length : 0;

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
          kind="why"
          invitation="Add a reason…"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        />

        <Block
          label="What would change your mind"
          lines={view.changeMindIf}
          kind="changeMindIf"
          invitation="Add a test…"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        >
          {test}
        </Block>

        {/* What happened since. */}
        <Block
          label="What argues against it"
          lines={view.against}
          kind="against"
          invitation="Add counterevidence…"
          arrivingId={arrivingId}
          kin={kin}
          onKin={onKin}
          composer={composer}
        />

        <Block
          label="What you did about it"
          lines={view.whatIDid}
          kind="whatIDid"
          invitation="Record what you did…"
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
