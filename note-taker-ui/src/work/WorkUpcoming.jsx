import React from 'react';
import { displayDay, validDay } from './workPlannerModel';
import { matchesQuery } from './workSession';
import { WorkTaskRow, WorkAppointmentRow } from './WorkPlanItem';

export default function WorkUpcoming({ items, today, folders, projects, query, onDay, onStart, onEdit, onAction, onNew }) {
  const upcoming = items.filter(item => item.kind !== 'jot' && !item.completed && matchesQuery(item, query)).map(item => ({ item, day: [item.plannedOn, item.dueOn].filter(day => validDay(day) && day > today).sort()[0] })).filter(entry => entry.day).sort((a, b) => a.day.localeCompare(b.day) || (a.item.startTime || '24:00').localeCompare(b.item.startTime || '24:00') || (a.item.priority || 4) - (b.item.priority || 4));
  const days = [...new Set(upcoming.map(entry => entry.day))];
  return <section className="work-upcoming" aria-label="Upcoming work"><header><h1 className="work-page-title">Upcoming</h1><p className="work-page-sense">Your planned work and due dates ahead.</p></header>
    {days.length ? days.map(day => <section className="work-upcoming-day" key={day} aria-label={displayDay(day, { day: 'numeric', month: 'long', year: 'numeric' })}><h2><button onClick={() => onDay(day)}><time dateTime={day}>{displayDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</time></button></h2>{upcoming.filter(entry => entry.day === day).map(({ item }) => item.kind === 'appointment' ? <WorkAppointmentRow key={item.id} item={item} folders={folders} projects={projects} onStart={onStart} onEdit={onEdit} /> : <React.Fragment key={item.id}><WorkTaskRow item={item} today={today} folders={folders} onAction={onAction} onEdit={onEdit} />{item.dueOn === day && item.plannedOn !== day ? <p className="work-upcoming-due">Due {displayDay(day)}</p> : null}</React.Fragment>)}</section>) : <p className="work-empty">{query ? 'No upcoming work matches this phrase.' : 'Nothing planned ahead.'}</p>}
    <button className="work-upcoming-add" onClick={() => onNew()}>Plan something</button>
  </section>;
}
