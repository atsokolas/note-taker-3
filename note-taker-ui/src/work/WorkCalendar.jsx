import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import WorkIcon from './WorkIcon';
import { WorkTaskRow, WorkAppointmentRow } from './WorkPlanItem';
import { matchesQuery, noteTitle } from './workSession';
import { deviceTimeZone, displayDay, shiftDay, weekDays, writtenDay } from './workPlannerModel';
import { listOf } from './workOutstanding';

// The week line sits over every Work page. On Today it is followed by the day itself, read top to bottom like a page in a day book:
// its appointments and follow-ups, what is carried from earlier, what was written, the margin.
export default function WorkCalendar({ day, today, mode, onMode, onDay, items, notes, query, folders, projects = [], timeZone = deviceTimeZone(), page, mark, drag, onOpen, onStart, onEdit, onAction, onNew, onPlan, margin, oneThing }) {
  const frame = useRef(null), contents = useRef(null), animation = useRef(null), origin = useRef(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const clock = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(clock); }, []);
  // "in 4 min" or "now" on today's meetings, and a way into the note for one that has none yet.
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const when = item => {
    if (item.plannedOn !== today || !item.startTime) return '';
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    const from = minutes(item.startTime) - minutes(clock);
    return from <= 0 && from > -(minutes(item.endTime || item.startTime) - minutes(item.startTime)) ? ' · now' : from > 0 && from <= 15 ? ` · in ${from} min` : '';
  };
  // The underlined day is the one this page is about: the chosen day on Today, the written day on a note.
  const marked = mark || (page ? day : null);
  const days = weekDays(day), tasks = items.filter(item => ['task', 'question'].includes(item.kind)), appointments = items.filter(item => item.kind === 'appointment');
  const onDate = (list, date) => list.filter(item => item.plannedOn === date);
  const priorities = date => onDate(tasks, date).filter(item => item.priority && !item.completed).sort((a, b) => a.priority - b.priority).slice(0, 3);
  const plan = date => [...priorities(date), ...onDate(tasks, date).filter(item => !priorities(date).includes(item))];
  const noteOf = item => item.noteId && notes.find(note => [note._id, note.clientId].includes(item.noteId));
  const carried = tasks.filter(item => !item.completed && listOf(item, notes, today) !== 'someday' && (item.plannedOn || writtenDay(noteOf(item)) || day) < day);
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
  const taskRow = (item, aside = null) => <WorkTaskRow key={item.id} item={item} today={today} folders={folders} onAction={onAction} onEdit={onEdit} aside={aside} />;
  const appointmentRow = item => <WorkAppointmentRow key={item.id} item={item} folders={folders} projects={projects} onStart={onStart} onEdit={onEdit} status={when(item)} />;
  const carriedRow = item => { const note = noteOf(item); return taskRow(item, <span className="work-carried"><time>{displayDay(item.plannedOn || writtenDay(note), { weekday: 'short', day: 'numeric', month: 'short' })}</time>{note ? <button onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null}<button onClick={() => onAction(item.clientId, { type: 'plan', plannedOn: day })}>Move to {day === today ? 'today' : displayDay(day, { weekday: 'long' })}</button></span>); };
  const counted = (n, one, many = `${one}s`) => n ? `${n} ${n === 1 ? one : many}` : '';
  const parts = [counted(selectedAppointments.length, 'appointment'), counted(plan(day).filter(item => !item.completed).length, 'follow-up'), carried.length ? `${carried.length} carried from earlier` : ''].filter(Boolean);
  const daySentence = parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1').replace(/^./, c => c.toUpperCase())}.` : 'A clear day.';
  return <section className={`work-calendar mode-${mode}`} aria-label="Work planner">
    {page ? <header className="work-day-header"><h1 className="work-page-title">{day === today ? 'Today' : displayDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h1><p><time dateTime={day}>{displayDay(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</time></p></header> : null}
    <details className="work-calendar-picker" open={mode === 'week' || undefined}><summary><WorkIcon name="calendar" />Choose a day</summary>
    <header className="work-calendar-heading"><button className="work-week-step" aria-label="Previous week" onClick={() => onDay(shiftDay(day, -7))}><WorkIcon name="previous" /></button><div className="work-week-days" role="group" aria-label="Calendar navigation">{days.map(date => <button key={date} className="work-day-heading" data-day={date} aria-label={displayDay(date)} aria-pressed={date === marked} aria-current={date === today ? 'date' : undefined} data-busy={onDate(items, date).some(item => item.kind !== 'jot' && !item.completed) ? true : undefined} onKeyDown={event => { const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!offset) return; event.preventDefault(); const next = shiftDay(date, offset); onDay(next); window.requestAnimationFrame(() => document.querySelector(`[data-day="${next}"]`)?.focus({ preventScroll: true })); }} onClick={() => onDay(date)}><span>{displayDay(date, { weekday: 'short' })}</span> {displayDay(date, { day: 'numeric' })}</button>)}</div><button className="work-week-step" aria-label="Next week" onClick={() => onDay(shiftDay(day, 7))}><WorkIcon name="next" /></button><button className="work-week-toggle" aria-pressed={mode === 'week'} onClick={() => selectMode(mode === 'week' ? 'compact' : 'week')}>Week</button></header>
    <div className="work-calendar-fold" ref={frame}>
      <div ref={contents} className="work-calendar-content">
        {mode === 'week' ? <div className="work-week-columns">{days.map((date, index) => <div className={`work-day ${date === day ? 'is-selected' : ''} ${index > 4 ? 'is-weekend' : ''}`} key={date}>{date === marked && page ? null : <div className="work-day-plan">{onDate(appointments, date).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).map(appointmentRow)}{plan(date).map(item => taskRow(item))}<button className="work-day-add" aria-label={`Plan work for ${displayDay(date)}`} onClick={() => onNew({ plannedOn: date })}><WorkIcon name="plus" /></button></div>}</div>)}</div> : null}
      </div>
    </div>
    </details>
    {page ? <div className="work-day-page">
      <p className="work-page-sense work-sr-only">{daySentence}</p>
      {oneThing && day === today ? <p className="work-one-thing"><small>Today’s one thing</small><span>{oneThing.title}</span></p> : null}
      <div className="work-day-lines">{selectedAppointments.length ? <section className="work-appointments" aria-label="Appointments">{selectedAppointments.map(appointmentRow)}</section> : null}<section className="work-priorities" aria-labelledby="work-priorities"><h2 id="work-priorities">Priorities</h2>{plan(day).map(item => taskRow(item))}</section><form className="work-plan-new" onSubmit={event => { event.preventDefault(); const line = event.currentTarget.elements.plan; if (line.value.trim()) onPlan(line.value); else onNew({ plannedOn: day }); line.value = ''; }}><input name="plan" aria-label="Plan something" placeholder="Plan something" title="A follow-up, or a meeting with a time: ‘IC meeting thu 2pm’. Enter on an empty line opens the full form." /></form></div>
      {carried.length ? <details className="work-earlier"><summary>From earlier <span>({carried.length})</span></summary><section aria-labelledby="work-carried"><h2 id="work-carried" className="work-sr-only">Carried from earlier</h2>{carried.map(carriedRow)}</section></details> : null}
      {written.length ? <section aria-labelledby="work-written"><h2 id="work-written">Written {day === today ? 'today' : displayDay(day, { weekday: 'long' })}</h2>{written.map(note => <button className="work-index-note" key={note.clientId} {...drag(note)} onClick={() => onOpen(note.clientId)}><WorkIcon name="file" /><span>{noteTitle(note)}</span><small>{folderName(note)}</small></button>)}</section> : null}
      <details className="work-day-margin"><summary>Day margin</summary>{margin}</details>
    </div> : null}
  </section>;
}
