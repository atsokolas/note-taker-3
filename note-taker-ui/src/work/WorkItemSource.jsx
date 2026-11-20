import React from 'react';
import Amendment from '../components/Amendment';
import { displayDay, validDay } from './workPlannerModel';

// A saved receipt, rather than live metadata: later edits never change where this began.
export default function WorkItemSource({ origin, quote = false }) {
  if (!origin) return null;
  const linked = origin.noteId && !origin.noteId.startsWith('local-');
  const label = origin.notebookName ? `From ${origin.notebookName}${validDay(origin.day) ? ` · ${displayDay(origin.day, { day: 'numeric', month: 'short' })}` : ''}` : 'Link appears once saved';
  const target = `/work?${new URLSearchParams({ note: origin.noteId, ...(origin.blockId ? { block: origin.blockId } : {}), ...(validDay(origin.day) ? { entry: origin.day } : {}) })}`;
  return <span className="work-item-source">{linked ? <a href={target} title={`Open ${origin.noteTitle || 'source note'}`}>{label}</a> : <span>{label}</span>}{quote ? <q className="work-source-quote">{origin.quote}</q> : null}</span>;
}

const normalized = text => String(text || '').replace(/\s+/g, ' ').trim();

export function WorkSourceHistory({ origin, note }) {
  if (!origin?.quote) return null;
  const body = note?.content && new DOMParser().parseFromString(note.content, 'text/html');
  const block = body ? [...body.querySelectorAll('[data-block-id]')].find(node => node.dataset.blockId === origin.blockId) : null;
  const current = normalized(block?.textContent || note?.blocks?.find(node => node.id === origin.blockId)?.text);
  const changed = current && !current.includes(normalized(origin.quote));
  return (
    <section className="work-source-history" aria-label="Source in the note">
      <WorkItemSource origin={origin} />
      {changed ? <Amendment before={origin.quote} after={current} beforeLabel="Original words" afterLabel="Current line" /> : <>
        <blockquote>{origin.quote}</blockquote>
        {!current && origin.blockId ? <p>The current line is unavailable.</p> : null}
      </>}
    </section>
  );
}
