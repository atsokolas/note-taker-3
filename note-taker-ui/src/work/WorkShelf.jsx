import React from 'react';
import WorkIcon from './WorkIcon';
import { matchesQuery, noteTitle } from './workSession';
import { displayDay, writtenDay } from './workPlannerModel';

// Folder and project membership are independent; the rail derives both trees from the records.
export default function WorkShelf({ lists, projects, reviewed, dragging, drag, onDropNote, notes, folders, place, current, day, todayCount, view, query, onQuery, onScope, onOpen, onCapture, onNewFolder, onFolderMenu, timeZone, onTimeZone, loading, error, onRetry, onClose }) {
  const [over, setOver] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});
  const [sections, setSections] = React.useState({ projects: true, notes: true });
  const railId = React.useId();
  const arriving = dragging && notes.find(note => note.clientId === dragging);
  const folderId = note => note.folder?._id || note.folder || '';
  const written = note => `${writtenDay(note)} ${note.capturedAt || note.createdAt || ''}`;
  const newest = list => list.sort((a, b) => written(b).localeCompare(written(a)));
  const icon = (name, tone = name) => <WorkIcon name={name} className={`work-nav-icon is-${tone}`} />;
  const leaf = note => <button className="work-shelf-note" {...drag(note)} aria-current={current(note) ? 'page' : undefined} onClick={() => onOpen(note.clientId)}>{icon('file', 'notes')}<span>{noteTitle(note)}</span><time>{displayDay(writtenDay(note), { day: 'numeric', month: 'short' })}</time></button>;
  const inbox = newest(notes.filter(note => !folderId(note)));
  const placeRow = (id, name, contents, onName, menu, kind = 'folder', nested = []) => {
    const key = `${kind}:${id}`, childrenId = `${railId}-${key}`;
    const active = kind === 'project' ? view === 'project' && place === id : place === id;
    const open = Boolean(query || over === key || (expanded[key] ?? (active || contents.some(current) || nested.some(child => child.reveal))));
    return <div className="work-place" key={key}>
      <div className="work-place-row" aria-current={active && !notes.some(current) ? 'page' : undefined} data-drop={over === key ? true : undefined} onDragOver={event => { if (!dragging || kind === 'project') return; event.preventDefault(); setOver(key); }} onDragLeave={() => setOver(null)} onDrop={event => { if (kind === 'project') return; event.preventDefault(); setOver(null); onDropNote(event.dataTransfer.getData('text/plain') || dragging, id); }}>
        <button onClick={() => { setExpanded(previous => ({ ...previous, [key]: true })); onName(); }}>{icon(id ? 'folder' : 'inbox', kind === 'project' ? 'projects' : id ? 'folder' : 'notes')}<span>{name}</span></button>
        {!id && contents.length ? <small aria-label={`${contents.length} unfiled`}>{contents.length}</small> : null}
        <button className="work-place-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} aria-expanded={open} aria-controls={childrenId} onClick={() => setExpanded(previous => ({ ...previous, [key]: !open }))}><WorkIcon name={open ? 'down' : 'right'} /></button>{menu}
      </div>
      <div id={childrenId} className="work-place-children" hidden={!open}>
        <ul aria-label={`Notes in ${name}`} className="work-place-notes">
          {arriving && over === key ? <li className="work-shelf-note is-arriving"><span>{noteTitle(arriving)}</span></li> : null}
          {contents.filter(note => matchesQuery(note, query)).map(note => <li key={note.clientId}>{leaf(note)}</li>)}
        </ul>
        {nested.length ? <ul className="work-place-branches" aria-label={`Places in ${name}`}>{nested.map(child => <li key={child.id}>{child.element}</li>)}</ul> : null}
      </div>
    </div>;
  };
  const places = (records, kind) => {
    const seen = new Set(), parent = record => record.parentFolderId?._id || record.parentFolderId || '';
    const branch = record => {
      if (seen.has(record._id)) return null;
      seen.add(record._id);
      const nested = records.filter(child => parent(child) === record._id).map(branch).filter(Boolean);
      const contents = newest(notes.filter(note => kind === 'project' ? (note.project?._id || note.project) === record._id : folderId(note) === record._id));
      return { id: record._id, reveal: place === record._id || contents.some(current) || nested.some(child => child.reveal), element: placeRow(record._id, record.name, contents, () => onScope(kind, record._id), kind === 'folder' ? <button aria-label={`Manage folder ${record.name}`} onClick={() => onFolderMenu(record)}><WorkIcon name="more" /></button> : null, kind, nested) };
    };
    const roots = records.filter(record => !records.some(candidate => candidate._id === parent(record))).map(branch).filter(Boolean);
    // Orphaned and cyclic legacy records remain reachable instead of disappearing.
    records.forEach(record => { const root = branch(record); if (root) roots.push(root); });
    return roots.map(root => root.element);
  };
  const archived = folders.filter(item => item.archivedAt);
  const visibleProjects = projects.filter(item => !item.archivedAt);
  const activeProjects = visibleProjects.filter(item => !item.pausedAt).length;
  const section = (key, title, onOpenSection, count, children, label) => {
    const open = Boolean(query || sections[key]), id = `${railId}-section-${key}`;
    return <nav aria-label={label} className="work-shelf-section"><div className="work-section-heading"><button onClick={() => { setSections(previous => ({ ...previous, [key]: true })); onOpenSection(); }} aria-current={view === key && !notes.some(current) ? 'page' : undefined}>{icon(key === 'projects' ? 'briefcase' : 'file', key)}<span>{title}</span>{count ? <small>{count}</small> : null}</button><button className="work-place-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${title.toLowerCase()}`} aria-expanded={open} aria-controls={id} onClick={() => setSections(previous => ({ ...previous, [key]: !open }))}><WorkIcon name={open ? 'down' : 'right'} /></button></div><div id={id} hidden={!open}>{children}</div></nav>;
  };
  return <aside className="work-shelf" aria-label="Work notes"><button className="work-mobile-close" onClick={onClose}>Back to writing</button>
    <div className="work-shelf-heading"><strong>Work notes</strong><button className="work-shelf-new" onClick={onCapture}>New note</button></div>
    <label className="work-shelf-search">{icon('search', 'quiet')}<input type="search" aria-label="Search Work notes" placeholder="Find a phrase" value={query} onChange={event => onQuery(event.target.value)} /></label>
    <label className="work-notebook-filter">Filter by notebook<select aria-label="Filter by notebook" value={view === 'folder' ? place : 'all'} onChange={event => onScope(event.target.value === 'all' ? 'notes' : 'folder', event.target.value)}><option value="all">All notebooks</option>{folders.filter(item => !item.archivedAt).map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
    <nav aria-label="Work navigation" className="work-primary-nav"><button aria-current={view === 'today' && !notes.some(current) ? 'page' : undefined} onClick={() => onScope('today')}>{icon('sun', 'today')}<span>Today</span>{todayCount ? <small>{todayCount}</small> : <time>{displayDay(day, { weekday: 'short', day: 'numeric' })}</time>}</button><button aria-current={view === 'upcoming' && !notes.some(current) ? 'page' : undefined} onClick={() => onScope('upcoming')}>{icon('calendar', 'upcoming')}<span>Upcoming</span></button></nav>
    <nav aria-label="Outstanding" className="work-primary-nav">{[['outstanding', 'Outstanding', 'layers', lists.total || ''], ['waiting', 'Waiting on', 'clock', lists.waiting.length || ''], ['someday', 'Someday', 'archive', lists.someday.length || ''], ['review', 'Weekly review', 'review', reviewed]].map(([key, name, glyph, aside]) => <button key={key} aria-current={view === key && !notes.some(current) ? 'page' : undefined} onClick={() => onScope(key)}>{icon(glyph, key)}<span>{name}</span>{aside !== '' ? <small>{aside}</small> : null}</button>)}</nav>
    {section('projects', 'Projects', () => onScope('projects'), activeProjects, places(visibleProjects, 'project'), 'Projects')}
    {section('notes', 'Notes', () => onScope('notes'), null, <>{placeRow('', 'Inbox', inbox, () => onScope('inbox', ''))}{places(folders.filter(item => !item.archivedAt), 'folder')}<button className="work-add-folder" onClick={onNewFolder}>New folder</button></>, 'Work folders')}
    {loading ? <p role="status">Opening Work notes…</p> : error ? <div role="alert"><p>{error}</p><button onClick={onRetry}>Retry</button></div> : null}
    <div className="work-shelf-foot"><button onClick={() => onScope('notes')}>All notes</button>{archived.length ? <button onClick={() => onScope('archive')}>Archive</button> : null}<button aria-label={`Day timezone: ${timeZone}`} onClick={onTimeZone}>{timeZone.split('/').pop().replace(/_/g, ' ')} time</button></div>
  </aside>;
}
