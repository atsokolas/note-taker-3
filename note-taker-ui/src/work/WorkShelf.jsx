import React, { useEffect, useState } from 'react';
import WorkIcon from './WorkIcon';
import { noteDate, noteTitle } from './workSession';
import { writtenDay } from './workPlannerModel';

export default function WorkShelf({ notes, folders, selected, day, view, folder, query, onQuery, onScope, onOpen, onCapture, onNewFolder, onFolderMenu, loading, error, onRetry, onClose }) {
  const [expanded, setExpanded] = useState(new Set());
  const selectedNote = notes.find(note => note.clientId === selected || note._id === selected);
  const selectedFolder = selectedNote?.folder?._id || selectedNote?.folder;
  useEffect(() => { const id = selectedFolder || folders.find(item => !item.archivedAt)?._id; if (id) setExpanded(current => new Set([...current, id])); }, [selectedFolder, folders]);
  const folderId = note => note.folder?._id || note.folder || '';
  const matches = note => !query || `${noteTitle(note)} ${note.content || ''}`.toLowerCase().includes(query.toLowerCase());
  const leaf = note => <button className="work-shelf-note" key={note.clientId} aria-current={note.clientId === selected || note._id === selected ? 'page' : undefined} onClick={() => onOpen(note.clientId)}><WorkIcon name="file" /><span>{noteTitle(note)}<small>{noteDate(note)}{note.localVersion ? ' · Local version' : ''}</small></span></button>;
  const activeFolders = folders.filter(item => !item.archivedAt), archived = folders.filter(item => item.archivedAt);
  return <aside className="work-shelf" aria-label="Work notes"><button className="work-mobile-close" onClick={onClose}>Back to writing</button>
    <nav aria-label="Work places" className="work-places">
      <button aria-current={view === 'today' ? 'page' : undefined} onClick={() => onScope('today')}><WorkIcon name="calendar" />Today</button>
      <div className="work-place-row"><button aria-current={view === 'notes' ? 'page' : undefined} onClick={() => onScope('notes')}><WorkIcon name="file" />Notes</button><button aria-label="New note" onClick={onCapture}><WorkIcon name="plus" /></button></div>
      <button aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => onScope('inbox', '')}><WorkIcon name="inbox" />Inbox<span className="work-count">{notes.filter(note => !folderId(note)).length || ''}</span></button>
    </nav>
    <input type="search" aria-label="Search Work notes" placeholder="Find a phrase…" value={query} onChange={event => onQuery(event.target.value)} />
    <div className="work-folders-heading"><span>Folders</span><button aria-label="New folder" onClick={onNewFolder}><WorkIcon name="plus" /></button></div>
    <nav aria-label="Work folders">{activeFolders.map(item => {
      const contents = notes.filter(note => folderId(note) === item._id);
      const isOpen = expanded.has(item._id) || Boolean(query);
      const dated = contents.filter(note => writtenDay(note) === day || note._id === selectedNote?._id);
      const visible = (query ? contents : dated.length ? dated : contents.slice(0, 1)).filter(matches);
      return <div className="work-folder" key={item._id}>
        <div className="work-folder-row"><button className="work-folder-toggle" aria-label={`${isOpen ? 'Hide' : 'Show'} notes in ${item.name}`} aria-expanded={isOpen} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(item._id)) next.delete(item._id); else next.add(item._id); return next; })}><WorkIcon name={isOpen ? 'down' : 'right'} /></button><button className="work-folder-name" aria-current={view === 'folder' && folder === item._id ? 'page' : undefined} onClick={() => onScope('folder', item._id)}><WorkIcon name="folder" /><span>{item.name}</span><small aria-label={`${contents.length} notes`}>{contents.length}</small></button><button aria-label={`Manage folder ${item.name}`} onClick={() => onFolderMenu(item)}><WorkIcon name="more" /></button></div>
        {isOpen && !(view === 'folder' && !selected) ? <div className="work-folder-notes">{visible.map(leaf)}</div> : null}
      </div>;
    })}</nav>
    {query ? <div className="work-search-inbox">{notes.filter(note => !folderId(note) && matches(note)).map(leaf)}</div> : null}
    <button className="work-add-folder" onClick={onNewFolder}><WorkIcon name="plus" />Folder</button>
    {loading ? <p role="status">Opening Work notes…</p> : error ? <div role="alert"><p>{error}</p><button onClick={onRetry}>Retry</button></div> : null}
    <div className="work-shelf-foot"><button onClick={() => onScope('notes')}><WorkIcon name="right" />All Work</button>{archived.length ? <button onClick={() => onScope('archive')}>Archive <span className="work-count">{archived.length}</span></button> : null}</div>
  </aside>;
}
