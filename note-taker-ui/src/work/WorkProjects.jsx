import React, { useEffect, useState } from 'react';
import { noteTitle } from './workSession';
import { dayInZone, displayDay, writtenDay } from './workPlannerModel';
import { daysBetween, sortedSince } from './workOutstanding';
import { LINK_ROOM, checkInOf, fade, linkHref, project, projects, quiet } from './workProjects';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const short = day => displayDay(day, { day: 'numeric', month: 'short' });
const touched = (day, today) => { const days = daysBetween(day, today); return days === 0 ? 'Today' : days < 7 ? displayDay(day, { weekday: 'short' }) : short(day); };
const owes = item => `${item.waitingOn} owes you ${item.title.charAt(0).toLowerCase()}${item.title.slice(1)}`;
const keyed = event => !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.closest?.('input, textarea, [contenteditable="true"], dialog');

function Line({ item, onAction, aside = null }) {
  return <div className="work-planner-task work-outstanding-row"><label><input type="checkbox" checked={false} onChange={() => onAction(item.clientId, { type: 'complete' })} /><span>{item.title}</span></label>{aside ? <span className="work-carried">{aside}</span> : null}</div>;
}

function Links({ links, onRemove }) {
  return links.map(link => <div className="work-project-link" key={`${link.kind}:${link.id}`}><a href={linkHref(link)}>{link.title || 'Untitled'}</a><small>{LINK_ROOM[link.kind]}</small>{onRemove ? <button onClick={() => onRemove(link)}>Remove</button> : null}</div>);
}

