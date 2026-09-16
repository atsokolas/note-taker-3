import React, { useEffect, useState } from 'react';
import { getEditionThoughts, saveEditionThought } from '../../api/editions';
import { readEditionLocal, writeEditionLocal } from './editionReadingState';

export function useEditionThoughts(editionId) {
  const [thoughts, setThoughts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const reload = () =>
    getEditionThoughts(editionId)
      .then((rows) => {
        setThoughts(rows);
        setLoadError('');
      })
      .catch(() => setLoadError('Your thoughts could not load. Please retry before saving.'));
  useEffect(() => {
    let active = true;
    getEditionThoughts(editionId)
      .then((rows) => {
        if (active) setThoughts(rows);
      })
      .catch(() => {
        if (active) setLoadError('Your thoughts could not load. Please retry before saving.');
      });
    return () => {
      active = false;
    };
  }, [editionId]);
  return {
    editionId,
    thoughts,
    loadError,
    reload,
    onSaved: (row) =>
      setThoughts((current) => [
        ...(current || []).filter((item) => item.itemId !== row.itemId),
        row
      ])
  };
}
export default function ThoughtComposer({
  editionId,
  itemId,
  quote = '',
  label,
  thoughts,
  loadError,
  reload,
  onSaved
}) {
  const saved = thoughts?.find((row) => row.itemId === itemId);
  const draftKey = `draft:${itemId}`;
  const [draft, setDraft] = useState(() => readEditionLocal(editionId, draftKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState('');
  const text = draft?.content ?? saved?.content ?? '';
  const selected = quote || draft?.quote || saved?.quote || '';
  const update = (event) => {
    const next = {
      content: event.target.value,
      quote: selected,
      revision: draft?.revision ?? saved?.revision ?? 0
    };
    setDraft(next);
    setReceipt(
      writeEditionLocal(editionId, draftKey, next)
        ? 'Draft on this device'
        : 'Draft not stored. Save before closing.'
    );
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const row = await saveEditionThought(editionId, {
        itemId,
        content: text,
        quote: selected,
        revision: draft?.revision ?? saved?.revision ?? 0
      });
      onSaved(row);
      setDraft(null);
      writeEditionLocal(editionId, draftKey, null);
      setReceipt('Saved privately');
    } catch (err) {
      setError(
        err?.response?.status === 409
          ? 'This thought changed elsewhere. Your draft is safe here. Copy it, then reload the saved thought before replacing it.'
          : 'Not saved. Your draft stays here; please retry.'
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reading-thought">
      <label>
        {label}
        <textarea
          disabled={busy}
          aria-label={label}
          rows={itemId ? 5 : 2}
          maxLength={6000}
          value={text}
          onChange={update}
          placeholder={
            itemId ? 'A distinction, a question, a reason to return…' : 'One sentence, if you like.'
          }
        />
      </label>
      {selected ? <blockquote>{selected}</blockquote> : null}
      <div>
        <button disabled={busy || !thoughts || (!text.trim() && !saved?.content)} onClick={save}>
          {busy ? 'Saving…' : 'Save thought'}
        </button>
        <small role="status">
          {receipt ||
            (draft
              ? 'Draft on this device'
              : saved?.content
                ? 'Saved privately'
                : 'Private · optional')}
        </small>
      </div>
      {loadError ? (
        <p role="alert">
          {loadError} <button onClick={reload}>Retry</button>
        </p>
      ) : null}
      {error ? (
        <p role="alert">
          {error}{' '}
          <button
            onClick={() => {
              setDraft(null);
              writeEditionLocal(editionId, draftKey, null);
              setError('');
              reload();
            }}
          >
            Use saved version instead
          </button>
        </p>
      ) : null}
    </div>
  );
}
