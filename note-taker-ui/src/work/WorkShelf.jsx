import React from 'react';
import WorkIcon from './WorkIcon';
import { matchesQuery, noteTitle } from './workSession';
import { displayDay, writtenDay } from './workPlannerModel';

// Folder and project membership are independent; a note can appear in both places.
export default function WorkShelf({ lists, projects, reviewed, dragging, drag, onDropNote, notes, folders, place, current, day, view, query, onQuery, onScope, onOpen, onCapture, onNewFolder, onFolderMenu, timeZone, onTimeZone, loading, error, onRetry, onClose }) {
  // While a note is dragged, the place under it opens and shows the note arriving.
  const [over, setOver] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});
  const railId = React.useId();
  const arriving = dragging && notes.find(note => note.clientId === dragging);
  const folderId = note => note.folder?._id || note.folder || '';
  const written = note => `${writtenDay(note)} ${note.capturedAt || note.createdAt || ''}`;
  const newest = list => list.sort((a, b) => written(b).localeCompare(written(a)));
  const leaf = note => <button className="work-shelf-note" key={note.clientId} {...drag(note)} aria-current={current(note) ? 'page' : undefined} onClick={() => onOpen(note.clientId)}><span>{noteTitle(note)}</span><time>{displayDay(writtenDay(note), { day: 'numeric', month: 'short' })}</time></button>;
  const inbox = newest(notes.filter(note => !folderId(note)));
  const placeRow = (id, name, contents, onName, menu, kind = 'folder') => {
    const key = `${kind}:${id}`, childrenId = `${railId}-${key}`;
    const active = kind === 'project' ? view === 'project' && place === id : place === id;
    const open = Boolean(query || over === key || (expanded[key] ?? (active || contents.some(current))));
    const toggle = () => setExpanded(previous => ({ ...previous, [key]: !open }));
    return <div className="work-place" key={key}>
      <div className="work-place-row" aria-current={active && !notes.some(current) ? 'page' : undefined} data-drop={over === key ? true : undefined} onDragOver={event => { if (!dragging || kind === 'project') return; event.preventDefault(); setOver(key); }} onDragLeave={() => setOver(null)} onDrop={event => { if (kind === 'project') return; event.preventDefault(); setOver(null); onDropNote(event.dataTransfer.getData('text/plain') || dragging, id); }}>
        <button onClick={() => { setExpanded(previous => ({ ...previous, [key]: true })); onName(); }}>{name}</button>
        {!id && contents.length ? <small aria-label={`${contents.length} unfiled`}>{contents.length}</small> : null}
        <button className="work-place-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} aria-expanded={open} aria-controls={childrenId} onClick={toggle}><WorkIcon name={open ? 'down' : 'right'} /></button>{menu}
      </div>
      <ul id={childrenId} aria-label={`Notes in ${name}`} className="work-place-notes" hidden={!open}>
        {arriving && over === key ? <li className="work-shelf-note is-arriving"><span>{noteTitle(arriving)}</span></li> : null}
        {contents.filter(note => matchesQuery(note, query)).map(note => <li key={note.clientId}>{leaf(note)}</li>)}
      </ul>
    </div>;
  };
  const archived = folders.filter(item => item.archivedAt);
  const visibleProjects = projects.filter(item => !item.archivedAt);
  const activeProjects = visibleProjects.filter(item => !item.pausedAt).length;
  return <aside className="work-shelf" aria-label="Work notes"><button className="work-mobile-close" onClick={onClose}>Back to writing</button>
    <button className="work-shelf-new" onClick={onCapture}>New note</button>
    <input type="search" aria-label="Search Work notes" placeholder="Find a phrase" value={query} onChange={event => onQuery(event.target.value)} />
    <button className="work-shelf-today" aria-current={view === 'today' && !notes.some(current) ? 'page' : undefined} onClick={() => onScope('today')}>Today<time>{displayDay(day, { weekday: 'short', day: 'numeric' })}</time></button>
    <nav aria-label="Work folders" className="work-places">
      {placeRow('', 'Inbox', inbox, () => onScope('inbox', ''))}
      {folders.filter(item => !item.archivedAt).map(item => placeRow(item._id, item.name, newest(notes.filter(note => folderId(note) === item._id)), () => onScope('folder', item._id), <button aria-label={`Manage folder ${item.name}`} onClick={() => onFolderMenu(item)}><WorkIcon name="more" /></button>))}
      <button className="work-add-folder" onClick={onNewFolder}>New folder</button>
    </nav>
    <nav aria-label="Projects" className="work-lists work-places"><button aria-current={view === 'projects' && !notes.some(current) ? 'page' : undefined} onClick={() => onScope('projects')}>Projects{activeProjects ? <small>{activeProjects}</small> : null}</button>{visibleProjects.map(item => placeRow(item._id, item.name, newest(notes.filter(note => (note.project?._id || note.project) === item._id)), () => onScope('project', item._id), null, 'project'))}</nav>
    <nav aria-label="Outstanding" className="work-lists">{[['outstanding', 'Outstanding', lists.total || ''], ['waiting', 'Waiting on', lists.waiting.length || ''], ['someday', 'Someday', lists.someday.length || ''], ['review', 'Weekly review', reviewed]].map(([key, name, aside]) => <button key={key} aria-current={view === key && !notes.some(current) ? 'page' : undefined} onClick={() => onScope(key)}>{name}{aside !== '' ? <small>{aside}</small> : null}</button>)}</nav>
    {loading ? <p role="status">Opening Work notes…</p> : error ? <div role="alert"><p>{error}</p><button onClick={onRetry}>Retry</button></div> : null}
    <div className="work-shelf-foot"><button onClick={() => onScope('notes')}>All notes</button>{archived.length ? <button onClick={() => onScope('archive')}>Archive</button> : null}<button aria-label={`Day timezone: ${timeZone}`} onClick={onTimeZone}>{timeZone.split('/').pop().replace(/_/g, ' ')} time</button></div>
  </aside>;
}
