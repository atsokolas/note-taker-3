import React from 'react';
import { WorkTaskRow } from './WorkPlanItem';
import { noteTitle } from './workSession';
import { displayDay, writtenDay } from './workPlannerModel';
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
  const { planned, carried } = dayTasks(items, notes, day, today);
  const row = (item, aside = null) => <WorkTaskRow key={item.id} item={item} today={today} folders={folders} onAction={onAction} onEdit={onEdit} aside={aside} />;
  const label = day === today ? 'Today’s to-dos' : `${displayDay(day, { weekday: 'long' })}’s to-dos`;
  return <details className="work-day-tasks" open>
    <summary>{label}<span> ({planned.filter(item => !item.completed).length})</span></summary>
    <div className="work-day-lines"><section className="work-priorities" aria-label={label}>{planned.map(item => row(item))}</section>
      <form className="work-plan-new" onSubmit={event => { event.preventDefault(); const line = event.currentTarget.elements.plan; if (line.value.trim()) onPlan(line.value); else onNew({ plannedOn: day }); line.value = ''; }}><input name="plan" aria-label="Add a line" placeholder="Add a line" title="Try ‘IC meeting thu 2pm’, ‘@Sam the deck’ or ‘someday’. Enter on an empty line opens the full form." /></form>
    </div>
    {carried.length ? <details className="work-earlier" open><summary>From earlier <span>({carried.length})</span></summary><section aria-label="Carried from earlier">{carried.map(item => {
      const note = item.noteId && notes.find(value => [value._id, value.clientId].includes(item.noteId));
      return row(item, <span className="work-carried"><time>{displayDay(item.plannedOn || writtenDay(note), { weekday: 'short', day: 'numeric', month: 'short' })}</time>{note ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null}<button onClick={() => onAction(item.clientId, { type: 'plan', plannedOn: day })}>Move to {day === today ? 'today' : displayDay(day, { weekday: 'long' })}</button></span>);
    })}</section></details> : null}
  </details>;
}
