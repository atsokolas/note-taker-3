import React, { useState } from 'react';
import WorkItemSource from './WorkItemSource';
import { noteTitle } from './workSession';
import { displayDay, shiftDay, writtenDay } from './workPlannerModel';
import { CHASE_DAYS, daysBetween, nudge, sortedSince } from './workOutstanding';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const short = day => displayDay(day, { weekday: 'short', day: 'numeric', month: 'short' });
const ago = days => days === 0 ? 'today' : days === 1 ? 'a day' : `${days} days`;

// Needs you: every line and project that is waiting on a decision from you, on one page.
// Every row is a line a note or a day already holds; sorting one changes it everywhere it appears.
export default function WorkNeedsYou({ needs, notes, folders, today, onSort, onAction, onCapture, onOpen, onProject, onSaveProject, onWeekEdition }) {
  const [capture, setCapture] = useState('');
  const [asking, setAsking] = useState(null);
  const [drafting, setDrafting] = useState(null);
  const [copied, setCopied] = useState('');
  const [struck, setStruck] = useState({});
  const [reading, setReading] = useState({ busy: false, message: '' });
  const noteOf = item => item.noteId && notes.find(note => [note._id, note.clientId].includes(item.noteId));
  const folderOf = item => item.folder?._id || item.folder || '';
  // Ticking draws a pen stroke through the words and leaves the line in place a moment, with Undo.
  const tick = item => { const operation = onAction(item.clientId, { type: 'complete' }); if (!operation) return; setStruck(current => ({ ...current, [item.id]: { item, operation } })); window.setTimeout(() => setStruck(({ [item.id]: _, ...rest }) => rest), 5000); };
  const sort = (item, patch) => { setAsking(null); onSort(item.clientId, { sortedOn: today, ...patch }); };
  const source = item => { if (item.origin) return <WorkItemSource origin={item.origin} />; const note = noteOf(item); return note ? <button className="work-outstanding-source" onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null; };
  const row = (item, aside, extra = null) => <React.Fragment key={item.id}><div className="work-planner-task work-outstanding-row">
    <label><input type="checkbox" checked={false} onChange={() => tick(item)} /><span>{item.title}</span></label>
    <span className="work-carried">{aside}</span></div>{extra}</React.Fragment>;
  const struckRows = Object.values(struck).map(({ item, operation }) => <div className="work-planner-task work-outstanding-row is-struck" key={`struck-${item.id}`}><label><input type="checkbox" checked readOnly /><span>{item.title}</span></label><span className="work-carried"><button onClick={() => { onAction(item.clientId, { type: 'undo', undoOf: operation }); setStruck(({ [item.id]: _, ...rest }) => rest); }}>Undo</button></span></div>);
  const sorting = item => asking === item.id
    ? <form className="work-outstanding-ask" onSubmit={event => { event.preventDefault(); const name = event.currentTarget.elements.person.value.trim(); if (name) sort(item, { list: 'waiting', waitingOn: name }); }}><input name="person" aria-label={`Who is ${item.title} waiting on?`} placeholder="Waiting on whom?" autoFocus /><button>Save</button><button type="button" onClick={() => setAsking(null)}>Cancel</button></form>
    : <span className="work-outstanding-sort"><button onClick={() => { onAction(item.clientId, { type: 'plan', plannedOn: today }); sort(item, { list: 'next', returnOn: null }); }}>Today</button><button onClick={() => sort(item, { list: 'next', returnOn: null })}>Next</button><button onClick={() => setAsking(item.id)}>Waiting on…</button><button onClick={() => sort(item, { list: 'someday', returnOn: null })}>Someday</button><button onClick={() => tick(item)}>Done</button></span>;
  const freshRow = item => <div className="work-planner-task work-outstanding-row is-new" key={item.id}><label><input type="checkbox" checked={false} onChange={() => tick(item)} /><span>{item.title}<small>{item.list === 'someday' ? `Set aside ${short(item.sortedOn)}` : noteOf(item) ? `From ${noteTitle(noteOf(item))}` : 'Added here'}</small></span></label><span className="work-carried"><WorkItemSource origin={item.origin} />{sorting(item)}</span></div>;
  const star = item => <button className="work-outstanding-star" aria-label={`Make ${item.title} today’s one thing`} aria-pressed={item.oneThingOn === today} onClick={() => { if (needs.oneThing && needs.oneThing.id !== item.id) onSort(needs.oneThing.clientId, { oneThingOn: null }); onSort(item.clientId, { oneThingOn: item.oneThingOn === today ? null : today }); }}>{item.oneThingOn === today ? 'Today’s one thing' : 'Make it today’s'}</button>;
  const quietAsk = item => <p className="work-outstanding-quiet">Untouched for {plural(daysBetween(sortedSince(item), today), 'day')}. Still want it?<button onClick={() => sort(item, { list: 'next' })}>Keep</button><button onClick={() => sort(item, { list: 'someday' })}>Someday</button><button onClick={() => tick(item)}>Let it go</button></p>;
  const copy = async (item, text) => { try { await navigator.clipboard.writeText(text); setCopied(item.id); } catch (_) { setCopied(''); } };
  const message = item => nudge(item, noteOf(item) ? displayDay(writtenDay(noteOf(item))) : '');
  const draft = item => drafting === item.id ? <div className="work-outstanding-draft"><p>{message(item)}</p><small>A draft from the line{noteOf(item) ? ' and its note' : ''}.<button onClick={() => copy(item, message(item))}>{copied === item.id ? 'Copied' : 'Copy'}</button><button onClick={() => setDrafting(null)}>Not now</button></small></div> : null;
  const section = (label, list, render, note = null) => list.length ? <section aria-label={label}><h2>{label}{note ? <small>{note}</small> : null}</h2>{list.map(render)}</section> : null;

  // The week read back: a draft this week already holds is offered before a new one.
  const drafted = notes.filter(note => note.tags?.includes('work-edition') && note.occurredOn >= shiftDay(today, -6)).sort((a, b) => String(b.occurredOn).localeCompare(String(a.occurredOn)))[0];
  const readWeek = async () => {
    setReading({ busy: true, message: '' });
    try { const result = await onWeekEdition(); setReading({ busy: false, message: result?.silence || '' }); }
    catch (error) { setReading({ busy: false, message: error.message }); }
  };
  const quietLines = new Set(needs.quiet.map(item => item.id));
  const groups = [...folders.filter(folder => !folder.archivedAt).map(folder => ({ id: folder._id, name: folder.name })), { id: '', name: 'Not in a folder' }].map(group => ({ ...group, lines: needs.next.filter(item => !quietLines.has(item.id) && ((folderOf(item) || '') === group.id || (!group.id && !folders.some(folder => !folder.archivedAt && folder._id === folderOf(item))))) })).filter(group => group.lines.length);
  const longest = [...needs.waiting].sort((a, b) => sortedSince(a).localeCompare(sortedSince(b)))[0];
  const sense = !needs.total ? 'Nothing needs you. Rare, and well earned.'
    : [`${needs.total === 1 ? 'One thing' : `${needs.total} things`}.`, longest && daysBetween(sortedSince(longest), today) >= CHASE_DAYS && `${longest.waitingOn} has owed you ${longest.title.charAt(0).toLowerCase()}${longest.title.slice(1)} for ${plural(daysBetween(sortedSince(longest), today), 'day')}.`, needs.silent[0] && `${needs.silent.map(item => item.name).join(' and ')} ${needs.silent.length === 1 ? 'has' : 'have'} gone quiet.`].filter(Boolean).join(' ');
  return <section className="work-outstanding" aria-label="Needs you"><h1 className="work-page-title">Needs you</h1><p className="work-page-sense">{sense}</p>
    <form className="work-outstanding-capture" onSubmit={event => { event.preventDefault(); if (capture.trim()) { onCapture(capture); setCapture(''); } }}><input aria-label="Add a line" placeholder="Add a line" value={capture} onChange={event => setCapture(event.target.value)} /><small>@name if someone owes you · a day to plan it · “someday” to set it aside</small></form>
    {needs.oneThing ? <p className="work-one-thing"><small>Today’s one thing</small><span>{needs.oneThing.title}</span></p> : null}
    {struckRows}
    {section('New from your notes', needs.fresh, freshRow, 'sort each once')}
    {section('Owed to you', needs.waiting, item => { const days = daysBetween(sortedSince(item), today); return row({ ...item, title: `${item.waitingOn} owes you ${item.title.charAt(0).toLowerCase()}${item.title.slice(1)}` }, <><time className={days >= CHASE_DAYS ? 'is-long' : ''}>{ago(days)}</time>{source(item)}<button onClick={() => setDrafting(drafting === item.id ? null : item.id)}>Nudge</button></>, draft(item)); })}
    {needs.silent.length || needs.quiet.length ? <section aria-label="Gone quiet"><h2>Gone quiet</h2>
      {needs.silent.map(item => <p className="work-needs-project" key={item.id}><button onClick={() => onProject(item.id)}>{item.name}</button><span>Untouched for {plural(Math.floor(item.idle / 7), 'week')}{item.next[0] ? `. Next: ${item.next[0].title}` : ''}.</span><span className="work-carried"><button onClick={() => onProject(item.id)}>Write one line</button><button onClick={() => onSaveProject(item.record, { paused: true })}>Pause</button></span></p>)}
      {needs.quiet.map(item => row(item, source(item), quietAsk(item)))}</section> : null}
    {section('Back from Someday', needs.back, freshRow)}
    <section aria-label="Check-in"><h2>Check-in<small>Fridays</small></h2><p className="work-needs-question">What happened this week?</p>
      <p className="work-outstanding-line">{drafted ? <>{noteTitle(drafted)} is drafted. <button onClick={() => onOpen(drafted.clientId)}>Open it</button><button disabled={reading.busy} onClick={readWeek}>{reading.busy ? 'Reading the week…' : 'Draft again'}</button></> : <><button disabled={reading.busy} onClick={readWeek}>{reading.busy ? 'Reading the week…' : 'Read the week back'}</button> drafts an Edition of your last seven days: what got done, decisions, open threads.</>}</p>
      <p className="work-outstanding-line">{reading.message ? <span role="status">{reading.message}</span> : 'Only Claude reads these notes, and the draft stays here in Work.'}</p></section>
    {groups.length ? <details className="work-needs-rest"><summary>Next <span>({groups.reduce((sum, group) => sum + group.lines.length, 0)})</span></summary>{groups.map(group => <React.Fragment key={group.id || 'loose'}><h3>{group.name}</h3>{group.lines.map(item => row(item, <>{item.plannedOn ? <time>{short(item.plannedOn)}</time> : null}{source(item)}{star(item)}</>))}</React.Fragment>)}</details> : null}
    {needs.someday.length ? <details className="work-needs-rest"><summary>Someday <span>({needs.someday.length})</span></summary>{needs.someday.map(item => row(item, <>{item.returnOn ? <time>Back {short(item.returnOn)}</time> : <label className="work-outstanding-back">Bring back<input type="date" aria-label={`Bring back ${item.title} on`} min={shiftDay(today, 1)} onChange={event => event.target.value && onSort(item.clientId, { returnOn: event.target.value })} /></label>}<button onClick={() => sort(item, { list: 'next', returnOn: null })}>Start now</button></>))}</details> : null}
    {needs.done ? <details className="work-needs-rest"><summary>Done this week <span>({needs.done})</span></summary><dl className="work-ledger">{needs.ledger.map(entry => <React.Fragment key={entry.day}><dt>{displayDay(entry.day, { weekday: 'long' })}</dt><dd>{entry.items.map((item, index) => <React.Fragment key={item.id}>{index ? ' · ' : ''}<s>{item.title}</s></React.Fragment>)}</dd></React.Fragment>)}</dl>
      {needs.gotBack.map(({ item, days }) => <p className="work-outstanding-line" key={item.id}>{item.waitingOn} sent {item.title.charAt(0).toLowerCase() + item.title.slice(1)}{days > 0 ? `, after ${plural(days, 'day')}` : ''}.</p>)}
      <p className="work-outstanding-tally">{plural(needs.done, 'thing')} closed this week{needs.lastWeek ? `, ${needs.done === needs.lastWeek ? 'the same as' : needs.done > needs.lastWeek ? `${needs.done - needs.lastWeek} more than` : `${needs.lastWeek - needs.done} fewer than`} last week` : ''}.</p></details> : null}
  </section>;
}

// At the end of today, what is still open from it goes to tomorrow, Monday or Someday, and one sentence says how tomorrow starts.
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
