import React from 'react';
import WorkIcon from './WorkIcon';
import { matchesQuery, noteTitle } from './workSession';
import { displayDay, writtenDay } from './workPlannerModel';

// The rail is a contents page: Today, then every place a note can live. Only the place you are in opens.
export default function WorkShelf({ dragging, drag, onDropNote, notes, folders, place, current, day, view, query, onQuery, onScope, onOpen, onCapture, onNewFolder, onFolderMenu, timeZone, onTimeZone, loading, error, onRetry, onClose }) {
  // While a note is dragged, the place under it opens and shows the note arriving.
  const [over, setOver] = React.useState(null);
  const arriving = dragging && notes.find(note => note.clientId === dragging);
  const folderId = note => note.folder?._id || note.folder || '';
  const written = note => `${writtenDay(note)} ${note.capturedAt || note.createdAt || ''}`;
  const newest = list => list.sort((a, b) => written(b).localeCompare(written(a)));
  const leaf = note => <button className="work-shelf-note" key={note.clientId} {...drag(note)} aria-current={current(note) ? 'page' : undefined} onClick={() => onOpen(note.clientId)}><span>{noteTitle(note)}</span><time>{displayDay(writtenDay(note), { day: 'numeric', month: 'short' })}</time></button>;
  const inbox = newest(notes.filter(note => !folderId(note)));
  const placeRow = (id, name, contents, onName, menu) => <div className="work-place" key={id || 'inbox'}>
    <div className="work-place-row" aria-current={place === id && !notes.some(current) ? 'page' : undefined} data-drop={over === id ? true : undefined} onDragOver={event => { if (!dragging) return; event.preventDefault(); setOver(id); }} onDragLeave={() => setOver(null)} onDrop={event => { event.preventDefault(); setOver(null); onDropNote(event.dataTransfer.getData('text/plain') || dragging, id); }}><button onClick={onName}>{name}</button>{id ? null : contents.length ? <small aria-label={`${contents.length} unfiled`}>{contents.length}</small> : null}{menu}</div>
    {place === id || query || over === id ? <div className="work-place-notes">{arriving && over === id ? <span className="work-shelf-note is-arriving"><span>{noteTitle(arriving)}</span></span> : null}{(query ? contents : contents.slice(0, 4)).filter(note => matchesQuery(note, query)).map(leaf)}</div> : null}
  </div>;
  const archived = folders.filter(item => item.archivedAt);
  return <aside className="work-shelf" aria-label="Work notes"><button className="work-mobile-close" onClick={onClose}>Back to writing</button>
    <button className="work-shelf-new" onClick={onCapture}>New note</button>
    <input type="search" aria-label="Search Work notes" placeholder="Find a phrase" value={query} onChange={event => onQuery(event.target.value)} />
    <button className="work-shelf-today" aria-current={view === 'today' && !notes.some(current) ? 'page' : undefined} onClick={() => onScope('today')}>Today<time>{displayDay(day, { weekday: 'short', day: 'numeric' })}</time></button>
    <nav aria-label="Work folders" className="work-places">
      {placeRow('', 'Inbox', inbox, () => onScope('inbox', ''))}
      {folders.filter(item => !item.archivedAt).map(item => placeRow(item._id, item.name, newest(notes.filter(note => folderId(note) === item._id)), () => onScope('folder', item._id), <button aria-label={`Manage folder ${item.name}`} onClick={() => onFolderMenu(item)}><WorkIcon name="more" /></button>))}
      <button className="work-add-folder" onClick={onNewFolder}>New folder</button>
    </nav>
    {loading ? <p role="status">Opening Work notes…</p> : error ? <div role="alert"><p>{error}</p><button onClick={onRetry}>Retry</button></div> : null}
    <div className="work-shelf-foot"><button onClick={() => onScope('notes')}>All notes</button>{archived.length ? <button onClick={() => onScope('archive')}>Archive</button> : null}<button aria-label={`Day timezone: ${timeZone}`} onClick={onTimeZone}>{timeZone.split('/').pop().replace(/_/g, ' ')} time</button></div>
  </aside>;
}
