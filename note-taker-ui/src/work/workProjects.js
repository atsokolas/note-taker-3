import { dayInZone, shiftDay, weekDays, writtenDay } from './workPlannerModel';
import { entryDay } from './workNoteEntries';
import { QUIET_DAYS, daysBetween, listOf, outstanding, sortedSince } from './workOutstanding';
import { plainTextFrom } from '../utils/editorialText';
import { buildCanonicalArticlePath } from '../utils/sourceRoutes';

// A project is read whole from the notes and lines that are part of it, whatever folder they sit in:
// what is open, who owes it, what was decided. Only the state, brief, closing line, weekly check-ins and links are stored.
const idOf = value => value?._id || value || '';
const day = value => value ? dayInZone(value) : '';

export const projectState = record => record.archivedAt ? 'done' : record.pausedAt ? 'paused' : 'active';

// A line is part of its own project, or of the project of the note it came from.
export const projectOfLine = (item, notes) => idOf(item.project) || idOf(notes.find(note => [note._id, note.clientId].includes(item.noteId))?.project);

// A paragraph, list item or line of a note that starts "Decided:" is a decision, dated by the note.
const DECIDED = /^decided:\s*(.+)$/i, DECIDED_IN = /\bdecided:/i;
const linesOf = note => note.blocks?.length ? note.blocks.map(block => block.text || '') : String(note.content || '').split(/<\/(?:p|li|h[1-6]|div|blockquote)>|<br\s*\/?>|\n/i).map(plainTextFrom);
export const decisionsIn = note => linesOf(note).map(line => line.trim().match(DECIDED)?.[1].trim()).filter(Boolean).map(text => text.charAt(0).toUpperCase() + text.slice(1));

// A note's dated headings split it into entries; a note without them is one entry on its written day.
export function entriesOf(note) {
  const entries = [];
  for (const line of linesOf(note).map(text => text.trim()).filter(Boolean)) {
    const day = entryDay(line);
    if (day) { entries.push({ day, lines: [] }); continue; }
    if (!entries.length) entries.push({ day: writtenDay(note), lines: [] });
    entries.at(-1).lines.push(line);
  }
  return entries.filter(entry => entry.lines.length).map(entry => ({ day: entry.day, text: entry.lines.join(' '), note }));
}

// The Monday question is asked all week until it is answered; the answer is dated, so it reads in the log.
export const checkInOf = (record, today) => (record.checkIns || []).find(answer => answer.on >= weekDays(today)[0]);

export const linkHref = link => link.kind === 'article' ? buildCanonicalArticlePath(link.id) : link.kind === 'wiki' ? `/wiki/read/${encodeURIComponent(link.id)}` : `/books/${encodeURIComponent(link.id)}`;
export const LINK_ROOM = { article: 'Library', wiki: 'Wiki', book: 'Book' };

// Where a project stands on its hill on a day, read from its own lines. Uphill is the share of its questions
// answered; once most are, downhill is the share of its follow-ups done. A project with no lines has not started.
export const FIGURED = 0.8;
const doneBy = (item, on) => item.completed && dayInZone(item.completedAt, item.completedTimeZone || 'UTC') <= on;
export function hillOn(lines, on) {
  const known = lines.filter(item => writtenDay(item) <= on);
  const share = (kind, otherwise) => { const of = known.filter(item => item.kind === kind); return of.length ? of.filter(item => doneBy(item, on)).length / of.length : otherwise; };
  if (!known.length) return 0;
  const figured = share('question', 1);
  return figured < FIGURED ? figured / 2 : 0.5 + share('task', 0) / 2;
}
// The last three Fridays before today, oldest first: where the hill shows each project's trail.
export const FRIDAYS = today => { const friday = shiftDay(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 2) % 7 || 7)); return [14, 7, 0].map(days => shiftDay(friday, -days)); };