// Every project on one page. Everything open unfolds them all: each open line, who owes what, what is kept with it.
export default function WorkProjects({ records, notes, items, today, onOpen, onAction, onNew }) {
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
  const sense = !rows.length ? 'No projects yet. A project is an effort with an end; its notes can sit in any folder.'
    : [`${groups.active.length === 1 ? 'One' : groups.active.length} active.`, waiting && `${waiting.name} is waiting on ${waiting.waiting[0].waitingOn}.`, dusty.length && `${dusty.map(item => item.name).join(' and ')} ${dusty.length === 1 ? 'has' : 'have'} gone quiet.`].filter(Boolean).join(' ');
  const row = item => { const index = rows.indexOf(item), unfoldedRow = open(item); return <React.Fragment key={item.id}>
    <div className="work-project-row" data-state={item.state} data-fade={fade(item) || undefined} aria-selected={index === selected} onMouseEnter={() => setSelected(index)}>
      <button className="work-project-fold" aria-expanded={unfoldedRow} aria-label={`${unfoldedRow ? 'Fold' : 'Unfold'} ${item.name}`} onClick={() => toggle(item)} />
      <button className="work-project-name" onClick={() => onOpen(item.id)}>{item.name}</button>
      <span className="work-project-next">{item.state === 'done' ? item.record.closingLine || `Done ${short(item.touched)}.` : <>{quiet(item) ? <em>Quiet for {plural(Math.floor(item.idle / 7), 'week')}. </em> : null}{item.next[0]?.title || (item.waiting[0] ? owes(item.waiting[0]) : 'Nothing next yet.')}</>}</span>
      <span className="work-project-count" aria-label={`${plural(item.next.length, 'open line')}`}>{item.next.length || ''}</span>
      <span className="work-project-count" aria-label={`${plural(item.waiting.length, 'line')} waiting`}>{item.waiting.length || ''}</span>
      <time>{touched(item.touched, today)}</time>
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
    {rows.length ? <div className="work-project-tools"><span role="group" aria-label="Show"><button aria-pressed={!everything} onClick={() => { setEverything(false); setUnfolded(new Set()); }}>Projects</button><button aria-pressed={everything} onClick={() => setEverything(true)}>Everything open</button></span><small>Open</small><small>Waiting</small><small>Touched</small></div> : null}
    {group('Active', groups.active)}{group('Paused', groups.paused)}{group('Done', groups.done)}
    {rows.length ? <p className="work-project-keys"><kbd>j</kbd> <kbd>k</kbd> to move, <kbd>↵</kbd> to open, <kbd>→</kbd> to unfold, <kbd>e</kbd> for everything open</p> : null}
  </section>;
}

// One project, laid out the same way every time: what it is, this week's question, its log on the left,
// and on the right what is next, what is coming, what was decided and what is kept with it.
export function WorkProject({ record, notes, items, today, onAction, onCapture, onOpenNote, onNewNote, onSave }) {
  const item = project(record, notes, items, today);
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
  const state = (label, value, patch) => <button aria-pressed={item.state === value} onClick={() => item.state === value ? null : value === 'done' ? setClosing('') : onSave(record, patch)}>{label}</button>;
  const sense = item.state === 'done' ? `Done ${displayDay(dayInZone(record.archivedAt))}.` : [plural(item.next.length, 'thing') + ' open', item.waiting.length ? `waiting on ${[...new Set(item.waiting.map(line => line.waitingOn))].join(' and ')}` : '', `last touched ${touched(item.touched, today).toLowerCase()}`].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + '.';
  return <section className="work-outstanding work-project" aria-label={record.name}><h1 className="work-page-title">{record.name}</h1><p className="work-page-sense">{sense}</p>
    <textarea className="work-project-brief" aria-label={`What ${record.name} is`} placeholder="What this project is, and what done looks like" value={brief} rows={2} ref={grow} onChange={event => setBrief(event.target.value)} onBlur={saveBrief} />
    {item.state === 'active' ? <form className="work-project-checkin" aria-label="This week’s check-in" onSubmit={answerCheckIn}><small>Monday check-in</small><q>What would move {record.name} this week?</q>
      {answered ? <p>{answered.text}<small>Answered {displayDay(answered.on, { weekday: 'short', day: 'numeric' })}</small></p> : <input aria-label={`What would move ${record.name} this week?`} placeholder="One line, filed in the log" value={answer} onChange={event => setAnswer(event.target.value)} />}</form> : null}
    <div className="work-project-page">
      <section aria-label="Log"><h2>Log</h2>{item.log.map((entry, index) => <button className="work-log-entry" key={`${entry.note?.clientId || 'check-in'}:${entry.day}:${index}`} disabled={!entry.note} onClick={() => onOpenNote(entry.note.clientId)}><small>{displayDay(entry.day, { weekday: 'short', day: 'numeric', month: 'short' })} · {entry.checkIn ? 'Monday check-in' : noteTitle(entry.note)}</small><span>{entry.text}</span></button>)}
        {item.log.length ? null : <p className="work-outstanding-line">Nothing written yet. Notes in any folder can be part of {record.name}; their dated entries read here.</p>}
        {item.state === 'done' ? null : <button className="work-project-add" onClick={onNewNote}>New note in {record.name}</button>}</section>
      <div>
        <section aria-label="Next"><h2>Next</h2>{item.next.map(line => <Line key={line.id} item={line} onAction={onAction} aside={<>{line.plannedOn ? <time>{short(line.plannedOn)}</time> : null}{noteOf(line) ? <button onClick={() => onOpenNote(noteOf(line).clientId)}>{noteTitle(noteOf(line))}</button> : null}</>} />)}
          {item.waiting.map(line => <Line key={line.id} item={{ ...line, title: owes(line) }} onAction={onAction} aside={<time>{plural(daysBetween(sortedSince(line), today), 'day')}</time>} />)}
          {item.state === 'done' ? null : <form className="work-outstanding-capture" onSubmit={event => { event.preventDefault(); if (line.trim()) { onCapture(line, record._id); setLine(''); } }}><input aria-label={`Add a line to ${record.name}`} placeholder="Add a line" value={line} onChange={event => setLine(event.target.value)} /><small>@name if someone owes you · a day to plan it</small></form>}</section>
        {item.schedule.length ? <section aria-label="Schedule"><h2>Schedule</h2>{item.schedule.map(line => <p className="work-project-decision" key={line.id}>{displayDay(line.plannedOn || line.dueOn, { weekday: 'short', day: 'numeric', month: 'short' })} · {line.startTime ? `${line.startTime} ` : ''}{line.title}<small>{line.kind === 'appointment' ? 'meeting' : line.plannedOn ? 'planned' : 'due'}</small></p>)}</section> : null}
        {item.decisions.length ? <section aria-label="Decided"><h2>Decided</h2>{item.decisions.map(({ text, note }, index) => <p className="work-project-decision" key={`${note.clientId}:${index}`}>{text}<button onClick={() => onOpenNote(note.clientId)}>{displayDay(writtenDay(note), { day: 'numeric', month: 'short' })}</button></p>)}</section> : null}
        <section aria-label="Kept"><h2>Kept</h2><Links links={item.links} onRemove={link => onSave(record, { links: item.links.filter(other => other !== link) })} />
          <p className="work-outstanding-line">{item.links.length ? 'Add more' : 'Keep an article, wiki page or book here'} with Add to project on its page.</p></section>
        <section className="work-project-margin" aria-label="About this project"><small>State</small><p className="work-project-state">{state('Active', 'active', { paused: false, archived: false })}{state('Paused', 'paused', { paused: true, archived: false })}{state('Done', 'done')}</p>
          {closing !== null ? <form className="work-project-closing" onSubmit={event => { event.preventDefault(); onSave(record, { archived: true, paused: false, closingLine: closing.trim() }).then(saved => { if (saved) setClosing(null); }); }}><label>One line on how it ended<textarea autoFocus rows={2} value={closing} onChange={event => setClosing(event.target.value)} placeholder="We passed, and the churn question answered itself." /></label><button>Mark done</button><button type="button" onClick={() => setClosing(null)}>Not yet</button></form> : null}
          {item.state === 'done' && record.closingLine ? <blockquote>{record.closingLine}</blockquote> : null}</section>
      </div>
    </div>
  </section>;
}
