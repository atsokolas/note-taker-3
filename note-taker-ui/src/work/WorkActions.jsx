import React, { useContext, useEffect, useState } from 'react';
import { KeptBeside } from '../components/home/Depths';
import { InPlace, WorkAppointmentRow, WorkTaskAssignment, WorkTaskRow } from './WorkPlanItem';
import WorkItemSource from './WorkItemSource';
import { CHASE_DAYS, daysBetween, nudge, sortedSince } from './workOutstanding';
import { displayDay, shiftDay, writtenDay } from './workPlannerModel';
import { noteTitle } from './workSession';
import { projectOfLine } from './workProjects';
import { TASK_DRAG, acceptsTask } from './workTaskDrag';

export const ACTION_LISTS = { all: 'Everything', new: 'To sort', next: 'Next', waiting: 'Waiting on', someday: 'Someday', upcoming: 'Upcoming' };
const GTD = ['new', 'next', 'waiting', 'someday'];
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const noteOf = (item, notes) => notes.find(note => item.noteId && [note._id, note.clientId].includes(item.noteId));
const sorted = (today, list, waitingOn = '') => ({ list, sortedOn: today, waitingOn, returnOn: null });

// The fields of a line, written where the line is: which list it sits in, who it waits on, when it is due.
function ActionFields({ item, list, today, onMove, onSort }) {
  const [asking, setAsking] = useState(false);
  const waiting = asking || list === 'waiting';
  const since = daysBetween(sortedSince(item), today);
  return <span className="work-action-fields">
    <select aria-label={`List for ${item.title}`} value={waiting ? 'waiting' : list} onChange={event => {
      const next = event.target.value;
      setAsking(next === 'waiting');
      if (next !== 'waiting') onMove(item, next);
    }}>
      {GTD.filter(key => key !== 'new' || list === 'new').map(key => <option key={key} value={key} disabled={key === 'new'}>{ACTION_LISTS[key]}</option>)}
    </select>
    {waiting ? <InPlace aria-label={`Who is ${item.title} waiting on?`} placeholder="Name" value={item.waitingOn || ''} autoFocus={asking}
      onCommit={person => { setAsking(false); onMove(item, 'waiting', person); }} onCancel={() => setAsking(false)} /> : null}
    {list === 'waiting' && since >= CHASE_DAYS ? <small>{plural(since, 'day')}</small> : null}
    <label className="work-action-due" data-empty={item.dueOn ? undefined : ''}>Due<input type="date" aria-label={`Due date for ${item.title}`} value={item.dueOn || ''} onChange={event => onSort(item.clientId, { dueOn: event.target.value || null })} /></label>
    {item.dueOn && item.dueOn < today ? <small>Overdue</small> : null}
  </span>;
}

