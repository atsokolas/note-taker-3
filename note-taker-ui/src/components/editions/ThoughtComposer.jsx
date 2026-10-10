import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getEditionThoughts, saveEditionThought } from '../../api/editions';
import { currentAccountId } from '../../utils/browserScope';
import { readEditionLocal, writeEditionLocal } from './editionReadingState';

const LOAD_ERROR = 'Your thoughts could not load. Please retry before saving.';

export function useEditionThoughts(editionId) {
  const accountId = currentAccountId();
  const scope = JSON.stringify([accountId, editionId]);
  const requests = useRef({ scope, number: 0 });
  if (requests.current.scope !== scope) requests.current = { scope, number: 0 };
  const [result, setResult] = useState(null);
  const reload = useCallback(async () => {
    const request = requests.current;
    const number = ++request.number;
    try {
      const rows = await getEditionThoughts(editionId);
      if (requests.current !== request || request.number !== number || currentAccountId() !== accountId) {
        throw new Error('The reading context changed.');
      }
      if (!Array.isArray(rows)) throw new Error('Invalid saved thoughts.');
      setResult({ scope, thoughts: rows, loadError: '' });
      return rows;
    } catch (err) {
      if (requests.current === request && request.number === number && currentAccountId() === accountId) {
        setResult(current => ({ scope, thoughts: current?.scope === scope ? current.thoughts : null, loadError: LOAD_ERROR }));
      }
      throw err;
    }
  }, [accountId, editionId, scope]);
  useEffect(() => {
    reload().catch(() => {});
    const request = requests.current;
    return () => { request.number += 1; };
  }, [reload]);
  return {
    editionId,
    thoughts: result?.scope === scope ? result.thoughts : null,
    loadError: result?.scope === scope ? result.loadError : '',
    reload,
    onSaved: row => {
      if (currentAccountId() !== accountId || requests.current.scope !== scope) return;
      requests.current.number += 1;
      setResult(current => ({ scope, loadError: '', thoughts: [
        ...(current?.scope === scope ? current.thoughts || [] : []).filter(item => item.itemId !== row.itemId), row
      ] }));
    }
  };
}

// A different account, issue or finding gets its own editor and pending requests.
export default function ThoughtComposer(props) {
  const accountId = currentAccountId();
  return <ScopedThoughtComposer key={JSON.stringify([accountId, props.editionId, props.itemId])} {...props} accountId={accountId} />;
}

