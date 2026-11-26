import WorkProjectActions from './WorkProjectActions';
import WorkInlineRename from './WorkInlineRename';
import WorkNoteActions from './WorkNoteActions';
import React, { useEffect, useRef, useState } from 'react';
import { KeptBeside } from '../components/home/Depths';
import { noteTitle } from './workSession';
import WorkIcon from './WorkIcon';
import './work-project.css';
import { dayInZone, displayDay, shiftDay, weekDays, writtenDay } from './workPlannerModel';
import { daysBetween, sortedSince } from './workOutstanding';
import { LINK_ROOM, checkInOf, fade, linkHref, project, projects, quiet } from './workProjects';
import { hangingDate, timeBetween } from './workNoteEntries';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const short = day => displayDay(day, { day: 'numeric', month: 'short' });
const touched = (day, today) => { const days = daysBetween(day, today); return days === 0 ? 'today' : days < 7 ? displayDay(day, { weekday: 'short' }) : short(day); };
const HangingDate = ({ day }) => <span className="work-hang-date">{hangingDate(day).map((part, index) => index === 1 ? <b key={index}>{part}</b> : <small key={index}>{part}</small>)}</span>;
const capital = text => text.replace(/^./, c => c.toUpperCase());
const owes = item => `${item.waitingOn} owes you ${item.title.charAt(0).toLowerCase()}${item.title.slice(1)}`;
const keyed = event => !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.closest?.('input, textarea, [contenteditable="true"], dialog');

function Line({ item, onAction, aside = null }) {
  return <div className="work-planner-task work-outstanding-row"><label><input type="checkbox" checked={false} onChange={() => onAction(item.clientId, { type: 'complete' })} /><span>{item.title}</span></label>{aside ? <span className="work-carried">{aside}</span> : null}</div>;
}

function Links({ links, onRemove }) {
  return links.map(link => <div className="work-project-link" key={`${link.kind}:${link.id}`}><a href={linkHref(link)}>{link.title || 'Untitled'}</a><small>{LINK_ROOM[link.kind]}</small>{onRemove ? <button onClick={() => onRemove(link)}>Remove</button> : null}</div>);
}

// Six weeks to the end of this one, a ruled row per project: a dot for each day it was written in or ticked,
// a ring for a planned line, a square for a meeting, a tick for a decision. Click a marked day to open it.
const WEEKS = 6;
function Lineup({ rows, today, onDay }) {
  const days = Array.from({ length: WEEKS * 7 }, (_, index) => shiftDay(weekDays(today)[6], index - WEEKS * 7 + 1));
  const mark = (item, on) => item.marks.meetings.includes(on) ? 'meeting' : item.marks.touched.includes(on) ? 'touched' : item.marks.planned.includes(on) ? 'planned' : '';
  return <section className="work-lineup" aria-label="Six weeks"><h2>Six weeks</h2>
    <div className="work-lineup-row work-lineup-weeks" aria-hidden="true"><span />{days.map((on, index) => <span key={on}>{index % 7 ? '' : displayDay(on, { day: 'numeric', month: index ? undefined : 'short' })}</span>)}</div>
    {rows.map(item => <div className="work-lineup-row" key={item.id} data-state={item.state}><span>{item.name}</span>{days.map(on => { const kind = mark(item, on); const decided = item.marks.decided.includes(on); return kind || decided
      ? <button key={on} data-mark={kind || undefined} data-decided={decided || undefined} aria-current={on === today ? 'date' : undefined} aria-label={`${item.name}, ${displayDay(on)}`} onClick={() => onDay(on)} />
      : <span key={on} aria-current={on === today ? 'date' : undefined} />; })}</div>)}
  </section>;
}