export default function WorkActions({ filter, onFilter, needs, items, notes, folders, projects = [], today, onSort, onRename, onAction, onOpen, onEdit, onStart, onNew }) {
  const assignment = useContext(WorkTaskAssignment);
  const { priorities = [], link, onWeek } = assignment || {};
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState(false);
  const [closed, setClosed] = useState(null);
  const [dropTarget, setDropTarget] = useState('');
  useEffect(() => {
    if (!closed) return;
    const timer = window.setTimeout(() => setClosed(null), 5000);
    return () => window.clearTimeout(timer);
  }, [closed]);

  const act = (item, values) => {
    const operation = onAction(item.clientId, values);
    if (operation && values.type === 'complete') setClosed({ item, operation });
  };
  const move = (item, list, person) => onSort(item.clientId, sorted(today, list, person));
  const markToday = item => onAction(item.clientId, { type: 'plan', plannedOn: today }, sorted(today, 'next'));
  const oneThing = item => {
    if (needs.oneThing && needs.oneThing.id !== item.id) onSort(needs.oneThing.clientId, { oneThingOn: null });
    onSort(item.clientId, { oneThingOn: item.oneThingOn === today ? null : today });
  };
  const listOf = item => GTD.find(key => needs[key].includes(item));
  const row = item => {
    if (item.kind === 'appointment') return <div key={item.id} className="work-upcoming-appointment"><small>{displayDay(item.plannedOn)}</small><WorkAppointmentRow item={item} folders={folders} projects={projects} onStart={onStart} onEdit={onEdit} /></div>;
    const list = listOf(item);
    const name = item.id === draft ? noteOf(item, notes) : null;
    const message = item.id === draft ? nudge(item, name && displayDay(writtenDay(name))) : '';
    return <React.Fragment key={item.id}>
      <WorkTaskRow item={item} today={today} notes={notes} folders={folders} canPlan={list === 'next'}
        onOpen={onOpen} onEdit={onEdit} onTitle={onRename} onAction={(_, values) => act(item, values)}
        aside={<>
          {list === 'someday' && item.returnOn ? <small>Review {displayDay(item.returnOn)}</small> : item.plannedOn ? <small>Planned {displayDay(item.plannedOn)}</small> : null}
          <ActionFields item={item} list={list} today={today} onMove={move} onSort={onSort} />
        </>}
        actions={<>
          {list === 'new' ? <button onClick={() => markToday(item)}>Move to today</button> : null}
          {list === 'waiting' ? <button onClick={() => { setDraft(item.id); setCopied(false); }}>Draft a nudge</button> : null}
          {list === 'someday' ? <label>Review on<input type="date" aria-label={`Bring back ${item.title} on`} min={shiftDay(today, 1)} value={item.returnOn || ''} onChange={event => onSort(item.clientId, { returnOn: event.target.value || null })} /></label> : null}
          {list === 'next' ? <button aria-pressed={item.oneThingOn === today} onClick={() => oneThing(item)}>{item.oneThingOn === today ? 'Clear today’s focus' : 'Make today’s focus'}</button> : null}
        </>} />
      {item.id === draft ? <div className="work-outstanding-draft"><p>{message}</p><button onClick={async () => {
        try { await navigator.clipboard.writeText(message); setCopied(true); } catch { setCopied(false); }
      }}>{copied ? 'Copied' : 'Copy'}</button><button onClick={() => setDraft(null)}>Dismiss</button></div> : null}
    </React.Fragment>;
  };
  // Next folds what already has a day, so the undated work stays in front.
  const rows = (lines, key) => {
    const scheduled = key === 'next' ? lines.filter(item => item.plannedOn) : [];
    return <>{lines.filter(item => !scheduled.includes(item)).map(row)}
      {scheduled.length ? <details className="work-needs-rest"><summary>Scheduled <small>{scheduled.length}</small></summary>{scheduled.map(row)}</details> : null}</>;
  };

  const everything = filter === 'all';
  const list = filter === 'upcoming'
    ? items.filter(item => !item.completed && ['task', 'question', 'appointment'].includes(item.kind) && (item.plannedOn > today || item.dueOn > today))
      .sort((a, b) => firstFuture(a, today).localeCompare(firstFuture(b, today)))
    : (everything ? GTD : [filter]).flatMap(key => needs[key]);
  // A to-do linked to one of this week's priorities sits beneath it; the rest keep their list.
  const under = priority => priority.taskIds.map(id => list.find(item => item._id === id)).filter(Boolean);
  const nested = priorities.map(priority => ({ priority, lines: under(priority) })).filter(group => everything || group.lines.length);
  const loose = list.filter(item => !priorities.some(priority => priority.taskIds.includes(item._id)));
  // Beside the week's priorities, only those touching a project you switched it on for: the rest of Work is never read for it.
  const current = projects.filter(project => !project.archivedAt);
  const on = current.filter(project => project.keptBeside);
  const bearing = priorities.flatMap(priority => {
    const lines = priority.taskIds.map(id => items.find(item => item._id === id)).filter(item => item && on.some(project => String(project._id) === projectOfLine(item, notes)));
    return lines.length ? [priority.title, ...lines.map(line => line.title)] : [];
  });
  const off = current.filter(project => !project.keptBeside).map(project => project.name);
  const drop = priority => ({
    onDragOver: event => { if (link && acceptsTask(event)) { event.preventDefault(); setDropTarget(priority.id); } },
    onDragLeave: () => setDropTarget(''),
    onDrop: event => { event.preventDefault(); setDropTarget(''); const id = event.dataTransfer.getData(TASK_DRAG); if (id) link(id, priority.id); }
  });
  return <section className="work-action-lists">
    <div className="work-actions-toolbar"><nav aria-label="Action lists">
      {Object.entries(ACTION_LISTS).map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => { setDraft(null); onFilter(key); }}>
        {label}{key === 'new' && needs.new.length ? <small>{needs.new.length}</small> : null}
      </button>)}
    </nav><button className="work-add-day-task" onClick={() => onNew({ kind: 'task' })}>Add action</button></div>
    {/* Every linked to-do sits under its priority's heading here, so rows leave out their own priority link. */}
    <WorkTaskAssignment.Provider value={assignment && { ...assignment, onWeek: null }}><section aria-label={ACTION_LISTS[filter]}>
      {nested.map(({ priority, lines }) => <section key={priority.id} aria-label={priority.title} className={`work-action-group is-priority${dropTarget === priority.id ? ' is-drop-target' : ''}`} {...drop(priority)}>
        <h2><button onClick={onWeek}>{priority.title}</button></h2>
        {lines.length ? lines.map(row) : <p className="work-empty-line">Drag a to-do here.</p>}
      </section>)}
      {everything ? GTD.map(key => [key, loose.filter(item => needs[key].includes(item))]).filter(([, lines]) => lines.length).map(([key, lines]) => <section key={key} aria-label={ACTION_LISTS[key]} className="work-action-group">
        <h2>{ACTION_LISTS[key]}</h2>{rows(lines, key)}
      </section>)
        : loose.length > 0 && nested.length > 0 ? <section aria-label="Everything else" className="work-action-group"><h2>Everything else</h2>{rows(loose, filter)}</section> : rows(loose, filter)}
      {!list.length ? <p className="work-empty-line">{filter === 'new' ? 'Nothing to sort.' : 'No actions here.'}</p> : null}
      {closed ? <div className="work-action-undo" role="status">{closed.item.title} completed. <button onClick={() => {
        onAction(closed.item.clientId, { type: 'undo', undoOf: closed.operation }); setClosed(null);
      }}>Undo</button></div> : null}
    </section></WorkTaskAssignment.Provider>
    {bearing.length ? <KeptBeside className="work-project-beside work-actions-beside" label="Kept that bears on this week" text={bearing.join(' ')}>
      <small>On for {on.map(project => project.name).join(', ')}{off.length ? ` · off for ${off.join(', ')}` : ''}</small>
    </KeptBeside> : null}
  </section>;
}