function ScopedThoughtComposer({ editionId, itemId, quote = '', label, thoughts, loadError, reload, onSaved, accountId }) {
  const saved = thoughts?.find(row => row.itemId === itemId);
  const draftKey = `draft:${itemId}`;
  const [draft, setDraft] = useState(() => readEditionLocal(editionId, draftKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const [conflict, setConflict] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [adoptedQuote, setAdoptedQuote] = useState(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const isCurrent = () => live.current && currentAccountId() === accountId;
  const text = draft?.content ?? saved?.content ?? '';
  const selected = adoptedQuote?.selection === quote ? adoptedQuote.value : quote || draft?.quote || saved?.quote || '';
  const latestText = useRef(text);
  latestText.current = text;
  const storeDraft = next => {
    setDraft(next);
    setReceipt(writeEditionLocal(editionId, draftKey, next)
      ? 'Draft on this device' : 'Draft not stored. Copy or download before closing.');
  };
  const update = event => {
    if (!isCurrent()) return;
    storeDraft({ content: event.target.value, quote: selected, revision: draft?.revision ?? saved?.revision ?? 0 });
  };
  const save = async () => {
    if (!isCurrent()) return;
    const attempt = { content: text, quote: selected, revision: draft?.revision ?? saved?.revision ?? 0 };
    storeDraft(attempt);
    setBusy(true);
    setError('');
    try {
      const row = await saveEditionThought(editionId, { itemId, ...attempt });
      if (!isCurrent()) return;
      onSaved(row);
      setDraft(null);
      const cleared = writeEditionLocal(editionId, draftKey, null);
      setConflict(false);
      setIncoming(null);
      setReceipt(cleared ? 'Saved privately' : 'Saved privately. The device draft could not be cleared.');
    } catch (err) {
      if (!isCurrent()) return;
      const changed = err?.response?.status === 409;
      setConflict(changed);
      setError(changed
        ? 'This thought changed elsewhere. Your words remain in this open editor. Review the saved version before choosing.'
        : 'Not saved. Your words remain in this open editor; please retry.');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const reviewSaved = async () => {
    if (!isCurrent()) return;
    setIncoming(null);
    setBusy(true);
    try {
      const rows = await reload();
      if (!isCurrent()) return;
      if (!Array.isArray(rows)) throw new Error('Saved thoughts unavailable.');
      const row = rows.find(item => item.itemId === itemId);
      if (!row) throw new Error('Saved thought unavailable.');
      setIncoming(row);
      setError('');
    } catch (_) {
      if (isCurrent()) setError('The saved version could not load. Your words remain here; copy or download them, or retry.');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const copyDraft = async () => {
    if (!isCurrent()) return;
    const copiedText = text;
    try {
      await navigator.clipboard.writeText(copiedText);
      if (isCurrent() && latestText.current === copiedText) setReceipt('Draft copied');
    } catch (_) {
      if (isCurrent() && latestText.current === copiedText) setError('Copy did not succeed. Select your words to copy them, or download the draft.');
    }
  };
  const downloadDraft = () => {
    if (!isCurrent()) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'noeis-thought-draft.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="reading-thought">
      <label>{label}
        <textarea disabled={busy} aria-label={label} rows={itemId ? 5 : 2} maxLength={6000} value={text} onChange={update}
          placeholder={itemId ? 'A distinction, a question, a reason to return…' : 'One sentence, if you like.'} />
      </label>
      {selected ? <blockquote>{selected}</blockquote> : null}
      <div>
        <button disabled={busy || !thoughts || Boolean(loadError) || conflict || (!text.trim() && !saved?.content)} onClick={save}>
          {busy ? 'Saving…' : 'Save thought'}
        </button>
        <small role="status">{receipt || (draft ? 'Draft on this device' : saved?.content ? 'Saved privately' : 'Private · optional')}</small>
      </div>
      {draft ? <div className="reading-thought__recovery">
        <button onClick={copyDraft}>Copy draft</button>
        <button onClick={downloadDraft}>Download draft</button>
      </div> : null}
      {loadError ? <p role="alert">{loadError} <button disabled={busy} onClick={() => reload().catch(() => {})}>Retry</button></p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {conflict ? <button disabled={busy} onClick={reviewSaved}>{busy ? 'Loading saved version…' : 'Review saved version'}</button> : null}
      {incoming ? <section className="reading-thought__versions" aria-label="Choose a thought version">
        <h3>Your draft</h3><p>{text}</p>
        <h3>Saved version · revision {incoming.revision}</h3><p>{incoming.content || 'Empty thought'}</p>
        {incoming.quote ? <blockquote>{incoming.quote}</blockquote> : null}
        <button disabled={busy} onClick={() => {
          if (!isCurrent()) return;
          storeDraft({ content: text, quote: selected, revision: incoming.revision });
          setIncoming(null); setConflict(false); setError('');
        }}>Keep editing my draft</button>
        <button disabled={busy} onClick={() => {
          if (!isCurrent()) return;
          onSaved(incoming);
          setAdoptedQuote({ selection: quote, value: incoming.quote || '' });
          setDraft(null);
          const cleared = writeEditionLocal(editionId, draftKey, null);
          setIncoming(null); setConflict(false); setError('');
          setReceipt(cleared ? 'Using saved version' : 'Using saved version. The device draft could not be cleared.');
        }}>Use saved version instead</button>
      </section> : null}
    </div>
  );
}
