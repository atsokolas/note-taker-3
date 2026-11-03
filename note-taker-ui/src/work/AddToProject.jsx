import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { operationId } from './workDrafts';

// "Add to project" on an article, wiki page or book. The link is written on the Work side only,
// so the thing itself never changes and never learns it is part of Work.
export default function AddToProject({ kind, id, title, className = '' }) {
  const [projects, setProjects] = useState(null);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [status, setStatus] = useState('');
  const ref = useRef(null);
  const open = projects !== null;
  useEffect(() => {
    if (!open) return undefined;
    const away = event => { if (!ref.current?.contains(event.target)) setProjects(null); };
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away);
  }, [open]);
  if (!id) return null;
  const has = project => (project.links || []).some(link => link.kind === kind && link.id === String(id));
  const shown = (projects || []).filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  const show = () => { setStatus(''); setQuery(''); setAt(0); api.get('/api/work-notes/folders').then(({ data }) => setProjects(data)).catch(() => setStatus('Projects are unavailable right now.')); };
  const add = async project => {
    setProjects(null);
    if (has(project)) { setStatus(`Already in ${project.name}.`); return; }
    try {
      await api.put(`/api/work-notes/folders/${project._id}`, { links: [...(project.links || []), { kind, id: String(id), title: title || '' }], expectedRevision: project.revision || 0, operationId: operationId() });
      setStatus(`Added to ${project.name}.`);
    } catch (error) { setStatus(error?.response?.data?.error || 'That did not save.'); }
  };
  const key = event => {
    if (event.key === 'Escape') { event.preventDefault(); setProjects(null); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setAt(value => Math.max(0, Math.min(shown.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter' && shown[at]) { event.preventDefault(); add(shown[at]); }
  };
  return <span className="add-to-project" ref={ref}>
    <button type="button" className={className || 'add-to-project-trigger'} aria-expanded={open} onClick={() => open ? setProjects(null) : show()}>Add to project</button>
    {status ? <span role="status" className="add-to-project-status">{status}</span> : null}
    {open ? <span className="add-to-project-menu" role="dialog" aria-label="Add to project">
      <input autoFocus aria-label="Find a project" placeholder="Find a project" value={query} onKeyDown={key} onChange={event => { setQuery(event.target.value); setAt(0); }} />
      {shown.map((project, index) => <button type="button" key={project._id} aria-current={index === at || undefined} onMouseEnter={() => setAt(index)} onClick={() => add(project)}>{project.name}{has(project) ? <small>Added</small> : null}</button>)}
      {!shown.length ? <small className="add-to-project-empty">{projects.length ? 'No project by that name.' : 'No projects yet. Start one in Work.'}</small> : null}
    </span> : null}
  </span>;
}
