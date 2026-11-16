import React, { useEffect, useRef, useState } from 'react';
import WorkIcon from './WorkIcon';
import WorkItemSource from './WorkItemSource';
import { operationId, noteTitle } from './workSession';
import { displayDay, shiftDay, weekDays, writtenDay } from './workPlannerModel';
import { assignTask, carryWeek, completionAtWeekEnd, weekRecord } from './workWeeklyModel';
import './work-weekly.css';

const TASK_DRAG = 'application/x-noeis-week-task';
const shortDate = day => displayDay(day, { day: 'numeric', month: 'short' });

export default function WorkWeekly({ session, today, timeZone, items, folders, notes, onAction, onEdit, onNew, onOpen, children, margin }) {
  const currentWeek = weekDays(today)[0];
  const restored = useRef(session.weeklyDraft?.()).current;
  const [week, setWeek] = useState(restored?.week || currentWeek);
  const [saved, setSaved] = useState({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(restored?.pending || null);
  const [message, setMessage] = useState(restored?.pending ? 'Your unsaved plan is ready to retry.' : '');
  const [review, setReview] = useState(false);
  const [newTitle, setNewTitle] = useState(restored?.newTitle || '');
  const [editing, setEditing] = useState(restored?.editing || '');
  const [editTitle, setEditTitle] = useState(restored?.editTitle || '');
  const [dragging, setDragging] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const inFlight = useRef(false), attempted = useRef(new Set()), previousWeek = useRef(currentWeek);
  const records = [...session.weeks()];
  Object.values(saved).forEach(record => {
    const index = records.findIndex(value => value.workItem.plannedOn === record.workItem.plannedOn);
    if (index < 0) records.push(record);
    else if (records[index].revision <= record.revision) records[index] = record;
  });
  const record = weekRecord(records, week), priorities = record?.workItem.priorities || [];
  const past = week < currentWeek, disabled = busy || Boolean(pending) || session.loading() || Boolean(session.error());
  const tasks = items.filter(item => ['task', 'question'].includes(item.kind));
  const active = priorities.filter(priority => past || priority.status === 'active');
  const assigned = new Set(priorities.filter(priority => ['active', 'complete'].includes(priority.status)).flatMap(priority => priority.taskIds));
  const available = tasks.filter(item => !item.completed && !assigned.has(item._id));
  const retain = value => { if (value) setSaved(current => ({ ...current, [value.workItem.plannedOn]: value })); };
  const cache = value => session.setWeeklyDraft?.(value);
  const save = async (values, targetWeek = week, revision = record?.revision ?? null, clearNewTitle = false, automatic = false) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const proposal = { week: targetWeek, priorities: values, revision, clearNewTitle };
    cache({ week, newTitle, editing, editTitle, pending: proposal });
    try {
      const result = await session.saveWeek(targetWeek, values, revision, timeZone);
      if (!result) throw new Error('This plan did not save. Keep this page open and retry.');
      retain(result); setPending(null); setMessage(automatic ? 'Unfinished priorities carried forward. Last week is kept.' : 'Weekly plan saved.'); setEditing(''); setEditTitle(''); if (clearNewTitle) setNewTitle('');
      cache(clearNewTitle || !newTitle.trim() ? null : { week, newTitle });
    } catch (error) {
      // Another tab may have opened this same week first. Its saved plan wins initialization.
      if (automatic && error.current) { retain(error.current); setPending(null); cache(newTitle.trim() ? { week, newTitle } : null); }
      else { const failed = { ...proposal, current: error.current }; setPending(failed); cache({ week, newTitle, editing, editTitle, pending: failed }); setMessage(error.message || 'This plan did not save. Keep this page open and retry.'); }
    } finally { inFlight.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (previousWeek.current !== currentWeek) { setWeek(value => value === previousWeek.current ? currentWeek : value); previousWeek.current = currentWeek; }
  }, [currentWeek]);
  useEffect(() => {
    if (session.loading() || session.error() || inFlight.current || pending || attempted.current.has(currentWeek) || weekRecord(records, currentWeek)) return;
    const prior = records.filter(value => value.workItem.plannedOn < currentWeek).sort((a, b) => b.workItem.plannedOn.localeCompare(a.workItem.plannedOn))[0];
    if (!prior) return;
    attempted.current.add(currentWeek);
    // Save even an empty rollover to stop old priorities resurfacing after a quiet week.
    save(carryWeek(prior, tasks, currentWeek), currentWeek, null, false, true);
  });
  useEffect(() => {
    if (!busy) session.setWeeklyDraft?.(pending || newTitle.trim() || editing ? { week, newTitle, editing, editTitle, pending } : null);
  }, [session, week, newTitle, editing, editTitle, pending, busy]);
  const navigate = next => { if (disabled || newTitle.trim() || editing) { setMessage('Save or cancel your priority edit before changing weeks.'); return; } setWeek(next); setReview(false); setEditing(''); setMessage(''); };
  const changePriority = (id, patch) => save(priorities.map(priority => priority.id === id ? { ...priority, ...patch } : priority), week, record?.revision ?? null);
  const link = (taskId, priorityId, beforeId) => {
    if (editing) { setMessage('Save or cancel the priority title before moving tasks.'); return; }
    if (past || disabled || !tasks.some(item => item._id === taskId) || (priorityId && !priorities.some(priority => priority.id === priorityId && priority.status === 'active'))) return;
    save(assignTask(priorities, taskId, priorityId, beforeId));
  };
  const drop = (event, priorityId, beforeId) => {
    event.preventDefault(); event.stopPropagation();
    const id = event.dataTransfer.getData(TASK_DRAG) || dragging;
    setDragging(''); setDropTarget(''); if (id) link(id, priorityId, beforeId);
  };
  const dragProps = item => ({
    draggable: !disabled && !past && Boolean(item._id),
    onDragStart: event => { if (!item._id) return; event.dataTransfer.setData(TASK_DRAG, item._id); event.dataTransfer.effectAllowed = 'move'; setDragging(item._id); },
    onDragEnd: () => { setDragging(''); setDropTarget(''); }
  });
  const source = item => {
    const note = notes.find(value => [value._id, value.clientId].includes(item.noteId));
    const folder = folders.find(value => value._id === (item.folder?._id || item.folder));
    return item.origin ? <WorkItemSource origin={item.origin} /> : <small className="work-weekly-source">{note ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : folder?.name || 'Work'}{writtenDay(item) ? ` · ${shortDate(writtenDay(item))}` : ''}</small>;
  };
  const taskRow = (id, priority) => {
    const item = tasks.find(value => value._id === id);
    if (!item) return <li className="work-weekly-missing" key={id}>Task unavailable. Its place in this plan is kept.</li>;
    const complete = past ? completionAtWeekEnd(item, week) : item.completed;
    return <li key={id} className={`work-weekly-task ${complete ? 'is-done' : ''} ${dropTarget === id ? 'is-drop-target' : ''}`} {...dragProps(item)} onDragOver={event => { if (dragging) { event.preventDefault(); event.stopPropagation(); setDropTarget(id); } }} onDrop={event => drop(event, priority.id, id)}>
      <label><input type="checkbox" aria-label={item.title} checked={complete} disabled={past || disabled} onChange={() => onAction(item.clientId, { type: complete ? 'reopen' : 'complete' })} /><span>{item.title}</span></label>{source(item)}
      {!past ? <span className="work-weekly-task-actions"><button disabled={disabled} aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button><button disabled={disabled} aria-label={`Remove ${item.title} from priority`} onClick={() => link(id, '')}>Unlink</button></span> : null}
    </li>;
  };
  const describePlan = values => values.map(priority => `${priority.title} (${priority.status})\n${priority.taskIds.map(id => `  • ${tasks.find(item => item._id === id)?.title || 'Unavailable task'}`).join('\n')}`).join('\n\n') || 'No priorities.';
  const reviewRow = priority => <div className="work-weekly-review-row" key={priority.id}><span>{priority.title}<small>{priority.carriedFrom ? `From week of ${shortDate(priority.carriedFrom)}` : priority.status}</small></span><div><button disabled={disabled || Boolean(editing)} aria-label={`Keep ${priority.title}`} onClick={() => changePriority(priority.id, { status: 'active', reviewed: true })}>Keep</button><button disabled={disabled || Boolean(editing)} aria-label={`Defer ${priority.title}`} onClick={() => changePriority(priority.id, { status: 'deferred', reviewed: true })}>Defer a week</button><button disabled={disabled || Boolean(editing)} aria-label={`Drop ${priority.title}`} onClick={() => changePriority(priority.id, { status: 'dropped', reviewed: true })}>Drop from plan</button></div></div>;

  return <section className="work-weekly" aria-label="Weekly priorities">
    <div className="work-weekly-main"><header className="work-weekly-heading"><h1 className="work-page-title">{week === currentWeek ? 'This week' : 'Week of ' + shortDate(week)}</h1><div className="work-weekly-dateline"><p>{displayDay(week, { month: 'long', day: 'numeric' })}–{displayDay(shiftDay(week, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</p><nav aria-label="Priority weeks"><button disabled={disabled} aria-label="Previous priority week" onClick={() => navigate(shiftDay(week, -7))}><WorkIcon name="previous" /></button><button disabled={disabled} onClick={() => navigate(currentWeek)}>This week</button><button disabled={disabled || week >= currentWeek} aria-label="Next priority week" onClick={() => navigate(shiftDay(week, 7))}><WorkIcon name="next" /></button></nav>{!past ? <button disabled={disabled} aria-expanded={review} onClick={() => setReview(value => !value)}>Review rollover</button> : null}</div></header>
      {message ? <div className="work-weekly-receipt" role={pending ? 'alert' : 'status'}><p>{message}</p>{pending ? <><p>Your proposed plan is still on this page. {pending.current ? 'The saved plan changed elsewhere. Review it before replacing it.' : 'Keep this page open until it saves.'}</p>{pending.current ? <><details open><summary>Saved plan</summary><pre>{describePlan(pending.current.workItem.priorities)}</pre></details><details open><summary>Your proposed plan</summary><pre>{describePlan(pending.priorities)}</pre></details><button disabled={busy} onClick={() => { retain(pending.current); setPending(null); setMessage('Using the saved plan.'); }}>Use saved plan</button><button disabled={busy} onClick={() => save(pending.priorities, pending.week, pending.current.revision, pending.clearNewTitle)}>Save my version</button></> : <><button disabled={busy} onClick={() => save(pending.priorities, pending.week, pending.revision, pending.clearNewTitle)}>Retry save</button><button disabled={busy} onClick={() => { setPending(null); setMessage('Unsaved change discarded.'); }}>Discard change</button></>}</> : null}</div> : null}
      {past ? <p className="work-weekly-history">Past weeks keep their plan. Checkboxes show completion by that week’s end.</p> : null}
      {review && !past ? <section className="work-weekly-review" aria-label="Rollover review"><h2>A fresh look at the week</h2><p>Keep what matters. Deferring or dropping a priority never deletes its tasks.</p>{priorities.filter(priority => priority.carriedFrom || priority.status !== 'active').map(reviewRow)}{!priorities.some(priority => priority.carriedFrom || priority.status !== 'active') ? <p>Nothing carried forward to review.</p> : null}<button onClick={() => setReview(false)}>Close review</button></section> : null}
      <ol className="work-weekly-priorities">{active.map((priority, index) => <li key={priority.id}><section aria-label={priority.title} className={`work-weekly-priority ${dropTarget === priority.id ? 'is-drop-target' : ''}`} onDragOver={event => { if (dragging) { event.preventDefault(); setDropTarget(priority.id); } }} onDrop={event => drop(event, priority.id)}>
        <header><h2><span className="work-weekly-number" aria-hidden="true">{index + 1}.</span>{priority.title}</h2>{!past ? <button className="work-weekly-manage" disabled={disabled || Boolean(editing && editing !== priority.id)} aria-label={`Manage ${priority.title}`} aria-expanded={editing === priority.id} onClick={() => { setEditing(editing === priority.id ? '' : priority.id); setEditTitle(priority.title); }}><WorkIcon name="more" /></button> : null}</header>
        {priority.carriedFrom ? <p className="work-weekly-carried">Carried from week of {shortDate(priority.carriedFrom)}{!priority.reviewed && !past ? ' · ready to review' : ''}</p> : null}
        {past && priority.status !== 'active' ? <p className="work-weekly-carried">{priority.status === 'complete' ? 'Completed priority' : priority.status === 'deferred' ? 'Deferred' : 'Dropped from plan'}</p> : null}
        {editing === priority.id ? <form className="work-weekly-edit" onSubmit={event => { event.preventDefault(); const title = event.currentTarget.elements.title.value.trim(); if (title) changePriority(priority.id, { title }); }}><input name="title" aria-label={`Rename ${priority.title}`} value={editTitle} onChange={event => setEditTitle(event.target.value)} maxLength={300} autoFocus /><button disabled={disabled}>Save title</button><button type="button" disabled={disabled} onClick={() => changePriority(priority.id, { status: 'complete', reviewed: true })}>Complete priority</button><button type="button" disabled={disabled} onClick={() => changePriority(priority.id, { status: 'deferred', reviewed: true })}>Defer a week</button><button type="button" disabled={disabled} onClick={() => changePriority(priority.id, { status: 'dropped', reviewed: true })}>Drop from plan</button><button type="button" onClick={() => setEditing('')}>Cancel</button></form> : null}
        <ul>{priority.taskIds.map(id => taskRow(id, priority))}</ul>{!priority.taskIds.length ? <p className="work-weekly-empty">{past ? 'No tasks linked.' : 'Drag a to-do here, or choose this priority from its menu.'}</p> : null}
      </section></li>)}</ol>
      {!active.length ? <p className="work-weekly-empty">{session.loading() ? 'Loading your week…' : past ? 'No plan saved for this week.' : 'What would make this a worthwhile week? Add a priority, then link the work underneath.'}</p> : null}
      {!past ? <form className="work-weekly-add" onSubmit={event => { event.preventDefault(); const title = newTitle.trim(); if (title && !disabled && !editing) save([...priorities, { id: operationId(), title, taskIds: [], status: 'active', reviewed: true, carriedFrom: null }], week, record?.revision ?? null, true); }}><input aria-label="New weekly priority" placeholder="Add a weekly priority…" maxLength={300} value={newTitle} disabled={disabled || Boolean(editing)} onChange={event => setNewTitle(event.target.value)} /><button disabled={disabled || Boolean(editing) || !newTitle.trim()}>Add priority</button></form> : null}
      {!past && priorities.some(priority => priority.status !== 'active') ? <details className="work-weekly-set-aside"><summary>Completed or set aside this week</summary>{priorities.filter(priority => priority.status !== 'active').map(reviewRow)}</details> : null}
      {week === currentWeek ? <div className="work-weekly-today">{children}</div> : null}
    </div>
    {!past ? <aside className="work-weekly-tray" aria-label="Open to-dos"><div className="work-weekly-tray-content"><h2>Open to-dos</h2><p className="work-weekly-hint">Drag beneath a priority, or choose one below.</p><ul>{available.map(item => <li key={item.id} {...dragProps(item)} className={dragging === item._id ? 'is-dragging' : ''}><div className="work-weekly-tray-line"><WorkIcon name="layers" /><span>{item.title}{source(item)}</span></div><label className="work-weekly-assignment"><span className="work-sr-only">Priority for {item.title}</span><select aria-label={`Priority for ${item.title}`} value="" disabled={disabled || !item._id || !active.length} onChange={event => link(item._id, event.target.value)}><option value="">{item._id ? 'Add to priority…' : 'Save task to link it'}</option>{active.map(priority => <option key={priority.id} value={priority.id}>{priority.title}</option>)}</select></label></li>)}</ul>{!available.length ? <p className="work-weekly-empty">All clear. Open tasks not yet linked to a priority will appear here.</p> : null}<button disabled={disabled} onClick={() => onNew({ kind: 'task' })}>New to-do</button></div>{margin ? <div className="work-weekly-more">{margin}</div> : null}</aside> : null}
  </section>;
}
