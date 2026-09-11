import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthoredContinuityTools from './AuthoredContinuityTools';
import { authoredWorkError } from '../../../api/authoredExplorations';
import { buildAuthoredContinuationPath } from '../../../utils/sourceRoutes';
import { beginPressure, canProposeWording, chooseLibraryPassage, isPressured, proposeWording, setPressureField, thoughtTitle, titleThought, writeThought } from './openSentenceModel';

const KEEP_DESTINATIONS = [
  { destination: 'notebook', field: 'writing', name: 'note', label: 'Keep in Notebook' },
  { destination: 'question', field: 'question', name: 'question', label: 'Keep question' }
];

export function AuthoredContinuation({ record }) {
  const [result, setResult] = useState(null);
  const [copying, setCopying] = useState(false);
  const path = buildAuthoredContinuationPath(record?.saved);
  if (!path || !record?.revision || !thoughtTitle(record.draft)) return null;
  const ready = !record.dirty && !record.saving && !record.error && !record.conflict;
  const key = `${path}:${record.revision}`;
  const current = ready && result?.key === key ? result : null;
  const href = new URL(path, window.location.origin).href;
  return <div className="open-sentence-pocket__continuation">
    <div className="open-sentence-pocket__actions">
      <button type="button" disabled={!ready || copying} onClick={async () => {
        setCopying(true);
        setResult(null);
        try {
          await navigator.clipboard.writeText(href);
          setResult({ key, copied: true });
        } catch {
          setResult({ key, copied: false });
        } finally {
          setCopying(false);
        }
      }}>{copying ? 'Copying…' : 'Copy continuation link'}</button>
    </div>
    <p className="open-sentence-pocket__save" role="status">
      {!ready ? 'Finish saving and resolve any changes before taking this work elsewhere.'
        : current?.copied ? 'Link copied. Open it in a new tab, signed into the same account.'
          : current ? 'Copy this link to continue in another tab or device.'
            : 'Continue in a new tab or device, signed into the same account. The link opens your latest saved work.'}
    </p>
    {current?.copied === false ? <label className="open-sentence-pocket__label">
      Continuation link
      <input readOnly value={href} onFocus={event => event.target.select()} />
    </label> : null}
  </div>;
}

// Kept copies and interrupted Keeps remain reachable when their claim is gone.
// Recovery can finish an existing reservation, but cannot start a new one.
export function AuthoredKeepActions({ record, exploration = {}, working, onKeep, onlyExisting = false }) {
  const actions = KEEP_DESTINATIONS.filter(({ destination }) => !onlyExisting
    || record?.saved?.keeps?.some(item => item.destination === destination));
  if (!actions.length) return null;
  return <div className="open-sentence-pocket__actions">
    {actions.map(({ destination, field, name, label }) => {
      const kept = record?.saved?.keeps?.find(item => item.destination === destination);
      if (kept?.status === 'complete') return <Link key={destination} to={destination === 'notebook'
        ? `/think?tab=notebook&entryId=${encodeURIComponent(kept.targetId)}`
        : `/think?tab=questions&questionId=${encodeURIComponent(kept.targetId)}`}>
        Open kept {name}
      </Link>;
      return <button key={destination} type="button"
        disabled={Boolean(working) || record?.saving || (!kept && (Boolean(record?.conflict) || !exploration[field]?.trim()))}
        onClick={() => onKeep(destination)}>
        {working === destination ? 'Keeping…' : kept ? `Finish keeping ${name}` : label}
      </button>;
    })}
  </div>;
}

