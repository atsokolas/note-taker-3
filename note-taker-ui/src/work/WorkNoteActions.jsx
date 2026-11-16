import React from 'react';
import WorkMenu from './WorkMenu';
import { noteTitle } from './workSession';

export default function WorkNoteActions({ note, onRename, onOpen, onTrash, label }) {
  return <WorkMenu label={label || `Actions for ${noteTitle(note)}`} icon="more">
    <button onClick={() => onRename(note.clientId)}>Rename note</button>
    {onOpen ? <button onClick={() => onOpen(note.clientId)}>Edit note</button> : null}
    <button className="work-delete-note" onClick={() => onTrash(note.clientId)}>Delete note</button>
  </WorkMenu>;
}
