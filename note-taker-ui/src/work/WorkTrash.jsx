import React from 'react';
import { noteTitle, noteDate, noteWords } from './workSession';

const recoveryDate = date => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date));
const erasureDeadline = date => new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'long' }).format(new Date(date));
export default function WorkTrash({ notes, projects = [], session, onRestore, onRestoreProject, busy = false }) {
  const batches = new Set(projects.map(project => project.deleted.batchId));
  const individualNotes = notes.filter(note => !batches.has(note.deletionBatchId));
  return <section className="work-trash" aria-label="Deleted">
    <h1>Deleted</h1><p>Projects deleted with automatic erasure are permanently removed after their shown deadline. Separately deleted notes and older deletions are not automatically erased.</p>
    {projects.length ? <section aria-label="Deleted projects"><h2>Projects</h2><ul>{projects.map(project => <li key={project._id}><div><h3>{project.name}</h3><p>Deleted {recoveryDate(project.deleted.deletedAt)}</p>{project.deleted.erasureBlocked === 'membership_changed' ? <p>Automatic erasure paused: project membership changed. Restore and review again.</p> : project.deleted.autoErase === true ? <p>Permanently erased on or after <time dateTime={project.deleted.expiresAt}>{erasureDeadline(project.deleted.expiresAt)}</time>. This cannot be undone. Restore before this deadline to cancel erasure. After the deadline, restoration is only possible if erasure has not started.</p> : <p>No automatic erasure is scheduled for this deletion.</p>}<small>Restore this project and the notes and tasks deleted with it. Previously deleted notes stay deleted.</small></div><button disabled={busy} onClick={() => onRestoreProject(project)}>Restore {project.name}</button></li>)}</ul></section> : null}
    {individualNotes.length ? <h2>Notes</h2> : null}
    {individualNotes.length ? <ul>{individualNotes.map(note => {
      const other = session.conflict(note.clientId);
      const deletedProject = projects.find(project => project._id === (note.project?._id || note.project));
      return <li key={note.clientId}><div>
        <h2>{noteTitle(note)}</h2><small>{noteDate(note)} · Deleted {recoveryDate(note.trashedAt)}</small><p>{noteWords(note).slice(0, 200)}</p>
        <span role="status">{session.status(note.clientId)}</span>{deletedProject ? <p>Restore {deletedProject.name} first, then restore this previously deleted note.</p> : null}
        {other ? <section className="work-conflict" role="alert">
          <h3>{other.erasedAt ? 'The server copy was permanently erased' : 'This note changed elsewhere'}</h3><p>{other.erasedAt ? 'Your unsaved device draft remains here. Keeping a restored copy uploads it as a new note.' : 'Both versions are kept.'}</p>
          {!other.erasedAt ? <details><summary>See the other version</summary><p>{noteWords(other)}</p></details> : null}
          <button onClick={() => session.useServer(note.clientId)}>{other.erasedAt ? 'Discard device draft' : 'Use the other version'}</button>
          <button onClick={() => onRestore(session.saveAsNew(note.clientId))}>Keep mine as a restored copy</button>
        </section> : null}
      </div><button disabled={Boolean(other || deletedProject)} onClick={() => onRestore(note.clientId)}>Restore {noteTitle(note)}</button></li>;
    })}</ul> : <p>{projects.length ? 'No separately deleted notes.' : 'Nothing in Deleted.'}</p>}
  </section>;
}
