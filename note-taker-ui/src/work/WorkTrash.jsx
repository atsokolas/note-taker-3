import React from 'react';
import { noteTitle, noteDate, noteWords } from './workSession';

export default function WorkTrash({ notes, session, onRestore }) {
  return <section className="work-trash" aria-label="Trash">
    <h1>Trash</h1><p>Notes stay here until you restore them. Their linked to-dos are kept.</p>
    {notes.length ? <ul>{notes.map(note => {
      const other = session.conflict(note.clientId);
      return <li key={note.clientId}><div>
        <h2>{noteTitle(note)}</h2><small>{noteDate(note)}</small><p>{noteWords(note).slice(0, 200)}</p>
        <span role="status">{session.status(note.clientId)}</span>
        {other ? <section className="work-conflict" role="alert">
          <h3>This note changed elsewhere</h3><p>Both versions are kept.</p>
          <details><summary>See the other version</summary><p>{noteWords(other)}</p></details>
          <button onClick={() => session.useServer(note.clientId)}>Use the other version</button>
          <button onClick={() => onRestore(session.saveAsNew(note.clientId))}>Keep mine as a restored copy</button>
        </section> : null}
      </div><button disabled={Boolean(other)} onClick={() => onRestore(note.clientId)}>Restore {noteTitle(note)}</button></li>;
    })}</ul> : <p>No notes in Trash.</p>}
  </section>;
}
