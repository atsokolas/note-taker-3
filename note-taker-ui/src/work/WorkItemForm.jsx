import React, { useState } from 'react';
import WorkItemSource from './WorkItemSource';
import { noteTitle } from './workSession';
import { KIND_LABEL, displayDay, weekDays } from './workPlannerModel';

// Each control looks like what it does: a kind switch, a week of days, three priority slots and the place an item lives.
export default function WorkItemForm({ item, defaults = {}, today, notes, folders, projects = [], occupiedPriorities, busy, onSave, onClose }) {
  const [value, setValue] = useState(() => ({ kind: item?.kind || defaults.kind || 'task', title: item?.title ?? defaults.title ?? '', noteId: defaults.noteId ?? item?.noteId ?? '', folder: item?.folder?._id || item?.folder || defaults.folder || '', project: item?.project?._id || item?.project || defaults.project || '', plannedOn: defaults.plannedOn ?? item?.plannedOn ?? '', dueOn: item?.dueOn || '', priority: item?.priority || 0, startTime: item?.startTime || '09:00', endTime: item?.endTime || '09:30', withText: item?.withText || '' }));
  const [createNote, setCreateNote] = useState(!item);
  const change = (key, next) => setValue(current => ({ ...current, [key]: next }));
  const appointment = value.kind === 'appointment';
  const taken = value.plannedOn ? occupiedPriorities(value.plannedOn, item?.id).filter(place => item?.priority !== place) : [];
  const used = new Set([...taken, Number(value.priority)].filter(Boolean)).size;

  return <form className="work-item-form" onSubmit={event => { event.preventDefault(); if (!busy && value.title.trim()) onSave({ ...value, priority: Number(value.priority), createNote: appointment && !value.noteId && createNote }); }}>
    <input className="work-item-title" autoFocus aria-label="Item" placeholder="What needs doing" value={value.title} onChange={event => change('title', event.target.value)} required />
    {item ? null : <div className="work-segments" role="radiogroup" aria-label="Kind">{Object.entries(KIND_LABEL).map(([kind, label]) => <label key={kind}><input type="radio" name="kind" checked={value.kind === kind} onChange={() => change('kind', kind)} />{label}</label>)}</div>}

    <fieldset><legend>Planned</legend>
      <div className="work-day-strip">{weekDays(value.plannedOn || today).map(day => <button type="button" key={day} aria-pressed={value.plannedOn === day} aria-current={day === today ? 'date' : undefined} aria-label={displayDay(day)} onClick={() => change('plannedOn', value.plannedOn === day ? '' : day)}><small>{displayDay(day, { weekday: 'short' })}</small>{Number(day.slice(8))}</button>)}</div>
      <div className="work-item-asides"><label>Another day<input aria-label="Planned day" type="date" value={value.plannedOn} onChange={event => change('plannedOn', event.target.value)} /></label>
        {appointment ? null : <details open={Boolean(value.dueOn)}><summary>Due date</summary><input aria-label="Due date" type="date" value={value.dueOn} onChange={event => change('dueOn', event.target.value)} /></details>}</div>
    </fieldset>

    {appointment ? <fieldset><legend>When</legend><div className="work-form-pair"><label>Starts<input aria-label="Starts" type="time" value={value.startTime} onChange={event => change('startTime', event.target.value)} required /></label><label>Ends<input aria-label="Ends" type="time" value={value.endTime} onChange={event => change('endTime', event.target.value)} required /></label></div><label>With<input aria-label="Appointment with" value={value.withText} onChange={event => change('withText', event.target.value)} /></label></fieldset>
      : <fieldset><legend>Priority{value.plannedOn ? ` on ${displayDay(value.plannedOn, { weekday: 'short', day: 'numeric' })}` : ''}</legend>
        <div className="work-priority-slots" role="radiogroup" aria-label="Priority">{[0, 1, 2, 3].map(place => <label key={place} className={taken.includes(place) ? 'is-taken' : ''}><input type="radio" name="priority" checked={Number(value.priority) === place} disabled={place > 0 && (!value.plannedOn || taken.includes(place))} onChange={() => change('priority', place)} /><span>{place || 'None'}</span></label>)}
          <small>{value.plannedOn ? `${used} of 3 used` : 'Plan a day to rank it'}</small></div></fieldset>}

    <fieldset><legend>Lives in</legend>
      <div className="work-item-path">
        <select aria-label="Item folder" value={value.folder} onChange={event => change('folder', event.target.value)}><option value="">Work inbox</option>{folders.filter(folder => !folder.archivedAt || folder._id === value.folder).map(folder => <option value={folder._id} key={folder._id}>{folder.name}{folder.archivedAt ? ' · archived' : ''}</option>)}</select>
        {projects.length ? <><span aria-hidden="true">›</span><select aria-label="Item project" value={value.project} onChange={event => change('project', event.target.value)}><option value="">No project</option>{projects.filter(project => !project.archivedAt || project._id === value.project).map(project => <option value={project._id} key={project._id}>{project.name}{project.archivedAt ? ' · done' : ''}</option>)}</select></> : null}
        <span aria-hidden="true">›</span>
        <select disabled={Boolean(item?.origin)} aria-label="Link to note" value={value.noteId} onChange={event => change('noteId', event.target.value)}><option value="">No linked note</option>{notes.map(note => <option value={note._id || note.clientId} key={note.clientId}>{noteTitle(note)}{note.trashedAt ? ' (in Trash)' : ''}</option>)}</select>
      </div>
      <WorkItemSource origin={item?.origin} quote />
      {appointment && !value.noteId ? <label className="work-check-label"><input type="checkbox" checked={createNote} onChange={event => setCreateNote(event.target.checked)} />Create a dated meeting note</label> : null}
    </fieldset>

    <div className="work-actions"><button disabled={busy || !value.title.trim()} type="submit">{busy ? 'Saving…' : 'Save'}</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form>;
}
