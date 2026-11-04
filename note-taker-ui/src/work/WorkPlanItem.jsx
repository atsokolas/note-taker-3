import React from 'react';
import WorkIcon from './WorkIcon';
import { displayDay } from './workPlannerModel';

export function WorkTaskRow({ item, today, folders = [], onAction, onEdit, aside = null }) {
  const archived = folders.find(folder => folder._id === (item.folder?._id || item.folder))?.archivedAt;
  return <div className={`work-planner-task ${item.completed ? 'is-done' : ''}`}><label><input type="checkbox" checked={item.completed} onChange={() => onAction(item.clientId, { type: item.completed ? 'reopen' : 'complete' })} /><span>{item.title}{archived ? <small>Archived folder</small> : null}{item.previousPlannedOn && item.previousPlannedOn !== item.plannedOn ? <small>From {displayDay(item.previousPlannedOn, { weekday: 'short', day: 'numeric' })}</small> : null}{item.dueOn && item.dueOn < today && !item.completed ? <small>Due {displayDay(item.dueOn)} · overdue</small> : null}{item.pending ? <small>Pending sync</small> : null}</span></label>{aside}<button aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}>{item.conflicted ? 'Review both versions' : <WorkIcon name="more" />}</button></div>;
}

export function WorkAppointmentRow({ item, folders = [], projects = [], onStart, onEdit, status = '' }) {
  const folder = folders.find(record => record._id === (item.folder?._id || item.folder));
  const project = projects.find(record => record._id === (item.project?._id || item.project));
  const context = [project?.name, folder?.name].filter(Boolean).join(' · ');
  return <div className="work-appointment"><button onClick={() => onStart(item)}><time>{item.startTime || 'Time not set'}{item.endTime ? `–${item.endTime}` : ''}</time><span><strong>{item.title}</strong>{status}{context ? <small>{context}{folder?.archivedAt ? ' · Archived folder' : ''}</small> : null}{!item.noteId ? <small className="work-start-note">Start the note</small> : null}</span></button><button aria-label={`Edit appointment ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button></div>;
}
