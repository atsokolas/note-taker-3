import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePrefersReducedMotion } from '../hooks/useMotionPreferences';
import { clearSentenceHandoff, handOffSentence } from '../motion/columnMotion';
import { isLibraryHref, newLineId } from './judgmentModel';
import { sourceKinForCandidate, speaksWith } from './judgmentLog';
import { clearMention, readMention } from './sourceMention';
import SourcePicker from '../components/judgment/SourcePicker';

const AUTOSAVE_PAUSE_MS = 700;
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

const KindWords = ({ kind, disabled, onChoose }) => (
  <span className="judgment__kind-words">
    {['why', 'against'].map((field) => (
      <button
        key={field}
        type="button"
        className={kind === field ? 'is-lit' : ''}
        disabled={disabled}
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
  onSettle,
  inbox = null,
  onFile,
  view,
  kin,
  onKin,
  /* Sources already bound to this case, offered before the library is asked. */
  boundSources = [],
  /* Decided by the block this was opened in. A composer that could change its
     own mind needed a rail; one that belongs to a side does not. */
  kind
}) => {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState('idle');
  const [writeError, setWriteError] = useState('');
  /* The source pinned to the line being written, if the writer reached for
     one. A reason and the thing it rests on are written in one gesture. */
  const [source, setSource] = useState(null);
  const [mention, setMention] = useState(null);
  const inputRef = useRef(null);
  const lineIdRef = useRef('');
  const timerRef = useRef(0);
  const prompt = KINDS.find(option => option.field === kind)?.prompt || 'Write an update…';
  const citing = kind === 'why' || kind === 'against';

  const save = useCallback(async (text) => {
    const line = text.trim();
    if (!line || !onWrite) return '';
    if (!lineIdRef.current) {
      lineIdRef.current = newLineId(kind);
    }
    setState('saving');
    setWriteError('');
    try {
      await onWrite(line, kind, lineIdRef.current, source);
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
  }, [kind, onWrite, source]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const finish = async () => {
    window.clearTimeout(timerRef.current);
    if (!draft.trim()) return true;
    const written = await save(draft);
    if (!written) return false;
    onSettle?.(written);
    lineIdRef.current = '';
    setDraft('');
    setSource(null);
    setMention(null);
    setState('idle');
    return true;
  };

  return (
    <div className="judgment-composer">
      <label className="sr-only" htmlFor="judgment-update">{prompt}</label>
      <input
        id="judgment-update"
        ref={inputRef}
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          setDraft(value);
          setState(value.trim() ? 'typing' : 'idle');
          const reach = citing ? readMention(value, event.target.selectionStart) : null;
          setMention(reach);
          window.clearTimeout(timerRef.current);
          /* Reaching for a source is not writing a sentence. Autosave would
             otherwise settle "Lead times @semi" — or a bare "@" — as a reason
             while the picker was still open. */
          if (value.trim() && !reach) timerRef.current = window.setTimeout(() => save(value), AUTOSAVE_PAUSE_MS);
        }}
        /* The picker takes the click before the blur lands, so letting blur
           finish the line here would settle the sentence out from under the
           source the writer was reaching for. */
        onBlur={() => { if (!mention) finish(); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && mention) {
            event.preventDefault();
            setMention(null);
            return;
          }
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (mention) { setMention(null); return; }
          finish();
        }}
        placeholder={prompt}
        autoComplete="off"
      />

      {/* What this line will rest on. Written in one gesture with the line, so
          the case knows where the sentence came from at the moment it is made
          rather than never. */}
      {source ? (
        <p className="judgment-composer__source">
          <span>on</span>
          <span className="judgment-composer__source-name">{source.label}</span>
          <button type="button" onClick={() => setSource(null)} aria-label={`Unbind ${source.label}`}>
            take it off
          </button>
        </p>
      ) : null}

      {mention && citing ? (
        <SourcePicker
          bound={boundSources}
          query={mention.query}
          onDismiss={() => setMention(null)}
          onChoose={(chosen) => {
            setDraft((current) => clearMention(current, mention));
            setSource(chosen);
            setMention(null);
            inputRef.current?.focus();
          }}
        />
      ) : null}

      <div className="judgment-composer__meta">
        <span className="judgment__write-state" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
        {/* The way in for anyone who does not know the mark exists. */}
        {citing && !source && !mention ? (
          <button
            type="button"
            className="judgment-composer__find"
            onClick={() => {
              const next = draft && !draft.endsWith(' ') ? `${draft} @` : `${draft}@`;
              setDraft(next);
              setMention(readMention(next, next.length));
              inputRef.current?.focus();
            }}
          >
            Find a source
          </button>
        ) : null}
        {writeError ? <span role="alert">{writeError}</span> : null}
      </div>
    </div>
  );
};

export { UpdateComposer, KindWords, CitationMark, MorningInbox };
