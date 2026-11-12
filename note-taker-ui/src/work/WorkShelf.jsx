import React from 'react';
import WorkIcon from './WorkIcon';
import WorkHill, { hillPhrase } from './WorkHill';
import { matchesQuery, noteTitle } from './workSession';
import { displayDay, writtenDay } from './workPlannerModel';

// Two pages look across everything, then projects, then notes. A note is listed once, in its folder;
// its project shows on the project page and on the note's place line.
export default function WorkShelf({ needs, projects, dragging, drag, onDropNote, notes, folders, place, current, todayCount, view, query, onQuery, onScope, onOpen, onCapture, onNewFolder, onFolderMenu, timeZone, onTimeZone, loading, error, onRetry, onClose, onCollapse }) {
  const [over, setOver] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});
  const [sections, setSections] = React.useState({});
  const railId = React.useId();
  const arriving = dragging && notes.find(note => note.clientId === dragging);
  const folderId = note => note.folder?._id || note.folder || '';
  const written = note => `${writtenDay(note)} ${note.capturedAt || note.createdAt || ''}`;
  const newest = list => list.sort((a, b) => written(b).localeCompare(written(a)));
  const leaf = note => <button className="work-shelf-note" {...drag(note)} aria-current={current(note) ? 'page' : undefined} onClick={() => onOpen(note.clientId)}><span>{noteTitle(note)}</span><time className="work-sr-only">{displayDay(writtenDay(note), { day: 'numeric', month: 'short' })}</time></button>;
  const inbox = newest(notes.filter(note => !folderId(note)));
  const placeRow = (id, name, contents, onName, menu, kind = 'folder', nested = []) => {
    const key = `${kind}:${id}`, childrenId = `${railId}-${key}`;
    const active = kind === 'project' ? view === 'project' && place === id : place === id;
    const open = Boolean(query || over === key || (expanded[key] ?? (active || contents.some(current) || nested.some(child => child.reveal))));
    const folds = kind === 'folder' || nested.length > 0;
    return <div className="work-place" key={key}>
      <div className="work-place-row" aria-current={active && !notes.some(current) ? 'page' : undefined} data-drop={over === key ? true : undefined} onDragOver={event => { if (!dragging || kind === 'project') return; event.preventDefault(); setOver(key); }} onDragLeave={() => setOver(null)} onDrop={event => { if (kind === 'project') return; event.preventDefault(); setOver(null); onDropNote(event.dataTransfer.getData('text/plain') || dragging, id); }}>
        {folds ? <button className="work-place-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} aria-expanded={open} aria-controls={childrenId} onClick={() => setExpanded(previous => ({ ...previous, [key]: !open }))}><WorkIcon name="right" /></button> : <span className="work-place-toggle" aria-hidden="true" />}
        <button className="work-place-name" onClick={() => { setExpanded(previous => ({ ...previous, [key]: true })); onName(); }}><span>{name}</span></button>
        {!id && contents.length ? <small aria-label={`${contents.length} unfiled`}>{contents.length}</small> : null}{kind === 'project' && id in needs.hills ? <WorkHill width={28} height={10} label={hillPhrase(needs.hills[id])} dots={[{ id, at: needs.hills[id] }]} /> : null}{menu}
      </div>
      {folds ? <div id={childrenId} className="work-place-children" hidden={!open}>
        <ul aria-label={`Notes in ${name}`} className="work-place-notes">
          {arriving && over === key ? <li className="work-shelf-note is-arriving"><span>{noteTitle(arriving)}</span></li> : null}
          {contents.filter(note => matchesQuery(note, query)).map(note => <li key={note.clientId}>{leaf(note)}</li>)}
        </ul>
        {nested.length ? <ul className="work-place-branches" aria-label={`Places in ${name}`}>{nested.map(child => <li key={child.id}>{child.element}</li>)}</ul> : null}
      </div> : null}
    </div>;
  };
  const places = (records, kind) => {
    const seen = new Set(), parent = record => record.parentFolderId?._id || record.parentFolderId || '';
    const branch = record => {
      if (seen.has(record._id)) return null;
      seen.add(record._id);
      const nested = records.filter(child => parent(child) === record._id).map(branch).filter(Boolean);
      const contents = kind === 'project' ? [] : newest(notes.filter(note => folderId(note) === record._id));
      return { id: record._id, reveal: place === record._id || contents.some(current) || nested.some(child => child.reveal), element: placeRow(record._id, record.name, contents, () => onScope(kind, record._id), kind === 'folder' ? <button className="work-place-menu" aria-label={`Manage folder ${record.name}`} onClick={() => onFolderMenu(record)}><WorkIcon name="more" /></button> : null, kind, nested) };
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
    const open = Boolean(query || (sections[key] ?? true)), id = `${railId}-section-${key}`;
    return <nav aria-label={label} className="work-shelf-section"><div className="work-section-heading"><button onClick={() => { setSections(previous => ({ ...previous, [key]: true })); onOpenSection(); }} aria-current={view === key && !notes.some(current) ? 'page' : undefined}><span>{title}</span>{count ? <small>{count}</small> : null}</button><button className="work-place-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${title.toLowerCase()}`} aria-expanded={open} aria-controls={id} onClick={() => setSections(previous => ({ ...previous, [key]: !open }))}><WorkIcon name="right" /></button></div><div id={id} hidden={!open}>{children}</div></nav>;
  };
  return <aside className="work-shelf" aria-label="Work notes"><button className="work-mobile-close" onClick={onClose}>Back to writing</button>
    <div className="work-shelf-search-row"><label className="work-shelf-search"><WorkIcon name="search" /><input type="search" aria-label="Search Work notes" placeholder="Search" value={query} onChange={event => onQuery(event.target.value)} /></label><button aria-label="New note" onClick={onCapture}><WorkIcon name="plus" /></button></div>
    <nav aria-label="Work navigation" className="work-primary-nav">
      {[['today', 'Today', todayCount, true], ['needs', 'Needs you', needs.total]].map(([key, name, count, quiet]) => <button key={key} aria-current={view === key && !notes.some(current) ? 'page' : undefined} onClick={() => onScope(key)}><span>{name}</span>{count ? <small className={quiet ? 'work-sr-only' : undefined}>{count}</small> : null}</button>)}
    </nav>
    {section('projects', 'Projects', () => onScope('projects'), activeProjects, places(visibleProjects, 'project'), 'Projects')}
    {section('notes', 'Notes', () => onScope('notes'), null, <>{placeRow('', 'Inbox', inbox, () => onScope('inbox', ''))}{places(folders.filter(item => !item.archivedAt), 'folder')}<button className="work-add-folder" onClick={onNewFolder}><WorkIcon name="plus" /><span>New folder</span></button></>, 'Work folders')}
    {loading ? <p role="status">Opening Work notes…</p> : error ? <div role="alert"><p>{error}</p><button onClick={onRetry}>Retry</button></div> : null}
    <div className="work-shelf-foot">{archived.length ? <button onClick={() => onScope('archive')}>Archive</button> : null}<button onClick={onTimeZone} aria-label={`Day timezone: ${timeZone}`}>{timeZone.split('/').pop().replace(/_/g, ' ')} time</button><button aria-label="Collapse Work navigation" onClick={onCollapse}><WorkIcon name="previous" /></button></div>
  </aside>;
}
