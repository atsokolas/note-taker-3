import React, { useEffect, useRef, useState } from 'react';
import { authoredWorkError } from '../../../api/authoredExplorations';
import { thoughtTitle } from './openSentenceModel';
import { AuthoredConflict, AuthoredContext, AuthoredContinuation, AuthoredKeepActions } from './AuthoredWriting';

// A removed origin must not make its private writing unreachable. The list
// names real authored work; empty passage placements do not become filler.
export default function AuthoredWorkList({
  records,
  isAvailable = () => false,
  missingMessage = 'The original sentence is no longer on this page. Your saved work is here.',
  missingLabel = '',
  openedId, onOpen, onReveal, onDiscard, onKeep, onResolveConflict
}) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(null);
  const returnTarget = useRef(null);
  const entries = Object.entries(records || {}).filter(([, record]) => thoughtTitle(record.draft));
  useEffect(() => {
    returnTarget.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
  }, [openedId, entries.length]);
  if (!entries.length) return null;
  return (
    <aside className="open-sentence-works" aria-label="Your work here">
      <p>Your work here</p>
      <ul>
        {entries.map(([itemId, record]) => {
          const draft = record.draft;
          const stillHere = isAvailable(itemId);
          return (
            <li key={itemId}>
              {stillHere ? <button type="button" onClick={() => onOpen(itemId)}>{thoughtTitle(draft)}</button> : (
                <details ref={openedId === itemId ? returnTarget : null} open={openedId === itemId || undefined}
                  onToggle={event => { if (event.currentTarget.open && openedId !== itemId) onReveal?.(itemId); }}>
                  <summary>{thoughtTitle(draft)}{missingLabel ? <span className="open-sentence-works__origin">{missingLabel}</span> : null}</summary>
                  <p>{missingMessage}</p>
                  <AuthoredContext exploration={draft} />
                  <AuthoredContinuation record={record} />
                  <AuthoredConflict record={record} canSave={false} onResolve={useLocal => {
                    setError('');
                    onResolveConflict(itemId, useLocal);
                  }} />
                  <AuthoredKeepActions record={record} onlyExisting
                    working={working?.itemId === itemId ? working.destination : working ? 'elsewhere' : ''}
                    onKeep={async destination => {
                      setWorking({ itemId, destination });
                      setError('');
                      try { await onKeep(itemId, destination); }
                      catch (failure) { setError(authoredWorkError(failure, 'This could not be kept yet. Your writing is still here.')); }
                      finally { setWorking(null); }
                    }} />
                  <button type="button" disabled={record.saving || Boolean(working) || Boolean(record.conflict)} onClick={async () => {
                    try { await onDiscard(itemId); setError(''); }
                    catch (failure) { setError(authoredWorkError(failure, 'The work could not be discarded.')); }
                  }}>Discard exploration</button>
                </details>
              )}
              {stillHere && openedId !== itemId && draft.returnNote?.trim() ? <p className="open-sentence-works__return">{draft.returnNote}</p> : null}
            </li>
          );
        })}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
    </aside>
  );
}
