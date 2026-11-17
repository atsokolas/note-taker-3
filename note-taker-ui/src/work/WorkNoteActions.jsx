import React from 'react';
import WorkMenu from './WorkMenu';
import WorkIcon from './WorkIcon';
import { noteTitle } from './workSession';

export default function WorkNoteActions({ note, onRename, onOpen, onTrash, label }) {
  return <WorkMenu label={label || `Actions for ${noteTitle(note)}`} icon="more" actions>
    {onOpen ? <button onClick={() => onOpen(note.clientId)}><WorkIcon name="open" />Open note</button> : null}
    <button onClick={() => onRename(note.clientId)}><WorkIcon name="edit" />Rename</button>
    <hr />
    <button className="work-delete-note work-destructive" onClick={() => onTrash(note.clientId)}><WorkIcon name="trash" />Delete note</button>
  </WorkMenu>;
}
