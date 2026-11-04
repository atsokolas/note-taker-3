import React from 'react';
import { displayDay, validDay } from './workPlannerModel';

// A saved receipt, rather than live metadata: later edits never change where this began.
export default function WorkItemSource({ origin, quote = false }) {
  if (!origin) return null;
  const linked = origin.noteId && !origin.noteId.startsWith('local-');
  const label = origin.notebookName ? `From ${origin.notebookName}${validDay(origin.day) ? ` · ${displayDay(origin.day, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}` : 'Source pending sync';
  const target = `/work?${new URLSearchParams({ note: origin.noteId, ...(origin.blockId ? { block: origin.blockId } : {}) })}`;
  return <span className="work-item-source">{linked ? <a href={target} title={`Open ${origin.noteTitle || 'source note'}`}>{label}</a> : <span>{label} · source link after sync</span>}{quote ? <q className="work-source-quote">{origin.quote}</q> : null}</span>;
}
