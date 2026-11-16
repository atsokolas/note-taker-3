import React, { useRef, useState, useEffect } from 'react';
import WorkIcon from './WorkIcon';
import './work-actions.css';

export default function WorkInlineRename({ value, label, onSave, onCancel, busy = false }) {
  const [name, setName] = useState(value);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <form className="work-inline-rename" onSubmit={event => { event.preventDefault(); if (!busy && name.trim()) onSave(name.trim()); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }
  }}>
    <div><input ref={input} aria-label={label} value={name} disabled={busy} onChange={event => setName(event.target.value)} /><button type="submit" aria-label="Save name" disabled={busy || !name.trim()}><WorkIcon name="check" /></button><button type="button" aria-label="Cancel rename" disabled={busy} onClick={onCancel}><WorkIcon name="close" /></button></div>
    <small>Enter to save · Esc to cancel</small>
  </form>;
}
