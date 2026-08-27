import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useCssMagneticLerp from '../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import { formatLedgerDate, newLineId } from './judgmentModel';
import { LOG_FILTERS, buildJudgmentLog, filterLog, omitEntry } from './judgmentLog';

const AUTOSAVE_PAUSE_MS = 700;
const KIND_MARK = 22;
const isExternal = (href = '') => /^https?:\/\//i.test(href);

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
  const active = rail.querySelector('[aria-checked="true"]');
  if (!active) return 0;
  const railRect = rail.getBoundingClientRect();
  const buttonRect = active.getBoundingClientRect();
  return buttonRect.left - railRect.left + (buttonRect.width - KIND_MARK) / 2;
};

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
      ? <a className="judgment__cite" href={source.href} target="_blank" rel="noreferrer" aria-label={label} {...kin}>{mark}</a>
      : <Link className="judgment__cite" to={source.href} aria-label={label} {...kin}>{mark}</Link>;
  }
  return (
    <span className="judgment__cite" tabIndex={0} title={source.label} aria-label={label} {...kin}>
      {mark}
    </span>
  );
};

const LogRow = ({ entry, kin, arriving, onKin }) => {
  const related = kin != null && entry.sources.some(source => source.n === kin.n);
  const when = formatLedgerDate(entry.at);
  return (
    <li
      className={[
        'judgment-log__row',
        `judgment-log__row--${entry.kind}`,
        related ? 'is-kin' : '',
        arriving ? 'is-arriving' : ''
      ].filter(Boolean).join(' ')}
    >
      <span className="judgment-log__kind">{kindName(entry.kind)}</span>
      <p className="judgment-log__text">
        {entry.text}
        {entry.sources.length ? (
          <sup className="judgment__cites">
            {entry.sources.map(source => (
              <CitationMark key={source.id} source={source} onKin={onKin} />
            ))}
          </sup>
        ) : null}
      </p>
      {when ? <time className="judgment-log__when" dateTime={entry.at}>{when}</time> : null}
    </li>
  );
};

const KindRail = ({ kind, onKind }) => {
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
  }, [kind, rest]);

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
          className={kind === option.field ? 'is-active' : ''}
          onClick={() => onKind(option.field)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const UpdateComposer = ({ onWrite, onPending, onSettle }) => {
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
    if (!draft.trim()) return;
    const written = await save(draft);
    if (!written) return;
    onSettle?.(written);
    onPending?.('');
    lineIdRef.current = '';
    setDraft('');
    setState('idle');
  };

  return (
    <div className="judgment-composer">
      <KindRail
        kind={kind}
        onKind={async (next) => {
          if (next === kind) return;
          window.clearTimeout(timerRef.current);
          if (draft.trim()) await finish();
          lineIdRef.current = '';
          setKind(next);
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

const JudgmentLog = ({ view, arrivingId, pendingId }) => {
  const [filter, setFilter] = useState('all');
  const [unfolded, setUnfolded] = useState(() => new Set());
  const [kin, setKin] = useState(null);
  const spine = useMemo(() => buildJudgmentLog(view), [view]);
  const groups = filterLog(
    omitEntry(
      spine.map(group => (unfolded.has(group.id) ? { ...group, open: true } : group)),
      pendingId
    ),
    filter
  );
  const speaking = kin
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
    <section className={`judgment-log${kin ? ' is-listening' : ''}`} aria-label="The case so far">
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
            onKin={setKin}
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

export { UpdateComposer, JudgmentLog };
