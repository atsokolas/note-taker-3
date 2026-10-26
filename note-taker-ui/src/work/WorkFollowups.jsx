import React, { useEffect, useRef, useState } from 'react';
import WorkIcon from './WorkIcon';
import { dayInZone, displayDay, projectItem } from './workPlannerModel';

export default function WorkFollowups({ note, tomorrow, session, onAdd, onEdit, onAction, onConflict, children }) {
  const [receipts, setReceipts] = useState({});
  const undoWindows = useRef(new Map());
  const [showAll, setShowAll] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick(value => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  const items = session.items().filter(item => ['task', 'question'].includes(item.workItem?.kind) && [note._id, note.clientId].filter(Boolean).includes(item.workItem.noteId)).map(projectItem).sort((a, b) => String(a.capturedAt || a.createdAt || a.id).localeCompare(String(b.capturedAt || b.createdAt || b.id)));
  const completed = items.filter(item => item.completed).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const active = items.filter(item => !item.completed || receipts[item.id]);
  const change = (item, type) => {
    const id = onAction(item.clientId, { type });
    if (type === 'complete' && id) setReceipts(current => ({ ...current, [item.id]: id }));
    else setReceipts(current => { const next = { ...current }; delete next[item.id]; return next; });
  };
  const completedRecord = item => {
    const event = item.completion, latest = item.history.at(-1), until = undoWindows.current.get(event.operationId)?.until ?? new Date(event.recordedAt || event.actionAt).getTime() + 8000;
    const recent = latest?.operationId === event.operationId && Date.now() < until;
    const holdUndo = () => { if (recent && until !== Infinity) undoWindows.current.set(event.operationId, { until: Infinity, remaining: until - Date.now() }); };
    const releaseUndo = () => { const held = undoWindows.current.get(event.operationId); if (held?.until === Infinity) undoWindows.current.set(event.operationId, { until: Date.now() + held.remaining }); };
    return <div className="work-completed-row" key={item.id} onMouseEnter={holdUndo} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) releaseUndo(); }} onFocus={holdUndo} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) releaseUndo(); }}><label className="work-completed-check"><input type="checkbox" checked aria-label={`Reopen ${item.title}`} onChange={() => change(item, 'reopen')} /></label><span className="work-done-title">{item.title}</span><time dateTime={event.actionAt} title={`${displayDay(dayInZone(event.actionAt, event.timeZone))} · ${event.timeZone}`}>{item.pending ? 'Pending sync' : (dayInZone(event.actionAt, event.timeZone) === dayInZone(new Date(), event.timeZone) ? 'Today, ' : '') + new Intl.DateTimeFormat('en', { timeZone: event.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(event.actionAt))}</time><button onClick={() => recent ? onAction(item.clientId, { type: 'undo', undoOf: event.operationId }) : change(item, 'reopen')}>{recent ? 'Undo' : 'Reopen'}</button><button className="work-history-link" onClick={() => onEdit(item, 'history')}>History</button></div>;
  };
  const records = showAll ? completed : completed.slice(0, 2);
  return <>
    {completed.length ? <section className="work-completed" aria-label="Completed follow-ups">{records.map((item, index) => {
      const date = dayInZone(item.completedAt, item.completedTimeZone);
      const previous = index ? dayInZone(records[index - 1].completedAt, records[index - 1].completedTimeZone) : '';
      return <React.Fragment key={item.id}>{date !== previous ? <h3><WorkIcon name="down" />Completed · {displayDay(date, { day: 'numeric', month: 'short', year: 'numeric' })}</h3> : null}{completedRecord(item)}</React.Fragment>;
    })}{completed.length > 2 ? <button onClick={() => setShowAll(value => !value)}>{showAll ? 'Show recent' : `Show all ${completed.length}`}</button> : null}</section> : null}
    {children}
    <section className="work-followups" aria-label="Follow-ups & open questions" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setReceipts({}); }}>
      <h2>Follow-ups &amp; open questions <small>{items.filter(item => !item.completed).length ? `${items.filter(item => !item.completed).length} open` : 'Nothing outstanding'}</small></h2>
      {active.map(item => item.completed ? <div className="work-item-receipt" key={item.id}>Completed above <button onClick={() => onAction(item.clientId, { type: 'undo', undoOf: receipts[item.id] })}>Undo</button></div> : <div className={`work-followup-row ${item.pending ? 'is-pending' : ''}`} key={item.id}>
        <label><input type="checkbox" checked={false} disabled={Boolean(session.conflict(item.clientId))} onChange={() => change(item, 'complete')} /><span>{item.title}{item.kind === 'question' ? <small className="work-question-kind">Question</small> : null}</span></label>
        {session.conflict(item.clientId) ? <button onClick={() => onConflict(item)}>Review both versions</button> : <button className="work-plan-link" onClick={() => item.plannedOn ? onEdit(item) : onAction(item.clientId, { type: 'plan', plannedOn: tomorrow })}>{item.plannedOn ? `Planned ${displayDay(item.plannedOn, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Plan for tomorrow'}</button>}
        <button className="work-followup-edit" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button>
        {item.pending || session.pending().some(([id]) => id === item.clientId) ? <small className="work-item-save">{session.status(item.clientId)}</small> : null}
      </div>)}
      <button className="work-add-followup" onClick={onAdd}><WorkIcon name="plus" />Add a follow-up or question</button>
    </section>
  </>;
}
