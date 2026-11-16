import React from 'react';
import WorkIcon from './WorkIcon';
import WorkMenu from './WorkMenu';

export default function WorkProjectActions({ record, onOpen, onAction }) {
  return <WorkMenu label={`Actions for project ${record.name}`} icon="more" className="work-project-menu" actions>
    {onOpen ? <button onClick={() => onOpen(record._id)}><WorkIcon name="open" />Open project</button> : null}
    <button onClick={() => onAction(record, 'rename')}><WorkIcon name="edit" />Rename</button>
    <button onClick={() => onAction(record, 'description')}><WorkIcon name="file" />Edit description</button>
    <hr />
    <button className="work-destructive" onClick={() => onAction(record, 'delete')}><WorkIcon name="trash" />Delete project</button>
  </WorkMenu>;
}
