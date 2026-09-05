import React, { useCallback, useEffect, useState } from 'react';
import { createSticky, deleteSticky, listStickies } from '../api/stickies';

const STICKY_MAX = 140;

/*
 * Pinned lines: one private line on anything, never a thread.
 *
 * A sticky cannot grow — 140 characters, counted live like paper running
 * out — because a sticky that grows is a note, and notes already exist.
 * Deleting is one tap with no confirm; asking "are you sure" about 140
 * characters would be the product valuing its caution over the reader's
 * time. A dated sticky prints once in the paper and goes home; undated
 * ones never leave the object they are pinned to.
 */

const StickyNotes = ({ targetType = '', targetId = '', targetTitle = '', targetHref = '' }) => {
  const [rows, setRows] = useState(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!targetType || !targetId) return;
    try {
      const read = await listStickies({ targetType, targetId });
      setRows(Array.isArray(read) ? read : []);
    } catch (_unreadable) {
      /* A shelf of pinned lines we could not read is not an empty shelf.
         Null stays null and the corner stays quiet rather than reporting
         that nothing is pinned. */
      setRows(null);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    setRows(null);
    setComposing(false);
    setDraft('');
    setDue('');
    setError('');
    load();
  }, [load]);

  if (!targetType || !targetId) return null;

  const add = async (event) => {
    event?.preventDefault?.();
    const text = String(draft || '').replace(/\s+/g, ' ').trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await createSticky({
        text: text.slice(0, STICKY_MAX),
        targetType,
        targetId,
        targetTitle,
        targetHref,
        dueAt: due || null
      });
      setRows((current) => (Array.isArray(current) ? [saved, ...current] : [saved]));
      setDraft('');
      setDue('');
      setComposing(false);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const key = String(id || '').trim();
    if (!key || busy) return;
    setBusy(true);
    setError('');
    const previous = rows;
    setRows((current) => (Array.isArray(current) ? current.filter((row) => String(row._id) !== key) : current));
    try {
      await deleteSticky(key);
    } catch (requestError) {
      setRows(previous);
      setError(requestError?.response?.data?.error || 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sticky-notes" aria-label="Pinned lines">
      {Array.isArray(rows) && rows.length ? (
        <ul className="sticky-notes__list">
          {rows.map((row) => (
            <li key={row._id} className="sticky-notes__row">
              <span>{row.text}</span>
              {row.dueAt ? (
                <span className="sticky-notes__due">{new Date(row.dueAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              ) : null}
              <button
                type="button"
                className="sticky-notes__done"
                aria-label={`Remove pinned line: ${String(row.text || '').slice(0, 48)}`}
                disabled={busy}
                onClick={() => remove(row._id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {composing ? (
        <form className="sticky-notes__composer" onSubmit={add}>
          <input
            autoFocus
            value={draft}
            maxLength={STICKY_MAX}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Pin a line to this source…"
            aria-label="Pin a line to this source"
          />
          <span className="sticky-notes__count" aria-hidden="true">{STICKY_MAX - draft.length}</span>
          <input
            type="date"
            value={due}
            onChange={(event) => setDue(event.target.value)}
            aria-label="Print in the paper on this morning (optional)"
          />
          <button type="submit" disabled={busy || !draft.trim()}>Pin it</button>
          <button type="button" onClick={() => { setComposing(false); setDraft(''); setDue(''); setError(''); }}>
            Never mind
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="sticky-notes__open"
          onClick={() => setComposing(true)}
        >
          Pin a line
        </button>
      )}
      {error ? <p className="sticky-notes__error" role="alert">{error}</p> : null}
    </section>
  );
};

export default StickyNotes;
