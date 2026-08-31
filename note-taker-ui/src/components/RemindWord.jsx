import React, { useEffect, useState } from 'react';
import {
  createReturnQueueEntry,
  listReturnQueue,
  updateReturnQueueEntry
} from '../api/returnQueue';
import {
  dueAtFromDateInput,
  pendingRemindOf,
  REMIND_WORD,
  remindPresets
} from '../pages/kairosModel';
import '../styles/evergreen.css';

/*
 * Remind me — same family as Later and Keep: a word with a rule under it.
 * The date strip is an inscription of the right morning, not a modal.
 */

const RemindWord = ({ articleId = '', className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [day, setDay] = useState('');
  const id = String(articleId || '').trim();
  const active = Boolean(pending);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    Promise.resolve(listReturnQueue({ filter: 'all', itemType: 'article', itemId: id }))
      .then((entries) => {
        if (!cancelled) setPending(pendingRemindOf(entries, id));
      })
      .catch(() => {
        if (!cancelled) setPending(null);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (!id) return null;

  const fail = (pressError) => {
    setError(pressError?.response?.data?.error || 'That did not save.');
  };

  const remember = async ({ dueAt, cadence = null }) => {
    if (busy || !dueAt) return;
    setBusy(true);
    setError('');
    try {
      const saved = await createReturnQueueEntry({
        itemType: 'article',
        itemId: id,
        dueAt: dueAt instanceof Date ? dueAt.toISOString() : dueAt,
        cadence
      });
      setPending(saved);
      setOpen(false);
      setDay('');
    } catch (pressError) {
      fail(pressError);
    } finally {
      setBusy(false);
    }
  };

  const press = async () => {
    if (busy) return;
    if (active) {
      setBusy(true);
      setError('');
      try {
        await updateReturnQueueEntry(pending._id, { action: 'done' });
        setPending(null);
        setOpen(false);
      } catch (pressError) {
        fail(pressError);
      } finally {
        setBusy(false);
      }
      return;
    }
    setOpen((current) => !current);
  };

  const confirmDay = () => {
    const dueAt = dueAtFromDateInput(day);
    if (!dueAt) return;
    remember({ dueAt, cadence: null });
  };

  return (
    <div className={`remind-word ${className}`.trim()}>
      <button
        type="button"
        className={`source-decision source-decision--remind${active ? ' is-active' : ''}`}
        aria-pressed={active}
        aria-expanded={open}
        title={active ? 'Remind me. Press to let the morning go.' : REMIND_WORD}
        disabled={busy}
        onClick={press}
      >
        {busy ? 'Saving…' : REMIND_WORD}
      </button>
      {open && !active ? (
        <div className="remind-strip" role="group" aria-label="When to ask this back">
          {remindPresets().map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="remind-strip__choice"
              disabled={busy}
              onClick={() => remember({ dueAt: preset.dueAt, cadence: preset.cadence })}
            >
              {preset.label}
            </button>
          ))}
          <label className="remind-strip__day">
            <span>A day</span>
            <input
              type="date"
              value={day}
              disabled={busy}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
          {day ? (
            <button
              type="button"
              className="remind-strip__choice"
              disabled={busy}
              onClick={confirmDay}
            >
              Confirm
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <span className="source-decision__error" role="alert">{error}</span> : null}
    </div>
  );
};

export default RemindWord;
