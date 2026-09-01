import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useCssMagneticLerp from '../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import { clearSentenceHandoff, flySentenceInto, handOffSentence } from '../motion/columnMotion';
import { formatLedgerDate, isLibraryHref, newLineId } from './judgmentModel';
import { LOG_FILTERS, buildJudgmentLog, filterLog, omitEntry, sameWeek, sourceKinForCandidate, speaksWith, weekKey } from './judgmentLog';
import { useFlightDecision } from '../motion/useFlightDecision';

const AUTOSAVE_PAUSE_MS = 700;
const KIND_MARK = 22;
const INBOX_OPEN = 3;
const LEAVE_MS = 200;
const isExternal = (href = '') => /^https?:\/\//i.test(href);
const FILE_KINDS = new Set(['why', 'against']);

const KINDS = [
  { field: 'why', label: 'Why', prompt: 'Why do you believe it?' },
  { field: 'against', label: 'Against', prompt: 'What argues against it?' },
  { field: 'changeMindIf', label: 'Change', prompt: 'What would change your mind?' },
  { field: 'whatIDid', label: 'Did', prompt: 'What did you do about it?' }
];

const FILTER_LABEL = {
  all: 'All',
  why: 'Why',
  against: 'Against'
};

const KIND_LABEL = {
  why: 'Why',
  against: 'Against',
  did: 'Did'
};

const kindName = (kind) => KIND_LABEL[kind] || kind;

const markOffset = (rail, clientX) => {
  const rect = rail.getBoundingClientRect();
  return clientX - rect.left - KIND_MARK / 2;
};

const activeMarkOffset = (rail) => {
  const hinted = rail.querySelector('[data-hint="true"]');
  const active = hinted || rail.querySelector('[aria-checked="true"]');
  if (!active) return 0;
  const railRect = rail.getBoundingClientRect();
  const buttonRect = active.getBoundingClientRect();
  return buttonRect.left - railRect.left + (buttonRect.width - KIND_MARK) / 2;
};

const citeClass = (source) => [
  'judgment__cite',
  isLibraryHref(source.href) ? 'is-passage' : ''
].filter(Boolean).join(' ');

const CitationMark = ({ source, onKin }) => {
  const mark = `[${source.n}]`;
  const label = source.label ? `Source ${source.n}: ${source.label}` : `Source ${source.n}`;
  const kin = {
    onMouseEnter: () => onKin?.(source),
    onMouseLeave: () => onKin?.(null),
    onFocus: () => onKin?.(source),
    onBlur: () => onKin?.(null)
  };
  if (source.href) {
    return isExternal(source.href)
      ? <a className={citeClass(source)} href={source.href} target="_blank" rel="noreferrer" aria-label={label} {...kin}>{mark}</a>
      : <Link className={citeClass(source)} to={source.href} aria-label={label} {...kin}>{mark}</Link>;
  }
  return (
    <span className={citeClass(source)} tabIndex={0} title={source.label} aria-label={label} {...kin}>
      {mark}
    </span>
  );
};

const LogRow = ({ entry, kin, arriving, onKin }) => {
  const textRef = useRef(null);
  const related = kin?.week
    ? sameWeek(entry.at, kin)
    : entry.sources.some(source => speaksWith(source, kin));
  const willFly = useFlightDecision(arriving, entry.text);
  const when = formatLedgerDate(entry.at);
  const week = weekKey(entry.at);

  useLayoutEffect(() => {
    if (!arriving) return;
    flySentenceInto(textRef.current, entry.text);
  }, [arriving, entry.text]);

  return (
    <li
      className={[
        'judgment-log__row',
        `judgment-log__row--${entry.kind}`,
        related ? 'is-kin' : '',
        arriving && !willFly ? 'is-arriving' : ''
      ].filter(Boolean).join(' ')}
    >
      <span className="judgment-log__kind">{kindName(entry.kind)}</span>
      <p className="judgment-log__text" ref={textRef}>
        {entry.text}
        {entry.sources.length ? (
          <sup className="judgment__cites">
            {entry.sources.map(source => (
              <CitationMark key={source.id} source={source} onKin={onKin} />
            ))}
          </sup>
        ) : null}
      </p>
      {when ? (
        <time
          className="judgment-log__when"
          dateTime={entry.at}
          tabIndex={0}
          onMouseEnter={() => week && onKin?.({ week, label: 'Same week' })}
          onMouseLeave={() => onKin?.(null)}
          onFocus={() => week && onKin?.({ week, label: 'Same week' })}
          onBlur={() => onKin?.(null)}
        >
          {when}
        </time>
      ) : null}
    </li>
  );
};

