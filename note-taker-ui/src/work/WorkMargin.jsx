import React from 'react';
import { displayDay, writtenDay } from './workPlannerModel';

export default function WorkMargin({ jots, jot, session, onChoose, onChange, onReview, disabled = false }) {
  return <div className="work-margin-writing">
    {jots.length > 1 ? <><p>Another margin was written for this day. Both are kept; choose one to read or edit.</p><nav aria-label="Day margin versions">{jots.map((item, index) => <button key={item.clientId} aria-label={`Margin ${index + 1}`} aria-pressed={item.clientId === jot?.clientId} onClick={() => onChoose(item.clientId)}>Margin {index + 1}<small>{displayDay(writtenDay(item))}</small></button>)}</nav></> : null}
    {disabled ? <p>Restore this folder before starting a day margin.</p> : null}<label>Notes for this day<textarea disabled={disabled} aria-label="Notes for this day" placeholder="A line to hold the day together…" value={jot?.content || ''} onChange={event => onChange(event.target.value)} /></label>
    {jot ? <><p role="status">{session.status(jot.clientId)}</p>{session.conflict(jot.clientId) ? <button onClick={() => onReview(jot)}>Review both versions</button> : <button onClick={() => session.flush(jot.clientId)}>Sync margin</button>}</> : null}
  </div>;
}
