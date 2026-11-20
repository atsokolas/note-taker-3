import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import WorkIcon from './WorkIcon';
import WorkNoteActions from './WorkNoteActions';
import { WorkTaskRow, WorkAppointmentRow } from './WorkPlanItem';
import { matchesQuery, noteTitle } from './workSession';
import { deviceTimeZone, displayDay, displayRange, shiftDay, weekDays, writtenDay } from './workPlannerModel';
import WorkDayTasks, { dayTasks } from './WorkDayTasks';

// The week line sits over every Work page. On Today it is followed by the day itself, read top to bottom like a page in a day book:
// its appointments and to-dos, what is carried from earlier, what was written, the margin.
export default function WorkCalendar({ day, today, mode, onMode, onDay, pickerOpen, onPicker, focusRequest, items, notes, query, folders, projects = [], timeZone = deviceTimeZone(), page, mark, drag, onOpen, onRenameNote, onTrashNote, onStart, onEdit, onAction, onNew, onPlan, margin, oneThing, sense, showTasks = true }) {
  const frame = useRef(null), contents = useRef(null), animation = useRef(null), origin = useRef(null);
  const navigation = useRef(null);
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
  // The chosen day on Today, or the written day on a note.
  const marked = mark || (page ? day : null);
  const days = weekDays(day), appointments = items.filter(item => item.kind === 'appointment');
  const onDate = (list, date) => list.filter(item => item.plannedOn === date);
  const plan = date => dayTasks(items, notes, date, today).planned;
  const { carried } = dayTasks(items, notes, day, today);
  const written = notes.filter(note => writtenDay(note) === day && matchesQuery(note, query));
  const folderName = note => folders.find(folder => folder._id === (note.folder?._id || note.folder))?.name || 'Inbox';
  const selectedAppointments = onDate(appointments, day).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const walkDays = (event, date) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    const next = event.key === 'Home' ? days[0] : event.key === 'End' ? days.at(-1) : offset ? shiftDay(date, offset) : null;
    if (!next || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (next !== date) onDay(next, next);
  };
  const step = (event, offset, control) => onDay(shiftDay(day, offset),
    event.detail === 0 || document.activeElement === event.currentTarget ? control : null);
  useLayoutEffect(() => {
    const request = focusRequest?.current;
    if (request?.day !== day || !navigation.current) return;
    focusRequest.current = null;
    const control = navigation.current.querySelector(`[data-calendar-control="${request.control}"]`);
    control?.focus({ preventScroll: true });
    control?.scrollIntoView?.({ block: 'nearest' });
  });
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
  const counted = (n, one, many = `${one}s`) => n ? `${n} ${n === 1 ? one : many}` : '';
  const parts = [counted(selectedAppointments.length, 'appointment'), counted(plan(day).filter(item => !item.completed).length, 'to-do'), carried.length ? `${carried.length} carried from earlier` : ''].filter(Boolean);
  const daySentence = parts.length ? `${parts.join(', ').replace(/, ([^,]*)$/, ' and $1').replace(/^./, c => c.toUpperCase())}.` : 'A clear day.';
  return <section className={`work-calendar mode-${mode}`} aria-label="Work planner">
    {page ? <header className="work-day-header"><h1 className="work-page-title">{day === today ? 'Today' : displayDay(day)}</h1>{day === today ? <p><time dateTime={day}>{displayDay(day)}</time></p> : null}</header> : null}
    <details className="work-calendar-picker" open={mode === 'week' || pickerOpen} onToggle={event => onPicker?.(event.currentTarget.open)}>
      <summary><WorkIcon name="calendar" />Choose a day</summary>
      <header className="work-calendar-heading" ref={navigation}>
        <button className="work-week-step" data-calendar-control="previous" aria-label="Previous week" onClick={event => step(event, -7, 'previous')}><WorkIcon name="previous" /></button>
        <p className="work-week-range" aria-live="polite">{displayRange(days[0], days.at(-1))}</p>
        <button className="work-week-step" data-calendar-control="next" aria-label="Next week" onClick={event => step(event, 7, 'next')}><WorkIcon name="next" /></button>
        <button className="work-week-toggle" data-calendar-control="mode" aria-pressed={mode === 'week'} onClick={() => selectMode(mode === 'week' ? 'compact' : 'week')}>Week</button>
        <div className="work-week-days" role="group" aria-label="Calendar navigation">
          {days.map(date => (
            <button key={date} className="work-day-heading" data-calendar-control={date} aria-label={displayDay(date)}
              tabIndex={date === (marked || day) ? 0 : -1} aria-pressed={date === marked} aria-current={date === today ? 'date' : undefined}
              data-busy={onDate(items, date).some(item => item.kind !== 'jot' && !item.completed) ? true : undefined}
              onKeyDown={event => walkDays(event, date)} onClick={event => onDay(date, event.detail === 0 ? date : null)}>
              <span>{displayDay(date, { weekday: 'short' })}</span>
              <span className="work-day-number">{displayDay(date, { day: 'numeric' })}</span>
            </button>
          ))}
        </div>
      </header>
    <div className="work-calendar-fold" ref={frame}>
      <div ref={contents} className="work-calendar-content">
        {mode === 'week' ? <div className="work-week-columns">{days.map((date, index) => <div className={`work-day ${date === day ? 'is-selected' : ''} ${index > 4 ? 'is-weekend' : ''}`} key={date}>{date === marked && page ? null : <div className="work-day-plan">{onDate(appointments, date).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).map(appointmentRow)}{plan(date).map(item => taskRow(item))}<button className="work-day-add" aria-label={`Plan work for ${displayDay(date)}`} onClick={() => onNew({ plannedOn: date })}><WorkIcon name="plus" /></button></div>}</div>)}</div> : null}
      </div>
    </div>
    </details>
    {page ? <div className="work-day-page">
      {sense || <p className="work-page-sense work-sr-only">{daySentence}</p>}
      {oneThing && day === today ? <p className="work-one-thing"><small>Today’s one thing</small><span>{oneThing.title}</span></p> : null}
      {selectedAppointments.length ? <section className="work-appointments" aria-label="Appointments">{selectedAppointments.map(appointmentRow)}</section> : null}
      {showTasks ? <WorkDayTasks day={day} today={today} items={items} notes={notes} folders={folders} onAction={onAction} onEdit={onEdit} onOpen={onOpen} onPlan={onPlan} onNew={onNew} /> : null}
      {written.length ? <section aria-labelledby="work-written"><h2 id="work-written">Written {day === today ? 'today' : displayDay(day, { weekday: 'long' })}</h2>{written.map(note => <div className="work-written-row" key={note.clientId}><button className="work-index-note" {...drag(note)} onClick={() => onOpen(note.clientId)}><WorkIcon name="file" /><span>{noteTitle(note)}</span><small>{folderName(note)}</small></button>{onRenameNote && onTrashNote ? <WorkNoteActions note={note} onRename={onRenameNote} onOpen={onOpen} onTrash={onTrashNote} /> : null}</div>)}</section> : null}
      <details className="work-day-margin" open><summary>Day margin</summary>{margin}</details>
    </div> : null}
  </section>;
}
