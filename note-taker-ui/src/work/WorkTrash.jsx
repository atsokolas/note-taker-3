import React from 'react';
import { noteTitle, noteDate, noteWords } from './workSession';

const recoveryDate = date => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date));
export default function WorkTrash({ notes, projects = [], session, onRestore, onRestoreProject, busy = false }) {
  const batches = new Set(projects.map(project => project.deleted.batchId));
  const individualNotes = notes.filter(note => !batches.has(note.deletionBatchId));
  return <section className="work-trash" aria-label="Deleted">
    <h1>Deleted</h1><p>Kept for at least 14 days. Nothing is permanently erased automatically.</p>
    {projects.length ? <section aria-label="Deleted projects"><h2>Projects</h2><ul>{projects.map(project => <li key={project._id}><div><h3>{project.name}</h3><p>Deleted {recoveryDate(project.deleted.deletedAt)} · Recovery protected through {recoveryDate(project.deleted.expiresAt)}</p><small>Restore this project and the notes and tasks deleted with it. Previously deleted notes stay deleted.</small></div><button disabled={busy} onClick={() => onRestoreProject(project)}>Restore {project.name}</button></li>)}</ul></section> : null}
    {individualNotes.length ? <h2>Notes</h2> : null}
    {individualNotes.length ? <ul>{individualNotes.map(note => {
      const other = session.conflict(note.clientId);
      const deletedProject = projects.find(project => project._id === (note.project?._id || note.project));
      return <li key={note.clientId}><div>
        <h2>{noteTitle(note)}</h2><small>{noteDate(note)} · Deleted {recoveryDate(note.trashedAt)}</small><p>{noteWords(note).slice(0, 200)}</p>
        <span role="status">{session.status(note.clientId)}</span>{deletedProject ? <p>Restore {deletedProject.name} first, then restore this previously deleted note.</p> : null}
        {other ? <section className="work-conflict" role="alert">
          <h3>This note changed elsewhere</h3><p>Both versions are kept.</p>
          <details><summary>See the other version</summary><p>{noteWords(other)}</p></details>
          <button onClick={() => session.useServer(note.clientId)}>Use the other version</button>
          <button onClick={() => onRestore(session.saveAsNew(note.clientId))}>Keep mine as a restored copy</button>
        </section> : null}
      </div><button disabled={Boolean(other || deletedProject)} onClick={() => onRestore(note.clientId)}>Restore {noteTitle(note)}</button></li>;
    })}</ul> : <p>{projects.length ? 'No separately deleted notes.' : 'Nothing in Deleted.'}</p>}
  </section>;
}
