import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import WorkIcon from './WorkIcon';
import { matchesQuery, noteTitle } from './workSession';
import { displayDay, shiftDay, weekDays, writtenDay } from './workPlannerModel';

// The week line sits over every Work page. On Today it is followed by the day itself, read top to bottom like a page in a day book:
// its appointments and follow-ups, what is carried from earlier, what was written, the margin.
export default function WorkCalendar({ day, today, mode, onMode, onDay, items, notes, query, folders, page, mark, drag, onOpen, onStart, onEdit, onAction, onNew, onPlan, margin }) {
  const frame = useRef(null), contents = useRef(null), animation = useRef(null), origin = useRef(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const clock = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(clock); }, []);
  // "in 4 min" or "now" on today's meetings, and a way into the note for one that has none yet.
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const when = item => {
    if (item.plannedOn !== today || !item.startTime) return '';
    const from = minutes(item.startTime) - (now.getHours() * 60 + now.getMinutes());
    return from <= 0 && from > -(minutes(item.endTime || item.startTime) - minutes(item.startTime)) ? ' · now' : from > 0 && from <= 15 ? ` · in ${from} min` : '';
  };
  const meeting = item => <>{item.title}{when(item)}{item.noteId ? '' : <small className="work-start-note"> · Start the note</small>}</>;
  // The underlined day is the one this page is about: the chosen day on Today, the written day on a note.
  const marked = mark || (page ? day : null);
  const days = weekDays(day), tasks = items.filter(item => ['task', 'question'].includes(item.kind)), appointments = items.filter(item => item.kind === 'appointment');
  const onDate = (list, date) => list.filter(item => item.plannedOn === date);
  const priorities = date => onDate(tasks, date).filter(item => item.priority && !item.completed).sort((a, b) => a.priority - b.priority).slice(0, 3);
  const plan = date => [...priorities(date), ...onDate(tasks, date).filter(item => !priorities(date).includes(item))];
  const noteOf = item => item.noteId && notes.find(note => [note._id, note.clientId].includes(item.noteId));
  const carried = tasks.filter(item => !item.completed && (item.plannedOn || writtenDay(noteOf(item)) || day) < day);
  const written = notes.filter(note => writtenDay(note) === day && matchesQuery(note, query));
  const folderName = note => folders.find(folder => folder._id === (note.folder?._id || note.folder))?.name || 'Inbox';
  const selectedAppointments = onDate(appointments, day).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const selectMode = next => {
    const selection = window.getSelection?.();
    const selectionRange = selection?.rangeCount && selection.getRangeAt(0);
    const anchor = selectionRange && document.querySelector('.work-note-paper')?.contains(selectionRange.startContainer) ? selectionRange.cloneRange() : null;
    origin.current = { height: frame.current?.getBoundingClientRect().height || 0, anchor, top: anchor?.getBoundingClientRect?.().top, scroll: window.scrollY };
    onMode(next);
  };
  useLayoutEffect(() => {
    const node = frame.current; if (!node) return;
    const from = origin.current; origin.current = null;
    const target = contents.current?.scrollHeight || 0;
    if (from) animation.current?.cancel(); node.style.height = `${target}px`;
    if (!from || !node.animate) return;
    const duration = Number.parseFloat(getComputedStyle(node).getPropertyValue('--work-fold-ms')) || 0;
    if (!duration) return;
    const motion = node.animate([{ height: `${from.height}px` }, { height: `${target}px` }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' }); animation.current = motion;
    motion.onfinish = () => { if (frame.current) frame.current.style.height = `${contents.current?.scrollHeight || 0}px`; };
    let request;
    const hold = () => {
      if (from.scroll > 0 && from.anchor?.getBoundingClientRect && from.top != null) { const delta = from.anchor.getBoundingClientRect().top - from.top; if (Math.abs(delta) > 1) window.scrollBy(0, delta); }
      if (motion.playState === 'running') request = window.requestAnimationFrame(hold);
    };
    request = window.requestAnimationFrame(hold);
    return () => { window.cancelAnimationFrame(request); };
  }, [mode, day, items]);
  useLayoutEffect(() => {
    const measure = () => { if (frame.current && animation.current?.playState !== 'running') frame.current.style.height = `${contents.current?.scrollHeight || 0}px`; };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (contents.current) observer?.observe(contents.current); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [mode]);
  const archivedLabel = item => folders.find(folder => folder._id === (item.folder?._id || item.folder))?.archivedAt ? ' · Archived folder' : '';
  const taskRow = (item, aside = null) => <div className={`work-planner-task ${item.completed ? 'is-done' : ''}`} key={item.id}><label><input type="checkbox" checked={item.completed} onChange={() => onAction(item.clientId, { type: item.completed ? 'reopen' : 'complete' })} /><span>{item.title}{archivedLabel(item)}{item.previousPlannedOn && item.previousPlannedOn !== item.plannedOn ? <small>From {displayDay(item.previousPlannedOn, { weekday: 'short', day: 'numeric' })}</small> : null}{item.dueOn && item.dueOn < today && !item.completed ? <small>Due {displayDay(item.dueOn)} · overdue</small> : null}{item.pending ? <small>Pending sync</small> : null}</span></label>{aside}<button aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}>{item.conflicted ? 'Review both versions' : <WorkIcon name="more" />}</button></div>;
  const appointmentRow = item => <div className="work-appointment" key={item.id}><button onClick={() => onStart(item)}><time>{item.startTime || '—'}</time> <span>{meeting(item)}{archivedLabel(item)}</span></button><button aria-label={`Edit appointment ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button></div>;
  const carriedRow = item => { const note = noteOf(item); return taskRow(item, <span className="work-carried"><time>{displayDay(item.plannedOn || writtenDay(note), { weekday: 'short', day: 'numeric', month: 'short' })}</time>{note ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null}<button onClick={() => onAction(item.clientId, { type: 'plan', plannedOn: day })}>Move to {day === today ? 'today' : displayDay(day, { weekday: 'long' })}</button></span>); };
  const counted = (n, one, many = `${one}s`) => n ? `${n} ${n === 1 ? one : many}` : '';
  const parts = [counted(selectedAppointments.length, 'appointment'), counted(plan(day).filter(item => !item.completed).length, 'follow-up'), carried.length ? `${carried.length} carried from earlier` : ''].filter(Boolean);
  const daySentence = parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1').replace(/^./, c => c.toUpperCase())}.` : 'A clear day.';
  return <section className={`work-calendar mode-${mode}`} aria-label="Work planner">
    <header className="work-calendar-heading"><button className="work-week-step" aria-label="Previous week" onClick={() => onDay(shiftDay(day, -7))}><WorkIcon name="previous" /></button><div className="work-week-days" role="group" aria-label="Calendar navigation">{days.map(date => <button key={date} className="work-day-heading" data-day={date} aria-label={displayDay(date)} aria-pressed={date === marked} aria-current={date === today ? 'date' : undefined} data-busy={onDate(items, date).some(item => item.kind !== 'jot' && !item.completed) ? true : undefined} onKeyDown={event => { const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!offset) return; event.preventDefault(); const next = shiftDay(date, offset); onDay(next); window.requestAnimationFrame(() => document.querySelector(`[data-day="${next}"]`)?.focus({ preventScroll: true })); }} onClick={() => onDay(date)}><span>{displayDay(date, { weekday: 'short' })}</span> {displayDay(date, { day: 'numeric' })}</button>)}</div><button className="work-week-step" aria-label="Next week" onClick={() => onDay(shiftDay(day, 7))}><WorkIcon name="next" /></button><button className="work-week-toggle" aria-pressed={mode === 'week'} onClick={() => selectMode(mode === 'week' ? 'compact' : 'week')}>Week</button></header>
    <div className="work-calendar-fold" ref={frame}>
      <div ref={contents} className="work-calendar-content">
        {mode === 'week' ? <div className="work-week-columns">{days.map((date, index) => <div className={`work-day ${date === day ? 'is-selected' : ''} ${index > 4 ? 'is-weekend' : ''}`} key={date}>{date === marked && page ? null : <div className="work-day-plan">{onDate(appointments, date).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).map(appointmentRow)}{plan(date).map(item => taskRow(item))}<button className="work-day-add" aria-label={`Plan work for ${displayDay(date)}`} onClick={() => onNew({ plannedOn: date })}><WorkIcon name="plus" /></button></div>}</div>)}</div> : null}
      </div>
    </div>
    {page ? <div className="work-day-page">
      <h1 className="work-page-title">{displayDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
      <p className="work-page-sense">{daySentence}</p>
      <div className="work-day-lines">{selectedAppointments.map(appointmentRow)}{plan(day).map(item => taskRow(item))}<form className="work-plan-new" onSubmit={event => { event.preventDefault(); const line = event.currentTarget.elements.plan; if (line.value.trim()) onPlan(line.value); else onNew({ plannedOn: day }); line.value = ''; }}><input name="plan" aria-label="Plan something" placeholder="Plan something" title="A follow-up, or a meeting with a time: ‘IC meeting thu 2pm’. Enter on an empty line opens the full form." /></form></div>
      {carried.length ? <section aria-labelledby="work-carried"><h2 id="work-carried">Carried from earlier</h2>{carried.map(carriedRow)}</section> : null}
      {written.length ? <section aria-labelledby="work-written"><h2 id="work-written">Written {day === today ? 'today' : displayDay(day, { weekday: 'long' })}</h2>{written.map(note => <button className="work-index-note" key={note.clientId} {...drag(note)} onClick={() => onOpen(note.clientId)}><WorkIcon name="file" /><span>{noteTitle(note)}</span><small>{folderName(note)}</small></button>)}</section> : null}
      <details className="work-day-margin"><summary>Day margin</summary>{margin}</details>
    </div> : null}
  </section>;
}
