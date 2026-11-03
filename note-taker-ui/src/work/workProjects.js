import { dayInZone, writtenDay } from './workPlannerModel';
import { QUIET_DAYS, daysBetween, listOf, sortedSince } from './workOutstanding';
import { plainTextFrom } from '../utils/editorialText';
import { buildCanonicalArticlePath } from '../utils/sourceRoutes';

// A project is read whole from the notes and lines that are part of it, whatever folder they sit in:
// what is open, who owes it, what was decided. Only the state, brief, closing line and links are stored.
const idOf = value => value?._id || value || '';
const day = value => value ? dayInZone(value) : '';

export const projectState = record => record.archivedAt ? 'done' : record.pausedAt ? 'paused' : 'active';

// A line is part of its own project, or of the project of the note it came from.
export const projectOfLine = (item, notes) => idOf(item.project) || idOf(notes.find(note => [note._id, note.clientId].includes(item.noteId))?.project);

// A paragraph, list item or line of a note that starts "Decided:" is a decision, dated by the note.
const DECIDED = /^decided:\s*(.+)$/i;
const linesOf = note => note.blocks?.length ? note.blocks.map(block => block.text || '') : String(note.content || '').split(/<\/(?:p|li|h[1-6]|div|blockquote)>|<br\s*\/?>|\n/i).map(plainTextFrom);
export const decisionsIn = note => linesOf(note).map(line => line.trim().match(DECIDED)?.[1].trim()).filter(Boolean).map(text => text.charAt(0).toUpperCase() + text.slice(1));

export const linkHref = link => link.kind === 'article' ? buildCanonicalArticlePath(link.id) : link.kind === 'wiki' ? `/wiki/read/${encodeURIComponent(link.id)}` : `/books/${encodeURIComponent(link.id)}`;
export const LINK_ROOM = { article: 'Library', wiki: 'Wiki', book: 'Book' };

export function project(record, notes, items, today) {
  const id = record._id, belongs = item => projectOfLine(item, notes) === id;
  const own = notes.filter(note => idOf(note.project) === id).sort((a, b) => writtenDay(b).localeCompare(writtenDay(a)));
  const lines = items.filter(item => ['task', 'question'].includes(item.kind) && belongs(item));
  const open = lines.filter(item => !item.completed), list = item => listOf(item, notes, today);
  const next = open.filter(item => !['waiting', 'someday'].includes(list(item)))
    .sort((a, b) => (a.oneThingOn === today ? -1 : b.oneThingOn === today ? 1 : 0) || (a.plannedOn || '9999').localeCompare(b.plannedOn || '9999') || sortedSince(a).localeCompare(sortedSince(b)));
  const touched = [...own, ...lines].map(record => day(record.updatedAt) || writtenDay(record)).concat(day(record.updatedAt)).filter(Boolean).sort().at(-1) || today;
  return {
    id, record, name: record.name, state: projectState(record),
    notes: own, next, waiting: open.filter(item => list(item) === 'waiting'),
    decisions: own.flatMap(note => decisionsIn(note).map(text => ({ text, note }))),
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