const firstFuture = (item, today) => [item.plannedOn, item.dueOn].filter(date => date > today).sort()[0];

export function WorkReviewDetails({ needs, notes, today, onReopen, onOpen, onProject, onSaveProject, onWeekEdition, onAction, onSort }) {
  const [reading, setReading] = useState({ busy: false, message: '' });
  const drafted = notes.filter(note => note.tags?.includes('work-edition') && note.occurredOn >= shiftDay(today, -6)).sort((a, b) => String(b.occurredOn).localeCompare(String(a.occurredOn)))[0];
  const readWeek = async () => {
    setReading({ busy: true, message: '' });
    try { const result = await onWeekEdition(); setReading({ busy: false, message: result?.silence || '' }); }
    catch (error) { setReading({ busy: false, message: error.message }); }
  };
  return <>
    {needs.done ? <details className="work-needs-rest"><summary>Done this week <small>{needs.done}</small></summary><dl className="work-ledger">{needs.ledger.map(entry => <React.Fragment key={entry.day}><dt>{displayDay(entry.day, { weekday: 'long' })}</dt><dd>{entry.items.map(item => {
      const note = noteOf(item, notes);
      return <div className="work-ledger__line" key={item.id}><div className="work-ledger__title"><s>{item.title}</s>{item.origin && notes.some(note => note._id && note._id === item.origin.noteId)
        ? <WorkItemSource origin={item.origin} /> : note?._id ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null}</div>
        {!item.pending && ['task', 'question'].includes(item.kind) ? <button aria-label={`Reopen ${item.title}`} onClick={() => onReopen(item)}>Reopen</button> : null}
      </div>;
    })}</dd></React.Fragment>)}</dl></details> : null}
    {needs.silent.length || needs.quiet.length ? <details className="work-needs-rest"><summary>Inactive projects and tasks</summary>
      {needs.silent.map(item => <div className="work-needs-project" key={item.id}><button onClick={() => onProject(item.id)}>{item.name}</button><button onClick={() => onSaveProject(item.record, { paused: true })}>Pause project</button></div>)}
      {needs.quiet.map(item => <div className="work-outstanding-quiet" key={item.id}><span>{item.title}</span><button onClick={() => onSort(item.clientId, sorted(today, 'next'))}>Keep</button><button onClick={() => onSort(item.clientId, sorted(today, 'someday'))}>Move to Someday</button><button onClick={() => onAction(item.clientId, { type: 'complete' })}>Close item</button></div>)}
    </details> : null}
    <section className="work-week-recap" aria-label="Weekly recap">
      {drafted ? <button onClick={() => onOpen(drafted.clientId)}>Open weekly recap</button> : null}
      <button disabled={reading.busy} onClick={readWeek}>{reading.busy ? 'Drafting…' : drafted ? 'Draft again' : 'Draft a weekly recap'}</button>
      {reading.message ? <p role="status">{reading.message}</p> : null}
    </section>
  </>;
}