// Read the same private context in the companion inspector and recovery views.
// Empty fields stay quiet; earlier proposals retain the sentence they referred to.
export function AuthoredContext({ exploration = {}, sources }) {
  const fields = [
    ['Title', exploration.title],
    ['Original sentence', exploration.authoredAgainst || exploration.originalText],
    ['Your private writing', exploration.writing],
    ['Open question', exploration.question],
    ['Note for your return', exploration.returnNote],
    ['Trial wording', exploration.provisionalText !== exploration.originalText ? exploration.provisionalText : ''],
    ['Premise applies to', exploration.pressure?.against],
    ['For this experiment', exploration.pressure?.premise],
    ['What still holds', exploration.pressure?.stillHolds],
    ['What remains unknown', exploration.pressure?.unknown],
    ['Relationship', exploration.meet?.relation],
    ['Limit of the comparison', exploration.meet?.limit],
    ['Writing between the passages', exploration.meet?.between],
    ['Earlier essay', exploration.essay?.text],
    ['Essay applies to', exploration.essay?.against],
    ['Proposed wording', exploration.proposal?.text],
    ['Proposal applies to', exploration.proposal?.against],
    ['Named distinction', exploration.instrument?.name],
    ['Definition used here', exploration.instrument?.definition],
  ].filter(([, value]) => typeof value === 'string' && value.trim());
  const passages = sources || [exploration.selectedSource].filter(Boolean);
  return <div className="open-sentence-pocket__context-copy">
    <dl>{fields.map(([label, value]) => <React.Fragment key={label}>
      <dt>{label}</dt><dd className="open-sentence-pocket__prior-writing">{value}</dd>
    </React.Fragment>)}</dl>
    {passages.map((source, index) => <blockquote key={`${source.articleId || source.title}:${index}`}>
      <cite>{source.title}</cite><p>{source.passage}</p>
    </blockquote>)}
  </div>;
}

// Review conflicts in place, including work whose original sentence is gone.
export function AuthoredConflict({ record, onResolve, canSave = true }) {
  if (!record?.conflict) return null;
  return <div className="open-sentence-pocket__actions">
    <span>This work changed elsewhere. Both versions are available.</span>
    <details>
      <summary>Read the saved version</summary>
      <AuthoredContext exploration={record.conflict.draft} />
    </details>
    {canSave ? <button type="button" onClick={() => onResolve(true)}>Save my version instead</button> : null}
    <button type="button" onClick={() => onResolve(false)}>Use the saved version</button>
  </div>;
}

