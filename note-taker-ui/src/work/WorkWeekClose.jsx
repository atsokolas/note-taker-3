import React, { useRef, useState } from 'react';
import WorkItemSource from './WorkItemSource';
import { dayInZone, displayDay, shiftDay, writtenDay } from './workPlannerModel';
import { noteTitle } from './workSession';

export default function WorkWeekClose({ week, today, timeZone, items, notes, session, onAction, onSort, onOpen }) {
  const monday = shiftDay(week, 7);
  const eligible = items.filter(item => item.title?.trim() && !item.completed && item.list !== 'waiting' && item.list !== 'someday'
    && (!item.plannedOn || item.plannedOn <= today) && (!writtenDay(item) || writtenDay(item) <= today));
  const carried = items.filter(item => !item.completed && !item.pending && !item.plan?.pending && item.plannedOn === monday
    && item.plan?.actionAt && dayInZone(item.plan.actionAt, timeZone) >= week);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const summary = useRef(null);

  const decide = async (item, decision, owner) => {
    setBusy(item.clientId);
    setReceipt(null);
    try {
      const result = decision === 'waiting'
        ? await onSort(item.clientId, { list: 'waiting', sortedOn: today, waitingOn: owner })
        : onAction(item.clientId, decision === 'done' ? { type: 'complete' } : { type: 'plan', plannedOn: monday });
      if (!result && decision !== 'waiting') return;
      const saved = decision === 'waiting' ? result : await session.flush(item.clientId);
      setReceipt({ id: item.clientId, saved, text: saved
        ? decision === 'done' ? `Closed “${item.title}”.` : decision === 'waiting'
          ? `Waiting on ${owner} for “${item.title}”.` : `“${item.title}” is on ${displayDay(monday)}.`
        : `“${item.title}” is waiting to sync.` });
      requestAnimationFrame(() => summary.current?.focus());
    } finally { setBusy(''); }
  };

  const source = item => {
    const note = notes.find(record => [record._id, record.clientId].includes(item.noteId));
    return item.origin ? <WorkItemSource origin={item.origin} />
      : note ? <button type="button" className="work-week-close__source" onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null;
  };

  return (
    <details className="work-weekly-review work-week-close" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary ref={summary}>Close the week{eligible.length ? ` · ${eligible.length} to review` : ''}</summary>
      {open ? <>
      {eligible.length ? <><p>Choose what carries forward.</p><ul>{eligible.map(item => (
        <li key={item.id}>
          <h3>{item.title}</h3>
          {source(item)}
          <form onSubmit={event => {
            event.preventDefault();
            const owner = event.currentTarget.elements.owner.value.trim();
            if (owner) decide(item, 'waiting', owner);
          }}>
            <button type="button" disabled={Boolean(busy)} onClick={() => decide(item, 'plan')}>Plan {displayDay(monday)}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => decide(item, 'done')}>Close item</button>
            {onSort ? <details><summary>Waiting on someone</summary>
              <input name="owner" aria-label={`Person for ${item.title}`} maxLength={80} required />
              <button disabled={Boolean(busy)}>Keep with this person</button>
            </details> : null}
          </form>
        </li>
      ))}</ul></> : carried.length ? null : <p>Nothing needs a decision.</p>}
      {receipt ? <p role="status">{receipt.text}{!receipt.saved ? <> <button type="button" onClick={async () => {
        if (await session.flush(receipt.id)) setReceipt({ ...receipt, saved: true, text: 'Decision saved.' });
      }}>Retry sync</button></> : null}</p> : null}
      {carried.length ? <section aria-label="Monday starts here"><h3>Monday starts here</h3><ul>{carried.map(item => (
        <li key={item.id}>{item.title}{' '}{source(item)}</li>
      ))}</ul></section> : null}
      </> : null}
    </details>
  );
}