const KindRail = ({ kind, hintKind, onKind }) => {
  const magnetic = useCssMagneticLerp('--kind-x', 0.28);
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const follow = fine && !reduced;
  const placed = useRef(false);

  const rest = useCallback((instant) => {
    const rail = magnetic.elRef.current;
    if (!rail) return;
    const x = activeMarkOffset(rail);
    if (instant) magnetic.reset(x);
    else magnetic.setTarget(x);
  }, [magnetic]);

  useEffect(() => {
    rest(!placed.current);
    placed.current = true;
  }, [kind, hintKind, rest]);

  return (
    <div
      ref={magnetic.elRef}
      className="judgment-composer__kinds"
      role="radiogroup"
      aria-label="This update is"
      onMouseMove={(event) => {
        if (!follow) return;
        magnetic.setTarget(markOffset(event.currentTarget, event.clientX));
      }}
      onMouseLeave={() => {
        if (follow) rest(false);
      }}
    >
      {KINDS.map(option => (
        <button
          key={option.field}
          type="button"
          role="radio"
          aria-checked={kind === option.field}
          data-hint={hintKind === option.field ? 'true' : undefined}
          className={[
            kind === option.field ? 'is-active' : '',
            hintKind === option.field ? 'is-hint' : ''
          ].filter(Boolean).join(' ')}
          onClick={() => onKind(option.field)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const KindWords = ({ kind, disabled, onHint, onChoose }) => (
  <span className="judgment__kind-words">
    {['why', 'against'].map((field) => (
      <button
        key={field}
        type="button"
        className={kind === field ? 'is-lit' : ''}
        disabled={disabled}
        onMouseEnter={() => onHint?.(field)}
        onMouseLeave={() => onHint?.('')}
        onFocus={() => onHint?.(field)}
        onBlur={() => onHint?.('')}
        onClick={() => onChoose?.(field)}
      >
        {field === 'why' ? 'Why' : 'Against'}
      </button>
    ))}
  </span>
);

const InboxLine = ({
  candidate,
  kind,
  leaving,
  filing,
  kin,
  match,
  onKin,
  onHint,
  onFile,
  onPress
}) => {
  const textRef = useRef(null);
  const related = speaksWith(match, kin);
  const fileable = FILE_KINDS.has(kind);
  const whisper = match || null;
  const ink = candidate.whyThisSource;

  return (
    <li
      className={[
        'judgment-inbox__line',
        leaving ? 'is-leaving' : '',
        related ? 'is-kin' : ''
      ].filter(Boolean).join(' ')}
    >
      <p className="judgment-inbox__passage">
        {fileable ? (
          <button
            ref={textRef}
            type="button"
            className="judgment-inbox__text"
            disabled={filing}
            onMouseEnter={() => whisper && onKin?.(whisper)}
            onMouseLeave={() => onKin?.(null)}
            onFocus={() => whisper && onKin?.(whisper)}
            onBlur={() => onKin?.(null)}
            onClick={() => onPress(candidate, textRef.current)}
          >
            {candidate.text}
          </button>
        ) : (
          <span
            ref={textRef}
            className="judgment-inbox__text"
            onMouseEnter={() => whisper && onKin?.(whisper)}
            onMouseLeave={() => onKin?.(null)}
          >
            {candidate.text}
          </span>
        )}
        {match?.n != null ? (
          <sup className="judgment__cites">
            <CitationMark source={match} onKin={onKin} />
          </sup>
        ) : null}
        {ink ? <span className="judgment-inbox__hold">{ink}</span> : null}
      </p>
      <KindWords
        kind={kind}
        disabled={filing}
        onHint={onHint}
        onChoose={(field) => onFile(candidate, field, textRef.current)}
      />
    </li>
  );
};

/* `candidates` is null until the library has actually been searched, and an
   array afterwards — an empty one when the search genuinely found nothing.
   The distinction is the whole feature: a skeptic that goes quiet because it
   has not looked yet reads exactly like one that looked and found nothing,
   and only one of those is worth saying out loud. */
const MorningInbox = ({
  candidates = null,
  kind,
  view,
  kin,
  onKin,
  onHint,
  onFile
}) => {
  const [open, setOpen] = useState(false);
  const [leavingId, setLeavingId] = useState('');
  const [filingId, setFilingId] = useState('');
  const [dismissed, setDismissed] = useState([]);
  const reduced = usePrefersReducedMotion();
  // Null means the search has not run. Everything below derives from what was
  // actually found, so an unrun search behaves like an empty one until the
  // returns below tell the two apart.
  const searched = Array.isArray(candidates);
  const found = searched ? candidates : [];
  const remaining = found.filter(candidate => !dismissed.includes(candidate.id));
  const visible = open ? remaining : remaining.slice(0, INBOX_OPEN);
  const hidden = Math.max(0, remaining.length - visible.length);
  const listening = kin != null && kin.n != null;

  const file = async (candidate, field, origin) => {
    if (filingId || !FILE_KINDS.has(field)) return;
    setFilingId(candidate.id);
    handOffSentence(candidate.text, origin);
    setLeavingId(candidate.id);
    try {
      const filed = await onFile(candidate, field);
      if (filed === false) {
        clearSentenceHandoff();
        setLeavingId('');
        return;
      }
      const wait = reduced ? 0 : LEAVE_MS;
      if (wait) await new Promise(resolve => window.setTimeout(resolve, wait));
      setDismissed(current => (current.includes(candidate.id) ? current : [...current, candidate.id]));
    } finally {
      setFilingId('');
    }
  };

  // Not searched yet. Nothing truthful to say, so nothing is said.
  if (!searched) return null;

  /* Searched, and the library had nothing bearing on this sentence. That is a
     finding, and the skeptic reports it. Dismissing your way down to an empty
     list is not the same event, so it stays quiet — the search did find
     something, you just dealt with it. */
  if (!found.length) {
    return (
      <p className="judgment-inbox__nothing" role="status">
        Searched your library. Nothing in it bears on this sentence.
      </p>
    );
  }
  if (!remaining.length) return null;

  return (
    <div
      className={`judgment-slip judgment-inbox${listening ? ' is-listening' : ''}`}
      role="region"
      aria-label="On this sentence"
    >
      <ol className="judgment-inbox__list">
        {visible.map(candidate => (
          <InboxLine
            key={candidate.id}
            candidate={candidate}
            kind={kind}
            leaving={leavingId === candidate.id}
            filing={Boolean(filingId)}
            kin={kin}
            match={sourceKinForCandidate(view, candidate)}
            onKin={onKin}
            onHint={onHint}
            onFile={file}
            onPress={(item, origin) => file(item, kind, origin)}
          />
        ))}
      </ol>
      {hidden ? (
        <button type="button" className="judgment-inbox__more" onClick={() => setOpen(true)}>
          more…
        </button>
      ) : null}
    </div>
  );
};

const UpdateComposer = ({
  onWrite,
  onPending,
  onSettle,
  inbox = null,
  onFile,
  view,
  kin,
  onKin,
  hintKind,
  onHint
}) => {
  const [kind, setKind] = useState('why');
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('idle');
  const [writeError, setWriteError] = useState('');
  const lineIdRef = useRef('');
  const timerRef = useRef(0);
  const prompt = KINDS.find(option => option.field === kind)?.prompt || 'Write an update…';

  const save = useCallback(async (text) => {
    const line = text.trim();
    if (!line || !onWrite) return '';
    if (!lineIdRef.current) {
      lineIdRef.current = newLineId(kind);
      onPending?.(lineIdRef.current);
    }
    setState('saving');
    setWriteError('');
    try {
      await onWrite(line, kind, lineIdRef.current);
      setState('saved');
      return lineIdRef.current;
    } catch (failure) {
      setState('error');
      setWriteError(
        failure?.response?.data?.error
        || failure?.message
        || 'That line could not be saved.'
      );
      return '';
    }
  }, [kind, onPending, onWrite]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const finish = async () => {
    window.clearTimeout(timerRef.current);
    if (!draft.trim()) return true;
    const written = await save(draft);
    if (!written) return false;
    onSettle?.(written);
    onPending?.('');
    lineIdRef.current = '';
    setDraft('');
    setState('idle');
    return true;
  };

  const chooseKind = async (next) => {
    window.clearTimeout(timerRef.current);
    if (draft.trim() && !(await finish())) return false;
    lineIdRef.current = '';
    if (next !== kind) setKind(next);
    return true;
  };

  const fileInbox = async (candidate, field) => {
    const ok = await chooseKind(field);
    if (!ok) return false;
    try {
      await onFile?.(candidate, field);
      return true;
    } catch (failure) {
      setWriteError(
        failure?.response?.data?.error
        || failure?.message
        || 'That line was not saved.'
      );
      return false;
    }
  };

  return (
    <div className="judgment-composer">
      <KindRail
        kind={kind}
        hintKind={hintKind}
        onKind={async (next) => {
          if (next === kind) return;
          await chooseKind(next);
        }}
      />
      <label className="sr-only" htmlFor="judgment-update">{prompt}</label>
      <input
        id="judgment-update"
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          setState(value.trim() ? 'typing' : 'idle');
          window.clearTimeout(timerRef.current);
          if (value.trim()) timerRef.current = window.setTimeout(() => save(value), AUTOSAVE_PAUSE_MS);
        }}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          finish();
        }}
        placeholder={prompt}
        autoComplete="off"
      />
      <div className="judgment-composer__meta">
        <span className="judgment__write-state" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
        {writeError ? <span role="alert">{writeError}</span> : null}
      </div>
      <MorningInbox
        candidates={inbox}
        kind={kind}
        view={view}
        kin={kin}
        onKin={onKin}
        onHint={onHint}
        onFile={fileInbox}
      />
    </div>
  );
};

const MonthFold = ({ group, kin, arrivingId, onKin, onToggle }) => {
  if (group.open) {
    return (
      <>
        {group.label ? <h3 className="judgment-log__month-name">{group.label}</h3> : null}
        <ol className="judgment-log__list">
          {group.entries.map(entry => (
            <LogRow
              key={entry.id}
              entry={entry}
              kin={kin}
              arriving={entry.id === arrivingId}
              onKin={onKin}
            />
          ))}
        </ol>
      </>
    );
  }

  const count = group.entries.length;
  return (
    <button
      type="button"
      className="judgment-log__fold"
      aria-expanded="false"
      onClick={onToggle}
    >
      {group.label}
      <span>{count} {count === 1 ? 'update' : 'updates'}</span>
    </button>
  );
};

const JudgmentLog = ({ view, arrivingId, pendingId, kin, onKin }) => {
  const [filter, setFilter] = useState('all');
  const [unfolded, setUnfolded] = useState(() => new Set());
  const spine = useMemo(() => buildJudgmentLog(view), [view]);
  const groups = filterLog(
    omitEntry(
      spine.map(group => (unfolded.has(group.id) ? { ...group, open: true } : group)),
      pendingId
    ),
    filter
  );
  const listening = Boolean(kin?.week || kin?.n != null);
  const speaking = kin?.week
    ? spine.flatMap(group => group.entries).filter(entry => sameWeek(entry.at, kin)).length
    : listening
      ? spine.flatMap(group => group.entries).filter(entry => entry.sources.some(source => source.n === kin.n)).length
      : 0;

  const toggle = (id) => {
    setUnfolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className={`judgment-log${listening ? ' is-listening' : ''}`} aria-label="The case so far">
      <div className="judgment-log__filters" role="tablist" aria-label="Show">
        {LOG_FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? 'is-active' : ''}
            onClick={() => setFilter(id)}
          >
            {FILTER_LABEL[id]}
          </button>
        ))}
        {kin ? (
          <p className="judgment-log__whisper" aria-live="polite">
            {kin.label || `Source ${kin.n}`}
            {speaking > 1 ? ` · ${speaking} lines` : ''}
          </p>
        ) : null}
      </div>
      {groups.length ? groups.map(group => (
        <div key={group.id} className="judgment-log__month">
          <MonthFold
            group={group}
            kin={kin}
            arrivingId={arrivingId}
            onKin={onKin}
            onToggle={() => toggle(group.id)}
          />
        </div>
      )) : (
        <p className="judgment-log__empty">
          {filter === 'all' ? 'Nothing written yet.' : 'Nothing on this side yet.'}
        </p>
      )}
    </section>
  );
};

export { UpdateComposer, JudgmentLog, KindWords };