// Every project on one page. Everything open unfolds them all: each open line, who owes what, what is kept with it.
export default function WorkProjects({ records, notes, items, today, onOpen, onAction, onNew, onDay }) {
  const groups = projects(records, notes, items, today);
  const rows = [...groups.active, ...groups.paused, ...groups.done];
  const [everything, setEverything] = useState(false);
  const [unfolded, setUnfolded] = useState(() => new Set());
  const [selected, setSelected] = useState(-1);
  const open = item => everything ? item.state !== 'done' : unfolded.has(item.id);
  const toggle = (item, value = !open(item)) => { if (everything) setEverything(false); setUnfolded(current => { const next = new Set(everything ? rows.filter(row => row.state !== 'done').map(row => row.id) : current); value ? next.add(item.id) : next.delete(item.id); return next; }); };
  useEffect(() => {
    const key = event => {
      if (!keyed(event) || !rows.length) return;
      const at = Math.min(selected, rows.length - 1), row = rows[at];
      const act = { j: () => setSelected(Math.min(rows.length - 1, at + 1)), k: () => setSelected(Math.max(0, at - 1)), e: () => setEverything(value => !value), ...(row ? { Enter: () => onOpen(row.id), ArrowRight: () => toggle(row, true), ArrowLeft: () => toggle(row, false) } : {}) }[event.key];
      if (act) { event.preventDefault(); act(); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  const waiting = groups.active.find(item => item.waiting.length), dusty = groups.active.filter(quiet);
  const sense = !rows.length ? 'No projects yet. A project is anything with an end.'
    : [`${groups.active.length === 1 ? 'One' : groups.active.length} active.`, waiting && `${waiting.name} is waiting on ${waiting.waiting[0].waitingOn}.`, dusty.length && `${dusty.map(item => item.name).join(' and ')} ${dusty.length === 1 ? 'has' : 'have'} gone quiet.`].filter(Boolean).join(' ');
  const row = item => { const index = rows.indexOf(item), unfoldedRow = open(item); return <React.Fragment key={item.id}>
    <div className="work-project-row" data-state={item.state} data-fade={fade(item) || undefined} aria-selected={index === selected} onMouseEnter={() => setSelected(index)}>
      <button className="work-project-fold" aria-expanded={unfoldedRow} aria-label={`${unfoldedRow ? 'Fold' : 'Unfold'} ${item.name}`} onClick={() => toggle(item)} />
      <button className="work-project-name" onClick={() => onOpen(item.id)}>{item.name}</button>
      <span className="work-project-next">{item.state === 'done' ? item.record.closingLine || `Done ${short(item.touched)}.` : <>{quiet(item) ? <em>Quiet for {plural(Math.floor(item.idle / 7), 'week')}. </em> : null}{item.next[0]?.title || (item.waiting[0] ? owes(item.waiting[0]) : 'Nothing next yet.')}</>}</span>
      <span className="work-project-count" aria-label={`${plural(item.next.length, 'open line')}`}>{item.next.length || ''}</span>
      <span className="work-project-count" aria-label={`${plural(item.waiting.length, 'line')} waiting`}>{item.waiting.length || ''}</span>
      <time>{capital(touched(item.touched, today))}</time>
    </div>
    {unfoldedRow ? <div className="work-project-unfolded">
      {item.next.map(line => <Line key={line.id} item={line} onAction={onAction} aside={line.plannedOn ? <time>{short(line.plannedOn)}</time> : null} />)}
      {item.waiting.map(line => <Line key={line.id} item={{ ...line, title: owes(line) }} onAction={onAction} aside={<time>{plural(daysBetween(sortedSince(line), today), 'day')}</time>} />)}
      <Links links={item.links} />
      {!item.next.length && !item.waiting.length && !item.links.length ? <p className="work-outstanding-line">Nothing open here.</p> : null}
    </div> : null}
  </React.Fragment>; };
  const group = (label, list) => list.length ? <section aria-label={label}><h2>{label}</h2>{list.map(row)}</section> : null;
  return <section className="work-outstanding work-projects" aria-label="Projects"><h1 className="work-page-title">Projects</h1><p className="work-page-sense">{sense} <button className="work-project-add" onClick={onNew}>New project</button></p>
    {groups.active.length + groups.paused.length ? <Lineup rows={[...groups.active, ...groups.paused]} today={today} onDay={onDay} /> : null}
    {rows.length ? <div className="work-project-tools"><span role="group" aria-label="Show"><button aria-pressed={!everything} onClick={() => { setEverything(false); setUnfolded(new Set()); }}>Projects</button><button aria-pressed={everything} onClick={() => setEverything(true)}>Everything open</button></span><small>Open</small><small>Waiting</small><small>Touched</small></div> : null}
    {group('Active', groups.active)}{group('Paused', groups.paused)}{group('Done', groups.done)}
    {rows.length ? <p className="work-project-keys"><kbd>j</kbd> <kbd>k</kbd> to move, <kbd>↵</kbd> to open, <kbd>→</kbd> to unfold, <kbd>e</kbd> for everything open</p> : null}
  </section>;
}

// One project, laid out the same way every time: what it is, this week's question, its log on the left,
// and on the right what is next, what is coming, what was decided and what is kept with it.
export function WorkProject({ record, notes, items, today, onAction, onCapture, onOpenNote, onNewNote, onSave, onEdit, onOpenProject, onRenameNote, onTrashNote, renaming = false, onRenameSave, onRenameCancel, renameBusy = false }) {
  const item = project(record, notes, items, today);
  const header = useRef(null);
  const wasRenaming = useRef(renaming);
  useEffect(() => {
    if (wasRenaming.current && !renaming) header.current?.querySelector('summary')?.focus({ preventScroll: true });
    wasRenaming.current = renaming;
  }, [renaming]);
  const [brief, setBrief] = useState(record.brief || '');
  const [line, setLine] = useState('');
  const [answer, setAnswer] = useState('');
  const [closing, setClosing] = useState(null);
  const noteOf = line => line.noteId && notes.find(note => [note._id, note.clientId].includes(line.noteId));
  const answered = checkInOf(record, today);
  useEffect(() => setBrief(record.brief || ''), [record.brief]);
  // The brief grows with its words, like a page, never a box with a scrollbar.
  const grow = node => { if (node) { node.style.height = 'auto'; node.style.height = `${node.scrollHeight}px`; } };
  const saveBrief = () => { if (brief !== (record.brief || '')) onSave(record, { brief }); };
  const answerCheckIn = event => { event.preventDefault(); if (!answer.trim()) return; onSave(record, { checkIns: [...(record.checkIns || []), { on: today, text: answer.trim() }] }).then(saved => { if (saved) setAnswer(''); }); };
  const changeState = value => {
    if (value === item.state) return;
    if (value === 'done') setClosing('');
    else { setClosing(null); onSave(record, { paused: value === 'paused', archived: false }); }
  };
  const sense = item.state === 'done' ? `Done ${displayDay(dayInZone(record.archivedAt))}.` : capital([plural(item.next.length, 'thing') + ' open', item.waiting.length ? `waiting on ${[...new Set(item.waiting.map(line => line.waitingOn))].join(' and ')}` : '', `last touched ${touched(item.touched, today)}`].filter(Boolean).join(', ')) + '.';
  return <section className="work-outstanding work-project work-project-studio" aria-label={record.name}><header ref={header} className="work-project-head">
    <div className="work-project-title-row"><div className="work-project-title">{renaming ? <WorkInlineRename key={record._id} value={record.name} label="Project name" onSave={onRenameSave} onCancel={onRenameCancel} busy={renameBusy} /> : <h1 className="work-page-title">{record.name}</h1>}</div><select aria-label="Project state" value={item.state} onChange={event => changeState(event.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="done">Done</option></select>{onEdit ? <WorkProjectActions record={record} onOpen={onOpenProject} onAction={onEdit} /> : null}</div>
    <p className="work-page-sense">{sense}</p></header>
    {closing !== null ? <form className="work-project-closing" onSubmit={event => { event.preventDefault(); onSave(record, { archived: true, paused: false, closingLine: closing.trim() }).then(saved => { if (saved) setClosing(null); }); }}><label>One line on how it ended<textarea autoFocus rows={2} value={closing} onChange={event => setClosing(event.target.value)} placeholder="We passed, and the churn question answered itself." /></label><div className="work-actions"><button>Mark done</button><button type="button" onClick={() => setClosing(null)}>Not yet</button></div></form> : null}
    {item.state === 'done' && record.closingLine ? <blockquote className="work-project-ending">{record.closingLine}</blockquote> : null}
    <textarea className="work-project-brief" aria-label={`What ${record.name} is`} placeholder="What this project is, and what done looks like" value={brief} rows={2} ref={grow} onChange={event => setBrief(event.target.value)} onBlur={saveBrief} />
    {item.state === 'active' ? <form className="work-project-checkin" aria-label="This week’s check-in" onSubmit={answerCheckIn}><small>Monday check-in</small><q>What would move {record.name} this week?</q>
      {answered ? <p>{answered.text}<small>Answered {displayDay(answered.on, { weekday: 'short', day: 'numeric' })}</small></p> : <input aria-label={`What would move ${record.name} this week?`} placeholder="One line, filed in the log" value={answer} onChange={event => setAnswer(event.target.value)} />}</form> : null}
    <div className="work-project-page">
      <section aria-label="Log"><div className="work-project-log-heading"><h2>Log</h2>{item.state === 'done' ? null : <button className="work-project-new-note" aria-label={`New note in ${record.name}`} onClick={onNewNote}><WorkIcon name="plus" />New note</button>}</div>{item.log.map((entry, index) => { const gap = index && Math.abs(daysBetween(item.log[index - 1].day, entry.day)); return <React.Fragment key={`${entry.note?.clientId || 'check-in'}:${entry.day}:${index}`}>{gap ? <div className="work-between">{timeBetween(gap)}</div> : null}<div className="work-project-log-row">{index && !gap ? <span className="work-hang-date" /> : <HangingDate day={entry.day} />}<button className="work-log-entry" disabled={!entry.note} onClick={() => onOpenNote(entry.note.clientId, entry.day)}><small><span className="work-log-day">{displayDay(entry.day, { weekday: 'short', day: 'numeric', month: 'short' })} · </span>{entry.checkIn ? 'Monday check-in' : noteTitle(entry.note)}</small><span>{entry.text}</span></button>{entry.note && onRenameNote ? <WorkNoteActions note={entry.note} onRename={onRenameNote} onOpen={onOpenNote} onTrash={onTrashNote} /> : null}</div></React.Fragment>; })}
        {item.log.length ? null : <p className="work-outstanding-line">Nothing written yet. Add a note to {record.name} and it shows up here.</p>}
      </section>
      <div className="work-project-context">
        <section aria-label="Next"><h2>Next</h2>{item.next.map(line => <Line key={line.id} item={line} onAction={onAction} aside={<>{line.plannedOn ? <time>{short(line.plannedOn)}</time> : null}{noteOf(line) ? <button onClick={() => onOpenNote(noteOf(line).clientId)}>{noteTitle(noteOf(line))}</button> : null}</>} />)}
          {item.waiting.map(line => <Line key={line.id} item={{ ...line, title: owes(line) }} onAction={onAction} aside={<time>{plural(daysBetween(sortedSince(line), today), 'day')}</time>} />)}
          {item.state === 'done' ? null : <form className="work-outstanding-capture" onSubmit={event => { event.preventDefault(); if (line.trim()) { onCapture(line, record._id); setLine(''); } }}><input aria-label={`Add a line to ${record.name}`} placeholder="Add a line" value={line} onChange={event => setLine(event.target.value)} /><small>@name if someone owes you · a day to plan it</small></form>}</section>
        {item.schedule.length ? <section aria-label="Schedule"><h2>Schedule</h2>{item.schedule.map(line => <p className="work-project-decision" key={line.id}>{displayDay(line.on, { weekday: 'short', day: 'numeric', month: 'short' })} · {line.startTime ? `${line.startTime} ` : ''}{line.title}<small>{line.kind === 'appointment' ? 'meeting' : line.on === line.plannedOn ? 'planned' : 'due'}</small></p>)}</section> : null}
        {item.decisions.length ? <section aria-label="Decided"><h2>Decided</h2>{item.decisions.map(({ text, note }, index) => <p className="work-project-decision" key={`${note.clientId}:${index}`}>{text}<button onClick={() => onOpenNote(note.clientId)}>{displayDay(writtenDay(note), { day: 'numeric', month: 'short' })}</button></p>)}</section> : null}
        <section aria-label="Kept"><h2>Kept</h2><Links links={item.links} onRemove={link => onSave(record, { links: item.links.filter(other => other !== link) })} />
          <p className="work-outstanding-line">To keep {item.links.length ? 'another' : 'an'} article, book or page here, open it and choose Add to project.</p>
          {record.keptBeside ? <KeptBeside className="work-project-beside" label="From what you keep for good" text={[record.name, record.brief, answered?.text, ...item.next.map(next => next.title)].filter(Boolean).join(' ')} /> : null}
          <button className="work-project-beside-switch" aria-pressed={Boolean(record.keptBeside)} onClick={() => onSave(record, { keptBeside: !record.keptBeside })}>{record.keptBeside ? 'Stop showing what you keep for good beside it' : 'Show what you keep for good beside it'}</button>
          <small className="work-project-beside-note">Matched here, read only. Nothing from Work is sent anywhere for it.</small></section>
      </div>
    </div>
  </section>;
}
