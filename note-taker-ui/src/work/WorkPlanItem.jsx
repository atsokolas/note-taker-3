import React, { createContext, useContext } from 'react';
import WorkMenu from './WorkMenu';
import { noteTitle } from './workSession';
import WorkItemSource from './WorkItemSource';
import WorkIcon from './WorkIcon';
import { taskDragProps, WorkTaskGrip } from './workTaskDrag';
import { displayDay } from './workPlannerModel';

// The week owns linking; every canonical task row offers the same keyboard alternative to dragging.
export const WorkTaskAssignment = createContext(null);
export function WorkTaskRow({ item, today, folders = [], notes = [], onOpen, onAction, onEdit, aside = null, actions = null }) {
  const assignment = useContext(WorkTaskAssignment);
  const folder = folders.find(folder => folder._id === (item.folder?._id || item.folder));
  const note = notes.find(note => item.noteId && [note._id, note.clientId].includes(item.noteId));
  return <div {...taskDragProps(item)} className={`work-planner-task work-rail-task ${item.completed ? 'is-done' : ''}`}>
    <WorkTaskGrip item={item} /><label><input type="checkbox" aria-label={item.title} checked={Boolean(item.completed)} onChange={() => onAction(item.clientId, { type: item.completed ? 'reopen' : 'complete' })} /><span>{item.title}</span></label>
    <div className="work-rail-source">{item.origin ? <WorkItemSource origin={item.origin} /> : note && onOpen ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : folder?.name ? <span>{folder.name}</span> : null}
      {folder?.archivedAt ? <small>Archived folder</small> : null}{item.previousPlannedOn && item.previousPlannedOn !== item.plannedOn ? <small>From {displayDay(item.previousPlannedOn, { weekday: 'short', day: 'numeric' })}</small> : null}
      {item.dueOn ? <small>Due {displayDay(item.dueOn)}{item.dueOn < today && !item.completed ? ' · overdue' : ''}</small> : null}{item.pending ? <small>Pending sync</small> : null}{aside}
    </div>
    <WorkMenu actions label={`Actions for ${item.title}`} icon="more" className="work-task-menu">
      {onEdit ? <button onClick={() => onEdit(item)}>{item.conflicted ? 'Review both versions' : 'Edit to-do'}</button> : null}
      {!item.completed && item.plannedOn !== today ? <button onClick={() => onAction(item.clientId, { type: 'plan', plannedOn: today })}>Move to today</button> : null}
      {assignment ? <label className="work-weekly-assignment">Priority<select aria-label={`Priority for ${item.title}`} value={assignment.priorities.find(priority => priority.taskIds.includes(item._id))?.id || ''} disabled={assignment.disabled || !item._id} onChange={event => assignment.link(item._id, event.target.value)}><option value="">{item._id ? 'No priority' : 'Save task to link it'}</option>{assignment.priorities.map(priority => <option key={priority.id} value={priority.id}>{priority.title}</option>)}</select></label> : null}
      {actions}
    </WorkMenu>
  </div>;
}

export function WorkAppointmentRow({ item, folders = [], projects = [], onStart, onEdit, status = '' }) {
  const folder = folders.find(record => record._id === (item.folder?._id || item.folder));
  const project = projects.find(record => record._id === (item.project?._id || item.project));
  const context = [project?.name, folder?.name].filter(Boolean).join(' · ');
  return <div className="work-appointment"><button onClick={() => onStart(item)}><time>{item.startTime || 'Time not set'}{item.endTime ? `–${item.endTime}` : ''}</time><span><strong>{item.title}</strong>{status}{context ? <small>{context}{folder?.archivedAt ? ' · Archived folder' : ''}</small> : null}{!item.noteId ? <small className="work-start-note">Start the note</small> : null}</span></button><button aria-label={`Edit appointment ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button></div>;
}