export function WorkDayClose({ items, today, onAction, onSort }) {
  const left = items.filter(item => ['task', 'question'].includes(item.kind) && !item.completed && item.plannedOn === today);
  const tomorrow = shiftDay(today, 1), monday = shiftDay(today, ((8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7) || 7);
  const first = items.filter(item => item.kind === 'appointment' && item.plannedOn === tomorrow).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))[0];
  const task = items.find(item => item.kind === 'task' && !item.completed && item.plannedOn === tomorrow);
  const starts = [first && `${first.title}${first.startTime ? ` at ${first.startTime}` : ''}`, task && task.title.charAt(0).toLowerCase() + task.title.slice(1)].filter(Boolean);
  // Once the last line is moved the section stays, so the closing sentence is read.
  const [closing, setClosing] = useState(false);
  const act = (id, values) => { setClosing(true); onAction(id, values); };
  if (!left.length && !closing) return null;
  return <section className="work-day-close" aria-label="Close the day"><h2>Close the day</h2><p className="work-outstanding-line">{!left.length ? 'Today is closed.' : left.length === 1 ? 'One thing from today is still open.' : `${plural(left.length, 'thing')} from today are still open.`}</p>
    {left.map(item => <div className="work-planner-task work-outstanding-row" key={item.id}><label><input type="checkbox" checked={false} onChange={() => act(item.clientId, { type: 'complete' })} /><span>{item.title}</span></label><span className="work-carried"><button onClick={() => act(item.clientId, { type: 'plan', plannedOn: tomorrow })}>Tomorrow</button>{monday !== tomorrow ? <button onClick={() => act(item.clientId, { type: 'plan', plannedOn: monday })}>Monday</button> : null}<button onClick={() => { act(item.clientId, { type: 'plan', plannedOn: null }); onSort(item.clientId, { list: 'someday', sortedOn: today, returnOn: null }); }}>Someday</button></span></div>)}
    {starts.length ? <p className="work-outstanding-line">Tomorrow starts with {starts.join(' and ')}.</p> : null}
  </section>;
}
