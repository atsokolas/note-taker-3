import React, { useLayoutEffect, useRef, useState } from 'react';
import WorkItemSource from './WorkItemSource';
import { dayInZone, displayDay, shiftDay, writtenDay } from './workPlannerModel';
import { noteTitle } from './workSession';

const stillApplies = (item, receipt) => {
  if (!receipt || receipt.phase !== 'saved') return Boolean(receipt);
  if (receipt.kind === 'waiting') return item.list === 'waiting' && item.waitingOn === receipt.owner;
  return Boolean(receipt.operation) && (receipt.kind === 'done' ? item.completion : item.plan)?.operationId === receipt.operation;
};

export default function WorkWeekClose({ week, today, timeZone, items, notes, session, onAction, onSort, onOpen }) {
  const monday = shiftDay(week, 7);
  const [open, setOpen] = useState(false);
  const [receipts, setReceipts] = useState({});
  const list = useRef(null);
  const inFlight = useRef(false);
  const focusAfter = useRef(null);
  const rows = items.flatMap(item => {
    const receipt = stillApplies(item, receipts[item.clientId]) ? receipts[item.clientId] : null;
    const eligible = item.title?.trim() && !item.completed && item.list !== 'waiting' && item.list !== 'someday'
      && (!item.plannedOn || item.plannedOn <= today) && (!writtenDay(item) || writtenDay(item) <= today);
    return eligible || receipt ? [{ item, receipt }] : [];
  }).sort((a, b) => writtenDay(b.item).localeCompare(writtenDay(a.item)) || a.item.clientId.localeCompare(b.item.clientId));
  const left = rows.filter(({ receipt }) => receipt?.phase !== 'saved').length;
  const filed = rows.length - left;
  const busy = rows.some(({ receipt }) => ['saving', 'retrying'].includes(receipt?.phase));
  const carried = items.filter(item => !item.completed && !item.pending && !item.plan?.pending && item.plannedOn === monday
    && item.plan?.actionAt && dayInZone(item.plan.actionAt, timeZone) >= week);

  const update = (id, receipt) => setReceipts(current => ({ ...current, [id]: receipt }));

  useLayoutEffect(() => {
    if (!focusAfter.current) return;
    const { id, undo, retry } = focusAfter.current;
    focusAfter.current = null;
    const elements = [...(list.current?.children || [])];
    const index = elements.findIndex(row => row.dataset.itemId === id);
    if (index < 0) return;
    const row = elements[index];
    const candidates = undo || retry ? [row] : [...elements.slice(index + 1), ...elements.slice(0, index)];
    const next = candidates.map(element => element.querySelector('[data-review-action]:not([inert] *)')).find(Boolean)
      || row.querySelector('[data-review-receipt]');
    next?.focus({ preventScroll: true });
    next?.scrollIntoView?.({ block: 'nearest' });
  }, [receipts]);

  const decide = async (item, receipt, event) => {
    if (inFlight.current) return;
    const id = item.clientId;
    const trigger = document.activeElement;
    const heldFocus = event.currentTarget.closest('li')?.contains(trigger);
    let decision = receipt;
    inFlight.current = true;
    update(id, { ...decision, phase: decision.phase === 'failed' ? 'retrying' : 'saving' });
    try {
      let saved;
      if (decision.kind === 'waiting' && !decision.phase) {
        saved = await onSort(id, { list: 'waiting', sortedOn: today, waitingOn: decision.owner });
      } else {
        if (decision.phase !== 'failed' || !decision.operation) {
          const values = decision.undo ? { type: 'undo', undoOf: decision.operation }
            : decision.kind === 'done' ? { type: 'complete' } : { type: 'plan', plannedOn: monday };
          const operation = onAction(id, values);
          if (!operation) {
            update(id, decision.undo ? { ...decision, undo: false, phase: 'saved' } : null);
            return;
          }
          if (!decision.undo) decision = { ...decision, operation };
        }
        saved = await session.flush(id);
      }
      if (heldFocus && document.activeElement === trigger) focusAfter.current = { id, undo: saved && decision.undo, retry: !saved };
      update(id, saved && decision.undo ? null : { ...decision, phase: saved ? 'saved' : 'failed' });
    } catch {
      if (heldFocus && document.activeElement === trigger) focusAfter.current = { id, retry: true };
      update(id, { ...decision, phase: 'failed' });
    } finally {
      inFlight.current = false;
    }
  };

  const source = item => {
    const note = notes.find(record => [record._id, record.clientId].includes(item.noteId));
    return item.origin ? <WorkItemSource origin={item.origin} />
      : note ? <button type="button" className="work-week-close__source" onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null;
  };

  return (
    <details className="work-weekly-review work-week-close" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Close the week{left ? ` · ${left} to review` : ''}</summary>
      {open ? <>
        {rows.length ? <ul ref={list}>{rows.map(({ item, receipt }) => {
          const retrying = receipt?.phase === 'retrying';
          const saving = receipt?.phase === 'saving' || retrying;
          const failed = receipt?.phase === 'failed';
          const saved = receipt?.phase === 'saved';
          const showReceipt = saved || failed || retrying || receipt?.undo;
          const message = saving ? 'Saving…' : failed ? 'Sync interrupted.'
            : receipt?.kind === 'done' ? 'Closed'
              : receipt?.kind === 'waiting' ? `Waiting on ${receipt.owner}` : `Planned for ${displayDay(monday)}`;
          return (
            <li key={item.clientId} data-item-id={item.clientId}>
              <h3>{item.title}</h3>
              {source(item)}
              <div className="work-week-close__decision">
                <form inert={showReceipt ? true : undefined} onSubmit={event => {
                  event.preventDefault();
                  const owner = event.currentTarget.elements.owner.value.trim();
                  if (owner) decide(item, { kind: 'waiting', owner }, event);
                }}>
                  <button type="button" data-review-action aria-disabled={busy} onClick={event => decide(item, { kind: 'plan' }, event)}>
                    {saving && receipt.kind === 'plan' ? 'Saving…' : 'Plan for Monday'}
                  </button>
                  <button type="button" aria-disabled={busy} onClick={event => decide(item, { kind: 'done' }, event)}>
                    {saving && receipt.kind === 'done' ? 'Saving…' : 'Close item'}
                  </button>
                  {onSort ? <details><summary>Waiting on someone</summary>
                    <input name="owner" aria-label={`Person for ${item.title}`} maxLength={80} required />
                    <button aria-disabled={busy}>{saving && receipt.kind === 'waiting' ? 'Saving…' : 'Keep with this person'}</button>
                  </details> : null}
                </form>
                <div className="work-week-close__receipt">
                  <span role="status" className={showReceipt ? undefined : 'sr-only'} tabIndex={saved && !receipt.operation ? -1 : undefined}
                    data-review-receipt={showReceipt && !failed && !receipt.operation ? '' : undefined}>{receipt ? message : ''}</span>
                  {failed || retrying ? <button type="button" data-review-action aria-disabled={busy}
                    onClick={event => decide(item, receipt, event)}>Retry sync</button> : null}
                  {showReceipt && !failed && !retrying && receipt.operation ? <button type="button" aria-disabled={busy} data-review-receipt
                    onClick={event => decide(item, { ...receipt, undo: true }, event)}>Undo</button> : null}
                </div>
              </div>
            </li>
          );
        })}</ul> : !carried.length ? <p>Nothing needs a decision.</p> : null}
        {carried.length ? <section aria-label="Monday starts here"><h3>Monday starts here</h3><ul>{carried.map(item => (
          <li key={item.id}>{item.title}{' '}{source(item)}</li>
        ))}</ul></section> : null}
        {filed > 0 && left === 0 ? <p className="work-week-close__colophon">That’s the week. {filed} {filed === 1 ? 'decision' : 'decisions'} filed.</p> : null}
      </> : null}
    </details>
  );
}