// The writing has one home. Keeping it creates a normal Notebook/Question
// object; it does not copy prose into another private "essay" state.
export default function AuthoredWriting({ exploration, onChange, authorship, pocketId }) {
  const writing = useRef(null);
  const skipTitleBlur = useRef(false);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [naming, setNaming] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const record = authorship.record;
  const kept = destination => record?.saved?.keeps?.find(item => item.destination === destination && item.status === 'complete');
  const title = thoughtTitle(exploration);
  const status = record?.saving || record?.dirty
    ? 'Saving your work…'
    : record?.revision ? 'Saved privately' : 'Your words can begin here.';

  const keep = async (destination) => {
    setWorking(destination);
    setError('');
    try { setReceipt(await authorship.keep(destination)); }
    catch (failure) { setError(authoredWorkError(failure, 'This could not be kept yet. Your writing is still here.')); }
    finally { setWorking(''); }
  };

  const discard = async () => {
    setWorking('discard');
    setError('');
    try { await authorship.discard(); }
    catch (failure) { setError(authoredWorkError(failure, 'The exploration could not be discarded.')); }
    finally { setWorking(''); }
  };

  return (
    <div className="open-sentence-pocket__authored">
      {exploration.authoredAgainst ? (
        <div className="open-sentence-pocket__prior-writing" role="status">
          <p>The article’s sentence changed. Your earlier work is still here.</p>
          <details>
            <summary>Read the earlier context</summary>
            <AuthoredContext exploration={exploration} />
          </details>
          <button type="button" onClick={() => onChange({ ...exploration, authoredAgainst: '' })}>Continue with the current sentence</button>
        </div>
      ) : null}
      {record?.saved?.sourceIssue ? (
        <div role="status">
          <p>{record.saved.sourceIssue.message} Your words are preserved.</p>
          <blockquote>{exploration.selectedSource?.passage}</blockquote>
          <button type="button" onClick={() => onChange(chooseLibraryPassage(exploration, null))}>Set aside this unavailable passage</button>
        </div>
      ) : null}
      {!exploration.authoredAgainst && exploration.pressure && !isPressured(exploration) ? (
        <details>
          <summary>A premise from the earlier sentence</summary>
          <p className="open-sentence-pocket__prior-writing">{exploration.pressure.premise}</p>
          <p>{exploration.pressure.stillHolds}</p>
          <p>{exploration.pressure.unknown}</p>
        </details>
      ) : null}
      <div className="open-sentence-pocket__writing-head">
        <label htmlFor={`${pocketId}-writing`}>{exploration.title || 'Something of your own'}</label>
        <button type="button" onClick={() => {
          skipTitleBlur.current = false;
          setPendingTitle(exploration.title || '');
          setNaming(value => !value);
        }}>
          {exploration.title ? 'Rename' : 'Give it a name'}
        </button>
      </div>
      {naming ? (
        <label className="open-sentence-pocket__label">
          Title
          <input
            autoFocus
            value={pendingTitle}
            maxLength={240}
            onChange={event => setPendingTitle(event.target.value)}
            onBlur={() => {
              if (!skipTitleBlur.current) onChange(titleThought(exploration, pendingTitle));
              setNaming(false);
            }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                skipTitleBlur.current = true;
                if (event.key === 'Enter') onChange(titleThought(exploration, pendingTitle));
                setNaming(false);
                writing.current?.focus();
              }
            }}
          />
        </label>
      ) : null}
      <textarea
        id={`${pocketId}-writing`}
        ref={writing}
        aria-label="Your writing"
        rows={6}
        maxLength={20000}
        value={exploration.writing || ''}
        placeholder="A distinction, an exception, the beginning of something…"
        onChange={event => onChange(writeThought(exploration, event.target.value))}
        onSelect={event => setSelectedTitle(event.currentTarget.value.slice(
          event.currentTarget.selectionStart, event.currentTarget.selectionEnd
        ).trim().slice(0, 240))}
      />
      {selectedTitle ? (
        <button
          type="button"
          className="open-sentence-pocket__title-selection"
          onPointerDown={event => event.preventDefault()}
          onClick={() => {
            onChange(titleThought(exploration, selectedTitle));
            setSelectedTitle('');
          }}
        >
          Make this the title
        </button>
      ) : null}
      <AuthoredKeepActions record={record} exploration={exploration} working={working} onKeep={keep} />
      {kept('notebook') || kept('question') ? <p className="open-sentence-pocket__save">Your kept copy stays as it was. This exploration can keep growing.</p> : null}
      <p className="open-sentence-pocket__save" role="status">
        {record?.error || error || authorship.error || status}
        {authorship.deviceSaved === false && record?.dirty ? ' Keep this page open until saving finishes.' : ''}
      </p>
      <AuthoredConflict record={record} onResolve={useLocal => {
        setError('');
        authorship.resolveConflict(useLocal);
      }} />
      {!record?.conflict && record?.error ? (
        <div className="open-sentence-pocket__actions">
          <button type="button" onClick={authorship.retry}>Retry save</button>
        </div>
      ) : null}
      {receipt?.href ? (
        <p className="open-sentence-pocket__receipt" role="status">
          Kept <Link to={receipt.href}>{receipt.title || title || 'your work'}</Link>
        </p>
      ) : null}
      <details className="open-sentence-pocket__discard">
        <summary>Exploration options</summary>
        <AuthoredContinuation record={record} />
        <AuthoredContinuityTools key={`${authorship.owner}:${authorship.record?.saved?.id}`} authorship={authorship} />
        {exploration.writing?.trim() && exploration.writing.length <= 4000 ? (
          <div className="open-sentence-pocket__actions">
            <button type="button" onClick={() => onChange(setPressureField(beginPressure(exploration), 'premise', exploration.writing))}>Try this writing as a premise</button>
            {canProposeWording(exploration) ? <button type="button" onClick={() => onChange(proposeWording(exploration, exploration.writing))}>Propose this writing as the line</button> : null}
          </div>
        ) : null}
        <button type="button" disabled={Boolean(working) || record?.saving || Boolean(record?.conflict)} onClick={discard}>Discard exploration</button>
      </details>
    </div>
  );
}
