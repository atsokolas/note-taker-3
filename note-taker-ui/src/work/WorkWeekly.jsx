import React, { useEffect, useId, useRef, useState } from 'react';
import { WorkTaskAssignment, WorkTaskRow } from './WorkPlanItem';
import WorkIcon from './WorkIcon';
import WorkMenu from './WorkMenu';
import WorkItemSource from './WorkItemSource';
import { operationId, noteTitle } from './workSession';
import { displayDay, displayRange, shiftDay, weekDays, writtenDay } from './workPlannerModel';
import { assignTask, carryWeek, completionAtWeekEnd, weekRecord } from './workWeeklyModel';
import './work-weekly.css';

import { TASK_DRAG, acceptsTask, taskDragProps, WorkTaskGrip } from './workTaskDrag';
const shortDate = day => displayDay(day, { day: 'numeric', month: 'short' });

export default function WorkWeekly({ session, today, timeZone, items, folders, notes, onAction, onEdit, onNew, onOpen, children, margin }) {
  const disclosureId = useId();
  const [collapsed, setCollapsed] = useState({});
  const currentWeek = weekDays(today)[0];
  const restored = useRef(session.weeklyDraft?.()).current;
  const [week, setWeek] = useState(restored?.week && restored.week > currentWeek ? restored.week : currentWeek);
  const [saved, setSaved] = useState({});
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(restored?.pending || null);
  const [message, setMessage] = useState(restored?.pending ? 'Your unsaved plan is ready to retry.' : '');
  const [review, setReview] = useState(false);
  const [newTitle, setNewTitle] = useState(restored?.newTitle || (restored?.week < currentWeek ? restored.editTitle : '') || '');
  const [adding, setAdding] = useState(Boolean(restored?.newTitle || (restored?.week < currentWeek && restored?.editTitle)));
  const addTrigger = useRef(null);
  const [editing, setEditing] = useState(restored?.week === currentWeek ? restored.editing || '' : '');
  const [editTitle, setEditTitle] = useState(restored?.editTitle || '');
  const [taskDraft, setTaskDraft] = useState(restored?.taskDraft || null);
  const taskDraftRef = useRef(taskDraft); taskDraftRef.current = taskDraft;
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
  const retain = value => { if (value) setSaved(current => ({ ...current, [value.workItem.plannedOn]: value })); };
  const cache = value => session.setWeeklyDraft?.(taskDraftRef.current ? { ...value, week, taskDraft: taskDraftRef.current } : value);
  const save = async (values, targetWeek = week, revision = record?.revision ?? null, clearNewTitle = false, automatic = false) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const proposal = { week: targetWeek, priorities: values, revision, clearNewTitle };
    cache({ week, newTitle, editing, editTitle, pending: proposal });
    try {
      const result = await session.saveWeek(targetWeek, values, revision, timeZone);
      if (!result) throw new Error('This plan did not save. Keep this page open and retry.');
      retain(result); setPending(null); setMessage(automatic ? 'Unfinished priorities moved here from last week.' : ''); setEditing(''); setEditTitle(''); if (clearNewTitle) { setNewTitle(''); setAdding(false); window.requestAnimationFrame(() => addTrigger.current?.focus()); }
      cache(clearNewTitle || !newTitle.trim() ? null : { week, newTitle });
    } catch (error) {
      // Another tab may have opened this same week first. Its saved plan wins initialization.
      if (automatic && error.current) { retain(error.current); setPending(null); cache(newTitle.trim() ? { week, newTitle } : null); }
      else { const failed = { ...proposal, current: error.current }; setPending(failed); cache({ week, newTitle, editing, editTitle, pending: failed }); setMessage(error.message || 'This plan did not save. Keep this page open and retry.'); }
    } finally { inFlight.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (previousWeek.current !== currentWeek) { const prior = previousWeek.current; previousWeek.current = currentWeek; setWeek(value => value === prior ? currentWeek : value); }
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
    if (!busy) session.setWeeklyDraft?.(pending || newTitle.trim() || editing || taskDraft ? { week, newTitle, editing, editTitle, pending, taskDraft } : null);
  }, [session, week, newTitle, editing, editTitle, pending, busy, taskDraft]);
  const navigate = next => { if (disabled || newTitle.trim() || editing || taskDraft) { setMessage('Finish or cancel your edit before changing weeks.'); return; } setWeek(next); setAdding(false); setReview(false); setEditing(''); setMessage(''); };
  // While one priority's title is being edited or a to-do is being added, the other priorities' menus wait, so no save drops that draft.
  const held = priority => disabled || Boolean(taskDraft) || Boolean(editing && editing !== priority.id);
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
    ...taskDragProps(item, disabled || past),
    onDragStart: event => { taskDragProps(item, disabled || past).onDragStart(event); setDragging(item._id); },
    onDragEnd: () => { setDragging(''); setDropTarget(''); }
  });
  const createTask = async event => {
    event.preventDefault();
    if (disabled || inFlight.current || !taskDraft?.title.trim()) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const title = taskDraft.title.trim();
      const id = taskDraft.clientId || session.capture({ title, timeZone, workItem: { kind: 'task' } });
      taskDraftRef.current = { ...taskDraft, clientId: id }; setTaskDraft(taskDraftRef.current);
      cache({ week, newTitle, editing, editTitle, pending });
      session.edit(id, { title });
      if (!await session.flush(id) || !session.entry(id)?._id) throw new Error(session.status?.(id) || 'That did not save.');
      const taskId = session.entry(id)._id;
      taskDraftRef.current = null; setTaskDraft(null); inFlight.current = false;
      if (active.some(priority => priority.id === taskDraft.priorityId)) await save(assignTask(priorities, taskId, taskDraft.priorityId));
      else { cache(null); setMessage('To-do saved in Open to-dos.'); }
    } catch (error) { setMessage(error.message || 'That did not save.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const source = item => {
    const note = notes.find(value => [value._id, value.clientId].includes(item.noteId));
    const folder = folders.find(value => value._id === (item.folder?._id || item.folder));
    return item.origin ? <WorkItemSource origin={item.origin} /> : <small className="work-weekly-source">{note ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : folder?.name || 'Work'}{writtenDay(item) ? ` · ${shortDate(writtenDay(item))}` : ''}</small>;
  };
  const taskRow = (id, priority) => {
    const item = tasks.find(value => value._id === id);
    if (!item) return <li className="work-weekly-missing" key={id}>Task unavailable. Its place in this plan is kept.</li>;
    const complete = past ? completionAtWeekEnd(item, week) : item.completed;
    return <li key={id} className={`work-weekly-task ${complete ? 'is-done' : ''} ${dropTarget === id ? 'is-drop-target' : ''}`} {...dragProps(item)} onDragOver={event => { if (!past && !disabled && acceptsTask(event)) { event.preventDefault(); event.stopPropagation(); setDropTarget(id); } }} onDrop={event => drop(event, priority.id, id)}>
      <label><WorkTaskGrip item={item} {...dragProps(item)} /><input type="checkbox" aria-label={item.title} checked={complete} disabled={past || disabled} onChange={() => onAction(item.clientId, { type: complete ? 'reopen' : 'complete' })} /><span>{item.title}</span></label>{source(item)}
      {!past ? <span className="work-weekly-task-actions"><button disabled={disabled} aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button><button disabled={disabled} aria-label={`Remove ${item.title} from priority`} onClick={() => link(id, '')}>Remove</button></span> : null}
    </li>;
  };
  const describePlan = values => values.map(priority => `${priority.title} (${priority.status})\n${priority.taskIds.map(id => `  • ${tasks.find(item => item._id === id)?.title || 'Unavailable task'}`).join('\n')}`).join('\n\n') || 'No priorities.';
  const reviewRow = priority => <div className="work-weekly-review-row" key={priority.id}><span>{priority.title}<small>{priority.carriedFrom ? `From week of ${shortDate(priority.carriedFrom)}` : priority.status}</small></span><div><button disabled={disabled || Boolean(editing) || Boolean(taskDraft)} aria-label={`Keep ${priority.title}`} onClick={() => changePriority(priority.id, { status: 'active', reviewed: true })}>Keep</button><button disabled={disabled || Boolean(editing) || Boolean(taskDraft)} aria-label={`Defer ${priority.title}`} onClick={() => changePriority(priority.id, { status: 'deferred', reviewed: true })}>Next week</button><button disabled={disabled || Boolean(editing) || Boolean(taskDraft)} aria-label={`Drop ${priority.title}`} onClick={() => changePriority(priority.id, { status: 'dropped', reviewed: true })}>Remove priority</button></div></div>;

  const taskComposer = priority => <form className="work-weekly-task-add" onSubmit={createTask}>
    {!priority ? <p>This priority is no longer active. Your to-do draft is kept.</p> : null}
    <input autoFocus aria-label={priority ? `New to-do for ${priority.title}` : 'Unassigned to-do'} placeholder="What needs doing?" value={taskDraft.title} disabled={busy} onChange={event => setTaskDraft({ ...taskDraft, title: event.target.value })} />
    <button disabled={disabled || !taskDraft.title.trim()}>{busy ? 'Adding…' : priority ? 'Add to-do' : 'Save to open to-dos'}</button>
    <button type="button" disabled={busy} onClick={() => { taskDraftRef.current = null; setTaskDraft(null); }}>Cancel</button>
  </form>;

  return <section className="work-weekly" aria-label="Weekly priorities">
    <div className="work-weekly-main"><header className="work-weekly-heading"><h1 className="work-page-title">{week === currentWeek ? 'This week' : 'Week of ' + shortDate(week)}</h1><div className="work-weekly-dateline"><p>{displayRange(week, shiftDay(week, 6), week.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' })}</p><nav aria-label="Priority weeks"><button disabled={disabled} aria-label="Previous priority week" onClick={() => navigate(shiftDay(week, -7))}><WorkIcon name="previous" /></button>{week !== currentWeek ? <button disabled={disabled} onClick={() => navigate(currentWeek)}>This week</button> : null}<button disabled={disabled || week >= currentWeek} aria-label="Next priority week" onClick={() => navigate(shiftDay(week, 7))}><WorkIcon name="next" /></button></nav>{!past && priorities.some(priority => priority.carriedFrom && !priority.reviewed) ? <button disabled={disabled} aria-expanded={review} onClick={() => setReview(value => !value)}>Review last week</button> : null}</div></header>
      {message ? <div className="work-weekly-receipt" role={pending ? 'alert' : 'status'}><p>{message}</p>{pending ? <><p>Your proposed plan for the week of {shortDate(pending.week)} is still on this page. {pending.current ? 'The saved plan changed elsewhere. Review it before replacing it.' : 'Keep this page open until it saves.'}</p>{pending.current ? <><details open><summary>Saved plan</summary><pre>{describePlan(pending.current.workItem.priorities)}</pre></details><details open><summary>Your proposed plan</summary><pre>{describePlan(pending.priorities)}</pre></details><button disabled={busy} onClick={() => { retain(pending.current); setPending(null); setMessage('Using the saved plan.'); }}>Use saved plan</button><button disabled={busy} onClick={() => save(pending.priorities, pending.week, pending.current.revision, pending.clearNewTitle)}>Save my version</button></> : <><button disabled={busy} onClick={() => save(pending.priorities, pending.week, pending.revision, pending.clearNewTitle)}>Retry save</button><button disabled={busy} onClick={() => { setPending(null); setMessage('Unsaved change discarded.'); }}>Discard change</button></>}</> : null}</div> : null}
      {past ? <p className="work-weekly-history">Past weeks keep their plan. Checkboxes show completion by that week’s end.</p> : null}
      {review && !past ? <section className="work-weekly-review" aria-label="Rollover review"><h2>A fresh look at the week</h2><p>Keep what matters. Deferring or dropping a priority never deletes its tasks.</p>{priorities.filter(priority => priority.carriedFrom || priority.status !== 'active').map(reviewRow)}{!priorities.some(priority => priority.carriedFrom || priority.status !== 'active') ? <p>Nothing carried forward to review.</p> : null}<button onClick={() => setReview(false)}>Close review</button></section> : null}
      {!past ? adding ? <form className="work-weekly-add" onSubmit={event => { event.preventDefault(); const title = newTitle.trim(); if (title && !disabled && !editing) save([...priorities, { id: operationId(), title, taskIds: [], status: 'active', reviewed: true, carriedFrom: null }], week, record?.revision ?? null, true); }}><input autoFocus aria-label="New weekly priority" placeholder="Name a priority…" maxLength={300} value={newTitle} disabled={disabled || Boolean(editing)} onChange={event => setNewTitle(event.target.value)} /><button disabled={disabled || Boolean(editing) || !newTitle.trim()}>Add priority</button><button type="button" disabled={busy} onClick={() => { setNewTitle(''); setAdding(false); window.requestAnimationFrame(() => addTrigger.current?.focus()); }}>Cancel</button></form> : <button ref={addTrigger} className="work-weekly-add-trigger" disabled={disabled || Boolean(editing)} onClick={() => setAdding(true)}><WorkIcon name="plus" />Add priority</button> : null}
      {taskDraft && !active.some(priority => priority.id === taskDraft.priorityId) ? taskComposer(null) : null}
      <ol className="work-weekly-priorities">{active.map((priority, index) => {
        const linked = priority.taskIds.map(id => tasks.find(task => task._id === id));
        const done = linked.filter(task => task && (past ? completionAtWeekEnd(task, week) : task.completed)).length;
        const settled = linked.length > 0 && done === linked.length && linked.every(task => !task.pending);
        return <li key={priority.id}><section aria-label={priority.title} className={`work-weekly-priority ${dropTarget === priority.id ? 'is-drop-target' : ''}`} onDragOver={event => { if (!past && !disabled && acceptsTask(event)) { event.preventDefault(); setDropTarget(priority.id); } }} onDrop={event => drop(event, priority.id)}>
        <header><h2><button className="work-priority-toggle" aria-expanded={!collapsed[`${week}:${priority.id}`]} aria-controls={`${disclosureId}-${priority.id}`} onClick={() => setCollapsed(value => ({ ...value, [`${week}:${priority.id}`]: !value[`${week}:${priority.id}`] }))}><WorkIcon name={collapsed[`${week}:${priority.id}`] ? 'right' : 'down'} /><span className="work-weekly-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{priority.title}</button></h2>{!past ? <WorkMenu actions label={`Manage ${priority.title}`} icon="more" className="work-weekly-manage">
          <button disabled={held(priority)} onClick={() => { setCollapsed(value => ({ ...value, [`${week}:${priority.id}`]: false })); setEditing(priority.id); setEditTitle(priority.title); }}>Rename</button>
          <button disabled={held(priority)} onClick={() => changePriority(priority.id, { status: 'complete', reviewed: true })}>Complete priority</button>
          <button disabled={held(priority)} onClick={() => changePriority(priority.id, { status: 'deferred', reviewed: true })}>Move to next week</button>
          <hr /><button className="work-destructive" disabled={held(priority)} onClick={() => changePriority(priority.id, { status: 'dropped', reviewed: true })}>Remove priority</button>
        </WorkMenu> : null}</header>
        <div id={`${disclosureId}-${priority.id}`} hidden={Boolean(collapsed[`${week}:${priority.id}`])}>
        {priority.carriedFrom ? <p className="work-weekly-carried">Carried from week of {shortDate(priority.carriedFrom)}{!priority.reviewed && !past ? ' · ready to review' : ''}</p> : null}
        {past && priority.status !== 'active' ? <p className="work-weekly-carried">{priority.status === 'complete' ? 'Completed priority' : priority.status === 'deferred' ? 'Deferred' : 'Dropped from plan'}</p> : null}
        {editing === priority.id ? <form className="work-weekly-edit" onSubmit={event => { event.preventDefault(); const title = event.currentTarget.elements.title.value.trim(); if (title) changePriority(priority.id, { title }); }}><input name="title" aria-label={`Rename ${priority.title}`} value={editTitle} onChange={event => setEditTitle(event.target.value)} maxLength={300} autoFocus /><button disabled={disabled}>Save title</button><button type="button" onClick={() => setEditing('')}>Cancel</button></form> : null}
        <ul>{priority.taskIds.map(id => taskRow(id, priority))}</ul>{!priority.taskIds.length ? <p className="work-weekly-empty">{past ? 'No tasks linked.' : 'Drag a to-do here or add one below.'}</p> : null}
        <footer className="work-priority-foot">{!past ? taskDraft?.priorityId === priority.id ? taskComposer(priority) : <button className="work-weekly-task-new" disabled={disabled || Boolean(editing) || Boolean(taskDraft)} aria-label={`Add to-do to ${priority.title}`} onClick={() => setTaskDraft({ priorityId: priority.id, title: '' })}><WorkIcon name="plus" />Add to-do</button> : null}
        {linked.length ? <p className={`work-priority-progress ${settled ? 'is-settled' : ''}`} role="status" aria-live="polite" aria-atomic="true">{settled ? <><WorkIcon name="check" /><span>Every linked to-do is done.</span></> : `${done}/${linked.length} done${linked.some(task => task?.pending) ? ' · saving' : ''}`}</p> : null}</footer>
        </div>
      </section></li>; })}</ol>
      {!active.length ? <p className="work-weekly-empty">{session.loading() ? 'Loading your week…' : past ? 'No plan saved for this week.' : 'What do you want to get done this week?'}</p> : null}

      {!past && priorities.some(priority => priority.status !== 'active') ? <details className="work-weekly-set-aside"><summary>Finished & postponed</summary>{priorities.filter(priority => priority.status !== 'active').map(reviewRow)}</details> : null}
      {week === currentWeek ? <div className="work-weekly-today">{children}</div> : null}
    </div>
    {!past ? <WorkTaskAssignment.Provider value={{ priorities: active, disabled, link }}><aside className="work-weekly-tray" aria-label="Open to-dos">{margin ? <div className="work-weekly-more">{margin}</div> : <details className="work-rail-next" open><summary>Next</summary>{tasks.filter(item => !item.completed && !priorities.some(priority => ['active', 'complete'].includes(priority.status) && priority.taskIds.includes(item._id))).map(item => <WorkTaskRow key={item.id} item={item} today={today} folders={folders} notes={notes} onOpen={onOpen} onEdit={onEdit} onAction={onAction} />)}<button disabled={disabled} onClick={() => onNew({ kind: 'task' })}>Add to-do</button></details>}</aside></WorkTaskAssignment.Provider> : null}
  </section>;
}
