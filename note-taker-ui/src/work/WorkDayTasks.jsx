import React, { useContext, useRef, useState } from 'react';
import { WorkTaskAssignment, WorkTaskRow } from './WorkPlanItem';
import { displayDay, writtenDay } from './workPlannerModel';
import WorkIcon from './WorkIcon';
import { listOf } from './workOutstanding';

export function dayTasks(items, notes, day, today) {
  const tasks = items.filter(item => ['task', 'question'].includes(item.kind));
  const dated = tasks.filter(item => item.plannedOn === day);
  const priorities = dated.filter(item => item.priority && !item.completed).sort((a, b) => a.priority - b.priority).slice(0, 3);
  const noteOf = item => item.noteId && notes.find(note => [note._id, note.clientId].includes(item.noteId));
  return {
    planned: [...priorities, ...dated.filter(item => !priorities.includes(item))],
    carried: tasks.filter(item => !item.completed && listOf(item, notes, today) !== 'someday' && (item.plannedOn || writtenDay(noteOf(item)) || day) < day)
  };
}

export default function WorkDayTasks({ day, today, items, notes, folders, onAction, onEdit, onOpen, onPlan, onNew }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const trigger = useRef(null);
  const close = (restoreFocus = true) => { setAdding(false); if (restoreFocus) window.requestAnimationFrame(() => trigger.current?.focus()); };
  const submit = event => {
    event.preventDefault();
    if (submitting.current) return;
    const text = event.currentTarget.elements.plan.value;
    const failed = failure => { setError(failure?.message || 'That did not save. Your line is still here.'); };
    const finish = result => { if (result === false) failed(); else close(Boolean(text.trim())); };
    setError('');
    try {
      const result = text.trim() ? onPlan(text) : onNew({ plannedOn: day });
      if (result?.then) {
        submitting.current = true; setSaving(true);
        Promise.resolve(result).then(finish, failed).finally(() => { submitting.current = false; setSaving(false); });
      } else finish(result);
    } catch (failure) { failed(failure); }
  };
  // A to-do linked to a weekly priority is already listed under it, so Earlier leaves it out.
  const linked = new Set((useContext(WorkTaskAssignment)?.priorities || []).flatMap(priority => priority.taskIds));
  const { planned, carried: unplaced } = dayTasks(items, notes, day, today), carried = unplaced.filter(item => !linked.has(item.id));
  const row = (item, aside = null) => <WorkTaskRow key={item.id} item={item} today={today} folders={folders} notes={notes} onOpen={onOpen} onAction={onAction} onEdit={onEdit} aside={aside} actions={day !== today && item.plannedOn !== day ? <button onClick={() => onAction(item.clientId, { type: 'plan', plannedOn: day })}>Move to {displayDay(day, { weekday: 'long' })}</button> : null} />;
  const label = day === today ? 'Today’s to-dos' : `${displayDay(day, { weekday: 'long' })}’s to-dos`;
  return <details className="work-day-tasks" open>
    <summary>{label} <span>{planned.filter(item => !item.completed).length}</span></summary>
    {adding ? <form className="work-plan-new work-rail-composer" onSubmit={submit}><input autoFocus disabled={saving} name="plan" aria-label="Add a line" placeholder="What needs doing?" title="Try ‘IC meeting thu 2pm’, ‘@Sam the deck’ or ‘someday’. Enter on an empty line opens the full form." /><div><button disabled={saving}>{saving ? 'Adding…' : 'Add'}</button><button disabled={saving} type="button" onClick={event => { const title = event.currentTarget.form.elements.plan.value; onNew({ plannedOn: day, ...(title ? { title } : {}) }); close(false); }}>More details</button><button disabled={saving} type="button" onClick={() => close()}>Cancel</button></div>{error ? <p role="alert">{error}</p> : null}</form> : <button ref={trigger} className="work-add-day-task" onClick={() => { setError(''); setAdding(true); }}><WorkIcon name="plus" />Add to-do</button>}
    <div className="work-day-lines"><section className="work-priorities" aria-label={label}>{planned.filter(item => !item.completed).map(item => row(item))}</section></div>
    {carried.length ? <details className="work-earlier"><summary>Earlier <span>{carried.length}</span></summary><section aria-label="Carried from earlier">{carried.map(item => {
      const note = item.noteId && notes.find(value => [value._id, value.clientId].includes(item.noteId));
      return row(item, <span className="work-carried"><time>{displayDay(item.plannedOn || writtenDay(note))}</time></span>);
    })}</section></details> : null}
    {planned.some(item => item.completed) ? <details className="work-done-today"><summary>Done today <span>{planned.filter(item => item.completed).length}</span></summary>{planned.filter(item => item.completed).map(item => row(item))}</details> : null}
  </details>;
}
