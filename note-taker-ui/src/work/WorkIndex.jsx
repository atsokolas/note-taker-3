import React, { useState } from 'react';
import { matchesQuery, noteTitle } from './workSession';
import { dayInZone, displayDay, projectItem, writtenDay } from './workPlannerModel';
import WorkIcon from './WorkIcon';

export default function WorkIndex({ drag, view, folder, folders, notes, items, query, onOpen, onItem, onNew, onFolderMenu }) {
  const [tab, setTab] = useState('notes');
  const title = view === 'folder' ? folder?.name || 'Unavailable folder' : view === 'archive' ? 'Archive' : view === 'inbox' ? 'Inbox' : 'Your Work notes';
  const folderId = note => note.folder?._id || note.folder || '';
  const inScope = note => view === 'folder' ? folderId(note) === folder?._id : view === 'inbox' ? !folderId(note) : view === 'archive' ? folders.some(item => item._id === folderId(note) && item.archivedAt) : !folders.some(item => item._id === folderId(note) && item.archivedAt);
  const visible = notes.filter(inScope).filter(note => matchesQuery(note, query)).sort((a, b) => writtenDay(b).localeCompare(writtenDay(a)));
  const tasks = items.filter(item => inScope(item) && matchesQuery(item, query)).map(projectItem);
  const notesCount = n => `${n} ${n === 1 ? 'note' : 'notes'}`;
  const sense = view === 'inbox' ? (visible.length ? `${notesCount(visible.length)} waiting to be filed. Drag one onto a folder, or file it from the note.` : 'Inbox is clear.')
    : view === 'folder' ? (visible.length ? `${notesCount(visible.length)}, the latest written ${displayDay(writtenDay(visible[0]))}.` : 'Nothing here yet. Drag a note onto this folder in the rail.')
    : `${notesCount(visible.length)}.`;
  return <section className="work-index">{view === 'archive' ? <nav aria-label="Archived folders">{folders.filter(item => item.archivedAt).map(item => <button key={item._id} onClick={() => onFolderMenu(item)}>{item.name} · Restore or open</button>)}</nav> : null}<header><h1 className="work-page-title">{title}</h1><p className="work-page-sense">{sense}</p>{folder?.archivedAt ? <p>This folder is set aside. Its writing, links and planned work are kept.</p> : null}<div className="work-index-tabs"><button aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>Notes</button><button aria-pressed={tab === 'tasks'} onClick={() => setTab('tasks')}>Tasks &amp; appointments</button>{folder ? <button onClick={() => onFolderMenu(folder)}>Manage folder</button> : null}</div></header>
    {tab === 'notes' ? <>{visible.map((note, index) => <React.Fragment key={note.clientId}>{!index || writtenDay(visible[index - 1]) !== writtenDay(note) ? <h3>{displayDay(writtenDay(note)) || 'Earlier writing'}</h3> : null}<button className="work-index-note" {...drag(note)} onClick={() => onOpen(note.clientId)}><WorkIcon name="file" /><span>{noteTitle(note)}</span>{['folder', 'inbox'].includes(view) ? null : <small>{folders.find(item => item._id === folderId(note))?.name || 'Inbox'}</small>}</button></React.Fragment>)}</> : <>{tasks.map(item => <button className="work-index-note" key={item.id} onClick={() => onItem(item)}><span>{item.title || 'Day margin'}</span><small>{item.completed ? `Completed ${displayDay(dayInZone(item.completedAt, item.completedTimeZone))}` : item.plannedOn ? displayDay(item.plannedOn) : 'Not yet on a day'}</small></button>)}{!tasks.length ? <p>No outstanding work filed here.</p> : null}{!folder?.archivedAt ? <button onClick={() => onNew({})}>Add a task or appointment</button> : null}</>}
  </section>;
}
