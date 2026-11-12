import React, { useState } from 'react';
import WorkItemSource from './WorkItemSource';
import { noteTitle } from './workSession';
import { displayDay, shiftDay, writtenDay } from './workPlannerModel';
import { CHASE_DAYS, daysBetween, nudge, outstanding, sortedSince } from './workOutstanding';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const short = day => displayDay(day, { weekday: 'short', day: 'numeric', month: 'short' });
const ago = days => days === 0 ? 'today' : days === 1 ? 'a day' : `${days} days`;

// The second part of Work: what is outstanding, who owes you, what is set aside, and the Friday review.
// Every row is a line a note or a day already holds; sorting one changes it everywhere it appears.
export default function WorkOutstanding({ view, items, notes, folders, today, inbox, reviewedOn, onReviewed, onSort, onAction, onCapture, onOpen, onScope, onWeekEdition }) {
  const [capture, setCapture] = useState('');
  const [asking, setAsking] = useState(null);
  const [drafting, setDrafting] = useState(null);
  const [copied, setCopied] = useState('');
  const [struck, setStruck] = useState({});
  const [nextStep, setNextStep] = useState({});
  const [reading, setReading] = useState({ busy: false, message: '' });
  const lists = outstanding(items, notes, today);
  const noteOf = item => item.noteId && notes.find(note => [note._id, note.clientId].includes(item.noteId));
  const folderOf = item => item.folder?._id || item.folder || '';
  // Ticking draws a pen stroke through the words and leaves the line in place a moment, with Undo.
  const tick = item => { const operation = onAction(item.clientId, { type: 'complete' }); if (!operation) return; setStruck(current => ({ ...current, [item.id]: { item, operation } })); window.setTimeout(() => setStruck(({ [item.id]: _, ...rest }) => rest), 5000); };
  const sort = (item, patch) => { setAsking(null); onSort(item.clientId, { sortedOn: today, ...patch }); };
  const source = item => { if (item.origin) return <WorkItemSource origin={item.origin} />; const note = noteOf(item); return note ? <button className="work-outstanding-source" onClick={() => onOpen(note.clientId)}>{noteTitle(note)}</button> : null; };
  const row = (item, aside, extra = null) => <React.Fragment key={item.id}><div className={`work-planner-task work-outstanding-row ${item.quiet ? 'is-quiet' : ''}`}>
    <label><input type="checkbox" checked={false} onChange={() => tick(item)} /><span>{item.list === 'waiting' && view !== 'waiting' ? `${item.waitingOn} · ` : ''}{item.title}</span></label>
    <span className="work-carried">{aside}</span></div>{extra}</React.Fragment>;
  const struckRows = Object.values(struck).map(({ item, operation }) => <div className="work-planner-task work-outstanding-row is-struck" key={`struck-${item.id}`}><label><input type="checkbox" checked readOnly /><span>{item.title}</span></label><span className="work-carried"><button onClick={() => { onAction(item.clientId, { type: 'undo', undoOf: operation }); setStruck(({ [item.id]: _, ...rest }) => rest); }}>Undo</button></span></div>);
  const sorting = item => asking === item.id
    ? <form className="work-outstanding-ask" onSubmit={event => { event.preventDefault(); const name = event.currentTarget.elements.person.value.trim(); if (name) sort(item, { list: 'waiting', waitingOn: name }); }}><input name="person" aria-label={`Who is ${item.title} waiting on?`} placeholder="Waiting on whom?" autoFocus /><button>Save</button><button type="button" onClick={() => setAsking(null)}>Cancel</button></form>
    : <span className="work-outstanding-sort"><button onClick={() => sort(item, { list: 'next', returnOn: null })}>Next</button><button onClick={() => setAsking(item.id)}>Waiting on…</button><button onClick={() => sort(item, { list: 'someday', returnOn: null })}>Someday</button><button onClick={() => tick(item)}>Done</button></span>;
  const freshRow = item => <div className="work-planner-task work-outstanding-row is-new" key={item.id}><label><input type="checkbox" checked={false} onChange={() => tick(item)} /><span>{item.title}<small>{item.list === 'someday' ? `Back from Someday, set aside ${short(item.sortedOn)}` : noteOf(item) ? `From ${noteTitle(noteOf(item))}` : 'Added here'}</small></span></label><span className="work-carried"><WorkItemSource origin={item.origin} />{sorting(item)}</span></div>;
  const star = item => <button className="work-outstanding-star" aria-label={`Make ${item.title} today’s one thing`} aria-pressed={item.oneThingOn === today} onClick={() => { if (lists.oneThing && lists.oneThing.id !== item.id) onSort(lists.oneThing.clientId, { oneThingOn: null }); onSort(item.clientId, { oneThingOn: item.oneThingOn === today ? null : today }); }}>{item.oneThingOn === today ? 'Today’s one thing' : 'Make it today’s'}</button>;
  const quietAsk = item => <p className="work-outstanding-quiet">Untouched for {plural(daysBetween(sortedSince(item), today), 'day')}. Still want it?<button onClick={() => sort(item, { list: 'next' })}>Keep</button><button onClick={() => sort(item, { list: 'someday' })}>Someday</button><button onClick={() => tick(item)}>Let it go</button></p>;
  const nextMeeting = person => items.filter(item => item.kind === 'appointment' && !item.completed && item.plannedOn >= today && `${item.title} ${item.withText || ''}`.toLowerCase().includes(person.toLowerCase().split(/\s+/)[0])).sort((a, b) => `${a.plannedOn}${a.startTime}`.localeCompare(`${b.plannedOn}${b.startTime}`))[0];
  const copy = async (item, text) => { try { await navigator.clipboard.writeText(text); setCopied(item.id); } catch (_) { setCopied(''); } };
  const draft = item => drafting === item.id ? <div className="work-outstanding-draft"><p>{nudge(item, noteOf(item) ? displayDay(writtenDay(noteOf(item))) : '')}</p><small>A draft from the line{noteOf(item) ? ' and its note' : ''}.<button onClick={() => copy(item, nudge(item, noteOf(item) ? displayDay(writtenDay(noteOf(item))) : ''))}>{copied === item.id ? 'Copied' : 'Copy'}</button><button onClick={() => setDrafting(null)}>Not now</button></small></div> : null;

  if (view === 'waiting') {
    const people = [...new Set(lists.waiting.map(item => item.waitingOn.trim()))].map(person => ({ person, lines: lists.waiting.filter(item => item.waitingOn.trim() === person).sort((a, b) => sortedSince(a).localeCompare(sortedSince(b))) })).sort((a, b) => sortedSince(a.lines[0]).localeCompare(sortedSince(b.lines[0])));
    const sense = !people.length ? 'Nobody owes you anything right now.' : people.length === 1 ? `${people[0].person} owes you ${plural(people[0].lines.length, 'thing')}.` : `${people.length} people owe you something. ${people[0].person}’s has waited longest.`;
    return <section className="work-outstanding" aria-label="Waiting on"><h1 className="work-page-title">Waiting on</h1><p className="work-page-sense">{sense}</p>
      {people.map(({ person, lines }) => { const meeting = nextMeeting(person); return <section key={person} className="work-outstanding-person"><header><h2>{person}</h2><small>{meeting ? `Next: ${meeting.title}, ${short(meeting.plannedOn)}` : 'No meeting planned'}</small></header>
        {lines.map(item => { const days = daysBetween(sortedSince(item), today); return row(item, <><time className={days >= CHASE_DAYS ? 'is-long' : ''}>{ago(days)}</time>{source(item)}<button onClick={() => setDrafting(drafting === item.id ? null : item.id)}>Nudge</button></>, draft(item)); })}</section>; })}
      {struckRows}
      {lists.gotBack.length ? <section><h2>Got it back</h2>{lists.gotBack.map(({ item, days }) => <p className="work-outstanding-line" key={item.id}>{item.waitingOn} sent {item.title.charAt(0).toLowerCase() + item.title.slice(1)}{days > 0 ? `, after ${plural(days, 'day')}` : ''}.</p>)}</section> : null}
    </section>;
  }

  if (view === 'someday') {
    const back = lists.someday.filter(item => item.returnOn).sort((a, b) => a.returnOn.localeCompare(b.returnOn))[0];
    return <section className="work-outstanding" aria-label="Someday"><h1 className="work-page-title">Someday</h1><p className="work-page-sense">{lists.someday.length ? `${plural(lists.someday.length, 'thing')} set aside.${back ? ` ${back.title} comes back ${short(back.returnOn)}.` : ''}` : 'Nothing set aside. Type “someday” at the end of a line to put it here.'}</p>
      {lists.someday.map(item => row(item, <>{item.returnOn ? <time>Back {short(item.returnOn)}</time> : <label className="work-outstanding-back">Bring back<input type="date" aria-label={`Bring back ${item.title} on`} min={shiftDay(today, 1)} onChange={event => event.target.value && onSort(item.clientId, { returnOn: event.target.value })} /></label>}<button onClick={() => sort(item, { list: 'next', returnOn: null })}>Start now</button></>))}
      {struckRows}
    </section>;
  }

  if (view === 'review') {
    const since = reviewedOn ? daysBetween(reviewedOn, today) : null;
    const empty = folders.filter(folder => !folder.archivedAt && ![...lists.next, ...lists.new].some(item => folderOf(item) === folder._id));
    const chase = lists.waiting.filter(item => daysBetween(sortedSince(item), today) >= CHASE_DAYS);
    const week = items.filter(item => item.kind === 'appointment' && item.plannedOn > today && item.plannedOn <= shiftDay(today, 7));
    // The week read back: a draft Edition this week already holds is offered before a new one.
    const drafted = notes.filter(note => note.tags?.includes('work-edition') && note.occurredOn >= shiftDay(today, -6)).sort((a, b) => String(b.occurredOn).localeCompare(String(a.occurredOn)))[0];
    const readWeek = async () => {
      setReading({ busy: true, message: '' });
      try { const result = await onWeekEdition(); setReading({ busy: false, message: result?.silence || '' }); }
      catch (error) { setReading({ busy: false, message: error.message }); }
    };
    const step = (n, title, done, body) => <section className={`work-review-step ${done ? 'is-done' : ''}`} key={n}><b>{n}</b><div><h2>{title}</h2>{body}</div></section>;
    return <section className="work-outstanding" aria-label="Weekly review"><h1 className="work-page-title">Weekly review</h1><p className="work-page-sense">{since === null ? 'Seven steps, about fifteen minutes. Each shows only what needs you.' : since === 0 ? 'Reviewed today. Everything below is as you left it.' : `Seven steps, about fifteen minutes. Last done ${displayDay(reviewedOn)}, ${plural(since, 'day')} ago.`}</p>
      {step(1, 'Empty the Inbox', !inbox, <p className="work-outstanding-line">{inbox ? <>{plural(inbox, 'note')} waiting to be filed. <button onClick={() => onScope('inbox', '')}>Open the Inbox</button></> : 'Inbox is clear.'}</p>)}
      {step(2, 'Sort what your notes left open', !lists.new.length, lists.new.length ? <>{lists.new.map(freshRow)}</> : <p className="work-outstanding-line">Every line is sorted.</p>)}
      {step(3, 'Give every folder a next step', !empty.length, empty.length ? empty.map(folder => <form key={folder._id} className="work-outstanding-capture" onSubmit={event => { event.preventDefault(); if (nextStep[folder._id]?.trim()) { onCapture(nextStep[folder._id], folder._id); setNextStep(current => ({ ...current, [folder._id]: '' })); } }}><input aria-label={`Next step for ${folder.name}`} placeholder={`${folder.name} has nothing next. What is the next step?`} value={nextStep[folder._id] || ''} onChange={event => setNextStep(current => ({ ...current, [folder._id]: event.target.value }))} /></form>) : <p className="work-outstanding-line">Every folder has something next.</p>)}
      {step(4, 'Chase what you’re waiting on', !chase.length, chase.length ? chase.map(item => row(item, <><time className="is-long">{ago(daysBetween(sortedSince(item), today))}</time><button onClick={() => setDrafting(drafting === item.id ? null : item.id)}>Nudge</button></>, draft(item))) : <p className="work-outstanding-line">Nothing has waited a week.</p>)}
      {step(5, 'Look at next week', false, <p className="work-outstanding-line">{week.length ? `${plural(week.length, 'meeting')} in the next seven days${week[0] ? `, starting with ${week[0].title} on ${displayDay(week[0].plannedOn, { weekday: 'long' })}` : ''}.` : 'No meetings in the next seven days.'}</p>)}
      {step(6, 'Glance at Someday', false, <p className="work-outstanding-line">{lists.someday.length ? <>{plural(lists.someday.length, 'thing')} set aside. Anything ready to start? <button onClick={() => onScope('someday')}>Open Someday</button></> : 'Nothing set aside.'}</p>)}
      {step(7, 'Read the week back', Boolean(drafted), <><p className="work-outstanding-line">{drafted ? <>{noteTitle(drafted)} is drafted. <button onClick={() => onOpen(drafted.clientId)}>Open it</button><button disabled={reading.busy} onClick={readWeek}>{reading.busy ? 'Reading the week…' : 'Draft again'}</button></> : <>An Edition of your last seven days: what got done, decisions, open threads. <button disabled={reading.busy} onClick={readWeek}>{reading.busy ? 'Reading the week…' : 'Draft the week'}</button></>}</p>
        <p className="work-outstanding-line">{reading.message ? <span role="status">{reading.message}</span> : 'Only Claude reads these notes, and the draft stays here in Work.'}</p></>)}
      {struckRows}
      <p className="work-review-end">{since === 0 ? `Reviewed ${displayDay(today)}.` : <button onClick={onReviewed}>Mark this week reviewed</button>}</p>
    </section>;
  }

  const groups = [...folders.filter(folder => !folder.archivedAt).map(folder => ({ id: folder._id, name: folder.name })), { id: '', name: 'Not in a folder' }].map(group => ({ ...group, lines: lists.next.filter(item => (folderOf(item) || '') === group.id || (!group.id && !folders.some(folder => !folder.archivedAt && folder._id === folderOf(item)))) })).filter(group => group.lines.length);
  const quiet = new Set(lists.quiet.map(item => item.id));
  const sense = !lists.total ? 'Nothing outstanding. Rare, and well earned.' : `${plural(lists.total, 'thing')} outstanding.${lists.new.length ? ` ${lists.new.length === 1 ? 'One came' : `${lists.new.length} came`} from your notes and ${lists.new.length === 1 ? 'isn’t' : 'aren’t'} sorted yet.` : ''}${quiet.size ? ` ${quiet.size === 1 ? 'One has' : `${quiet.size} have`} gone quiet.` : ''}`;
  return <section className="work-outstanding" aria-label="Outstanding"><h1 className="work-page-title">Outstanding</h1><p className="work-page-sense">{sense}</p>
    <form className="work-outstanding-capture" onSubmit={event => { event.preventDefault(); if (capture.trim()) { onCapture(capture); setCapture(''); } }}><input aria-label="Add something outstanding" placeholder="Add something outstanding" value={capture} onChange={event => setCapture(event.target.value)} /><small>@name if someone owes you · a day to plan it · “someday” to set it aside</small></form>
    {lists.oneThing ? <p className="work-one-thing"><small>Today’s one thing</small><span>{lists.oneThing.title}</span></p> : null}
    {struckRows}
    {lists.new.length ? <section aria-label="New from your notes"><h2>New from your notes</h2>{lists.new.map(freshRow)}</section> : null}
    {groups.length ? <section aria-label="Next"><h2>Next</h2>{groups.map(group => <React.Fragment key={group.id || 'loose'}><h3>{group.name}</h3>{group.lines.map(item => row({ ...item, quiet: quiet.has(item.id) }, <>{item.plannedOn ? <time>{short(item.plannedOn)}</time> : null}{source(item)}{star(item)}</>, quiet.has(item.id) ? quietAsk(item) : null))}</React.Fragment>)}</section> : null}
    {lists.waiting.length ? <p className="work-outstanding-line">{plural(lists.waiting.length, 'thing')} waiting on other people. <button onClick={() => onScope('waiting')}>Waiting on</button></p> : null}
    {lists.ledger.length ? <section aria-label="Done this week"><h2>Done this week</h2><dl className="work-ledger">{lists.ledger.map(entry => <React.Fragment key={entry.day}><dt>{displayDay(entry.day, { weekday: 'long' })}</dt><dd>{entry.items.map((item, index) => <React.Fragment key={item.id}>{index ? ' · ' : ''}<s>{item.title}</s></React.Fragment>)}</dd></React.Fragment>)}</dl><p className="work-outstanding-tally">{plural(lists.done, 'thing')} closed this week{lists.lastWeek ? `, ${lists.done === lists.lastWeek ? 'the same as' : lists.done > lists.lastWeek ? `${lists.done - lists.lastWeek} more than` : `${lists.lastWeek - lists.done} fewer than`} last week` : ''}.</p></section> : null}
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