export function project(record, notes, items, today) {
  const id = record._id, belongs = item => projectOfLine(item, notes) === id;
  const own = notes.filter(note => idOf(note.project) === id).sort((a, b) => writtenDay(b).localeCompare(writtenDay(a)));
  const lines = items.filter(item => ['task', 'question'].includes(item.kind) && belongs(item));
  // A line can be planned for a day already past and still be due ahead; the schedule shows the next of the two.
  const ahead = items.filter(item => item.kind !== 'jot' && !item.completed && belongs(item))
    .map(item => ({ ...item, on: [item.plannedOn, item.dueOn].filter(day => day >= today).sort()[0] })).filter(item => item.on);
  const open = lines.filter(item => !item.completed), list = item => listOf(item, notes, today);
  const next = open.filter(item => !['waiting', 'someday'].includes(list(item)))
    .sort((a, b) => (a.oneThingOn === today ? -1 : b.oneThingOn === today ? 1 : 0) || (a.plannedOn || '9999').localeCompare(b.plannedOn || '9999') || sortedSince(a).localeCompare(sortedSince(b)));
  const log = [...own.flatMap(entriesOf), ...(record.checkIns || []).map(answer => ({ day: answer.on, text: answer.text, checkIn: true }))].sort((a, b) => b.day.localeCompare(a.day));
  const touched = [...own, ...lines].map(record => day(record.updatedAt) || writtenDay(record)).concat(day(record.updatedAt)).filter(Boolean).sort().at(-1) || today;
  return {
    id, record, name: record.name, state: projectState(record),
    notes: own, next, waiting: open.filter(item => list(item) === 'waiting'),
    decisions: own.flatMap(note => decisionsIn(note).map(text => ({ text, note }))),
    log, hill: hillOn(lines, today), was: FRIDAYS(today).map(friday => hillOn(lines, friday)),
    // What each day held, for the six-week lineup: written or ticked, planned, met about, decided.
    marks: {
      touched: [...log.map(entry => entry.day), ...lines.flatMap(item => [writtenDay(item), item.completed ? dayInZone(item.completedAt, item.completedTimeZone || 'UTC') : ''])].filter(Boolean),
      planned: open.map(item => item.plannedOn).filter(Boolean),
      meetings: items.filter(item => item.kind === 'appointment' && belongs(item)).map(item => item.plannedOn).filter(Boolean),
      decided: log.filter(entry => DECIDED_IN.test(entry.text)).map(entry => entry.day)
    },
    schedule: ahead.sort((a, b) => `${a.on}${a.startTime || ''}`.localeCompare(`${b.on}${b.startTime || ''}`)),
    links: record.links || [], touched, idle: daysBetween(touched, today)
  };
}

// Active, then paused, then done, the most recently finished first.
export function projects(records, notes, items, today) {
  const all = records.map(record => project(record, notes, items, today));
  return {
    active: all.filter(item => item.state === 'active'),
    paused: all.filter(item => item.state === 'paused'),
    done: all.filter(item => item.state === 'done').sort((a, b) => String(b.record.archivedAt).localeCompare(String(a.record.archivedAt)))
  };
}

export const quiet = item => item.state === 'active' && item.idle >= QUIET_DAYS;
// Ink fades a step for each quiet week after the first, and comes back the moment the project is touched.
export const fade = item => item.state === 'active' ? Math.min(3, Math.max(0, Math.floor(item.idle / 7) - 1)) : 0;

// Needs you reads the same lines and projects: what your notes left unsorted, what came back from Someday,
// who owes you, and what has gone quiet. Every section is derived; nothing is stored for the page.
export function needsYou(records, notes, items, today) {
  const lists = outstanding(items, notes, today);
  const fresh = lists.new.filter(item => item.list !== 'someday'), back = lists.new.filter(item => item.list === 'someday');
  const { active } = projects(records, notes, items, today), silent = active.filter(quiet);
  // A quiet project is asked about once, not once more for each of its quiet lines.
  const stale = lists.quiet.filter(item => !silent.some(project => project.id === projectOfLine(item, notes)));
  return { ...lists, fresh, back, silent, quiet: stale, hills: Object.fromEntries(active.map(item => [item.id, item.hill])), total: fresh.length + back.length + lists.waiting.length + silent.length + stale.length };
}
