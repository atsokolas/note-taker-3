import React, { useLayoutEffect, useRef, useState } from 'react';
import WorkIcon from './WorkIcon';
import { displayDay, shiftDay, weekDays } from './workPlannerModel';

export default function WorkCalendar({ day, today, mode, onMode, onDay, items, folders, onOpen, onEdit, onAction, onNew, onPlan, onCarry, margin, scopeLabel }) {
  const frame = useRef(null), contents = useRef(null), animation = useRef(null), origin = useRef(null);
  const [marginOpen, setMarginOpen] = useState(false);
  const days = weekDays(day), tasks = items.filter(item => ['task', 'question'].includes(item.kind)), appointments = items.filter(item => item.kind === 'appointment');
  const onDate = (list, date) => list.filter(item => item.plannedOn === date);
  const priorities = date => onDate(tasks, date).filter(item => item.priority && !item.completed).sort((a, b) => a.priority - b.priority).slice(0, 3);
  const plan = date => [...priorities(date), ...onDate(tasks, date).filter(item => !priorities(date).includes(item))];
  const earlier = tasks.filter(item => !item.completed && item.plannedOn && item.plannedOn < day);
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
    const target = mode === 'hide' ? 0 : contents.current?.scrollHeight || 0;
    if (from) animation.current?.cancel(); node.style.height = `${target}px`;
    if (!from || !node.animate) return;
    const duration = Number.parseFloat(getComputedStyle(node).getPropertyValue('--work-fold-ms')) || 0;
    if (!duration) return;
    const motion = node.animate([{ height: `${from.height}px` }, { height: `${target}px` }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' }); animation.current = motion;
    motion.onfinish = () => { if (frame.current && mode !== 'hide') frame.current.style.height = `${contents.current?.scrollHeight || 0}px`; };
    let request;
    const hold = () => {
      if (from.scroll > 0 && from.anchor?.getBoundingClientRect && from.top != null) { const delta = from.anchor.getBoundingClientRect().top - from.top; if (Math.abs(delta) > 1) window.scrollBy(0, delta); }
      if (motion.playState === 'running') request = window.requestAnimationFrame(hold);
    };
    request = window.requestAnimationFrame(hold);
    return () => { window.cancelAnimationFrame(request); };
  }, [mode, day, items, marginOpen]);
  useLayoutEffect(() => {
    const measure = () => { if (frame.current && mode !== 'hide' && animation.current?.playState !== 'running') frame.current.style.height = `${contents.current?.scrollHeight || 0}px`; };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (contents.current) observer?.observe(contents.current); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [mode]);
  const archivedLabel = item => folders.find(folder => folder._id === (item.folder?._id || item.folder))?.archivedAt ? ' · Archived folder' : '';
  const taskRow = item => <div className={`work-planner-task ${item.completed ? 'is-done' : ''}`} key={item.id}><label><input type="checkbox" checked={item.completed} onChange={() => onAction(item.clientId, { type: item.completed ? 'reopen' : 'complete' })} /><span>{item.title}{archivedLabel(item)}{item.previousPlannedOn && item.previousPlannedOn !== item.plannedOn ? <small>From {displayDay(item.previousPlannedOn, { weekday: 'short', day: 'numeric' })}</small> : null}{item.dueOn && item.dueOn < today && !item.completed ? <small>Due {displayDay(item.dueOn)} · overdue</small> : null}{item.pending ? <small>Pending sync</small> : null}</span></label><button aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}>{item.conflicted ? 'Review both versions' : <WorkIcon name="more" />}</button></div>;
  const weekTitle = `${displayDay(days[0], { month: 'long' })} ${displayDay(days[0], { day: 'numeric' })}–${days[0].slice(0, 7) !== days[6].slice(0, 7) ? displayDay(days[6], { month: 'short' }) + ' ' : ''}${displayDay(days[6], { day: 'numeric' })}, ${days[6].slice(0, 4)}`;
  return <section className={`work-calendar mode-${mode}`} aria-label="Work planner">
    <header className="work-calendar-heading"><div><h1>{weekTitle}</h1>{scopeLabel ? <small>{scopeLabel}</small> : null}</div><nav aria-label="Calendar navigation"><button aria-label="Previous week" onClick={() => onDay(shiftDay(day, -7))}><WorkIcon name="previous" /></button><button aria-label="Next week" onClick={() => onDay(shiftDay(day, 7))}><WorkIcon name="next" /></button>{day !== today ? <button aria-label="Show today in calendar" onClick={() => onDay(today)}>Today</button> : null}</nav><div role="group" aria-label="Calendar size" className="work-calendar-modes">{['week', 'compact', 'hide'].map(value => <button key={value} aria-pressed={mode === value} onClick={() => selectMode(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></header>
    <div className="work-calendar-fold" ref={frame} inert={mode === 'hide' ? true : undefined} aria-hidden={mode === 'hide' ? true : undefined}>
      <div ref={contents} className="work-calendar-content">
        <div className="work-week-days">{days.map((date, index) => <div className={`work-day ${date === day ? 'is-selected' : ''} ${index > 4 ? 'is-weekend' : ''}`} key={date}>
          <button className="work-day-heading" data-day={date} onKeyDown={event => { const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!offset) return; event.preventDefault(); const next = shiftDay(date, offset); onDay(next); window.requestAnimationFrame(() => document.querySelector(`[data-day="${next}"]`)?.focus({ preventScroll: true })); }} aria-label={displayDay(date)} aria-pressed={date === day} onClick={() => onDay(date)}><span>{displayDay(date, { weekday: 'short' })} / {displayDay(date, { day: 'numeric' })}{date.slice(5, 7) !== days[0].slice(5, 7) ? ` ${displayDay(date, { month: 'short' })}` : ''}</span>{date === day ? <WorkIcon name="bookmark" /> : null}</button>
          {date === day || mode === 'week' ? <small className="work-day-count">{onDate(appointments, date).length ? `${onDate(appointments, date).length} appointments` : ''}{onDate(appointments, date).length && priorities(date).length ? ' · ' : ''}{priorities(date).length ? `${priorities(date).length} priorities` : ''}</small> : null}
          {mode === 'week' ? <div className="work-day-plan">{onDate(appointments, date).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')).map(item => <div className="work-appointment" key={item.id}><button onClick={() => item.noteId ? onOpen(item.noteId) : onEdit(item)}><time>{item.startTime || '—'}</time><span>{item.title}{archivedLabel(item)}</span></button><button aria-label={`Edit appointment ${item.title}`} onClick={() => onEdit(item)}><WorkIcon name="more" /></button></div>)}{plan(date).map(taskRow)}<button className="work-day-add" aria-label={`Plan work for ${displayDay(date)}`} onClick={() => onNew({ plannedOn: date })}><WorkIcon name="plus" /></button></div> : null}
        </div>)}</div>
        <div className="work-day-summary">{selectedAppointments.length ? <><span>{day === today ? 'Today' : displayDay(day, { weekday: 'short' })}:</span>{selectedAppointments.map(item => <button className="work-summary-appointment" key={item.id} onClick={() => item.noteId ? onOpen(item.noteId) : onEdit(item)}>{item.startTime} {item.title}</button>)}<button className="work-mobile-appointments" onClick={() => selectMode('week')}>{selectedAppointments.length} appointments · View day</button></> : <span>A little room for what matters.</span>}<form className="work-plan-new" onSubmit={event => { event.preventDefault(); const line = event.currentTarget.elements.plan; if (line.value.trim()) onPlan(line.value); else onNew({ plannedOn: day }); line.value = ''; }}><input name="plan" aria-label="Plan something" placeholder="Plan something" title="A follow-up, or a meeting with a time: ‘IC meeting thu 2pm’. Enter on an empty line opens the full form." /></form></div>
        {mode === 'compact' && plan(day).length ? <div className="work-day-tasks">{plan(day).map(taskRow)}</div> : null}
        {earlier.length ? <button className="work-carry-review" onClick={() => onCarry(earlier)}>{earlier.length} unfinished from earlier days · Review</button> : null}
        <details className="work-day-margin" open={marginOpen} onToggle={event => setMarginOpen(event.currentTarget.open)}><summary>Day margin</summary>{margin}</details>
      </div>
    </div>
  </section>;
}
