import React, { useEffect, useRef, useState } from 'react';
import {
  createReturnQueueEntry,
  listReturnQueue,
  updateReturnQueueEntry
} from '../api/returnQueue';
import { dueAtFromDateInput, pendingRemindOf, remindPresets } from '../pages/kairosModel';
import {
  clockCap,
  pressPosition,
  stripOptions,
  switchPositions
} from '../pages/placementSwitchModel';
import '../styles/placement-switch.css';

/**
 * The switch: one instrument for one fact.
 *
 * Where a piece sits is a single mutually-exclusive fact with three values,
 * and it used to be told by three separate controls — `Later`, `Set aside`,
 * and a `Remind me` that lived beside them pretending to be their sibling.
 * Three words read as three opinions; the reader had to work out that turning
 * one on turned another off, and that promising a morning was a different
 * question from where the thing sat.
 *
 * One capsule, three positions, and a cap on the end that appears only when
 * something is parked. Park-and-promise is now one gesture, which is why
 * `Remind me` no longer exists: you were never reminding yourself about a
 * piece that was already at home.
 *
 * Keep stays outside. A vow is not a position.
 */

const PlacementSwitch = ({
  articleId = '',
  placement = 'stream',
  folderName = '',
  asFeed = false,
  compact = false,
  onChange,
  now = Date.now()
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [day, setDay] = useState('');
  const stripRef = useRef(null);
  const id = String(articleId || '').trim();

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    Promise.resolve(listReturnQueue({ filter: 'all', itemType: 'article', itemId: id }))
      .then((entries) => { if (!cancelled) setPending(pendingRemindOf(entries, id)); })
      .catch(() => { if (!cancelled) setPending(null); });
    return () => { cancelled = true; };
  }, [id]);

  const positions = switchPositions({ placement, folderName, asFeed });
  const cap = clockCap({
    placement,
    dueAt: pending?.dueAt || null,
    recurring: Boolean(pending?.cadence),
    now
  });

  const fail = (pressError) => {
    // The fill slides back and says the same thing Keep says.
    setError(pressError?.response?.data?.error || 'That did not save.');
  };

  const slideTo = async (position) => {
    if (busy || !onChange) return;
    setBusy(true);
    setError('');
    try {
      await onChange(pressPosition({ placement, pressed: position }));
    } catch (pressError) {
      fail(pressError);
    } finally {
      setBusy(false);
    }
  };

  /* Long-press parks it and opens the strip: one gesture for the reader who
     already knows they want a morning as well as a place. */
  const holding = useRef(null);
  const startHold = (position) => {
    holding.current = window.setTimeout(async () => {
      holding.current = null;
      await slideTo(position);
      setOpen(true);
    }, 420);
  };
  const endHold = () => {
    if (holding.current) window.clearTimeout(holding.current);
    holding.current = null;
  };

  const promise = async ({ dueAt, cadence = null }) => {
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

  const clearPromise = async () => {
    if (busy || !pending?._id) { setOpen(false); return; }
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
  };

  const choose = async (option) => {
    if (option.id === 'no-clock') return clearPromise();
    if (option.id === 'a-date') return undefined;
    /* "Just remind me — leave it where it is" sends the piece home and keeps
       the morning: a nudge that moves nothing is a real thing to want. */
    if (option.inPlace) {
      await slideTo('stream');
      return promise({ dueAt: remindPresets(new Date(now))[1].dueAt });
    }
    return promise({ dueAt: option.dueAt, cadence: option.cadence });
  };

  return (
    <div className={`placement-switch${compact ? ' is-compact' : ''}`}>
      <div
        className="placement-switch__capsule"
        role="radiogroup"
        aria-label="Where this sits"
      >
        {positions.map(({ position, label, active }) => (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={active}
            className={`placement-switch__position${active ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => slideTo(position)}
            onPointerDown={() => startHold(position)}
            onPointerUp={endHold}
            onPointerLeave={endHold}
          >
            {label}
          </button>
        ))}
        {/* The cap exists only while something is parked, and carries the only
            gold on the control: a promise that has actually been made. */}
        {cap ? (
          <button
            type="button"
            className={`placement-switch__cap${cap.promised ? ' is-promised' : ''}`}
            aria-expanded={open}
            aria-label={cap.day ? `Return ${cap.day}` : 'Set a morning'}
            disabled={busy}
            onClick={() => setOpen(current => !current)}
          >
            {cap.day || '—'}
          </button>
        ) : null}
      </div>

      {open && cap ? (
        <ul className="placement-switch__strip" ref={stripRef} aria-label="When to bring it back">
          {stripOptions(remindPresets(new Date(now))).map(option => (
            <li key={option.id}>
              {option.id === 'a-date' ? (
                <span className="placement-switch__date">
                  <input
                    type="date"
                    aria-label="A date"
                    value={day}
                    onChange={(event) => setDay(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy || !day}
                    onClick={() => promise({ dueAt: dueAtFromDateInput(day) })}
                  >
                    Set
                  </button>
                </span>
              ) : (
                <button type="button" disabled={busy} onClick={() => choose(option)}>
                  {option.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <span className="placement-switch__error" role="alert">{error}</span> : null}
    </div>
  );
};

export default PlacementSwitch;
