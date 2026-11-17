import { dayInZone, readPlan, shiftDay, weekDays, writtenDay } from './workPlannerModel';

// Outstanding is a reading of the same lines notes and days hold. Each line carries
// at most a list, who it waits on and the days it was sorted or comes back; the rest is derived.
export const FRESH_DAYS = 14, QUIET_DAYS = 21, CHASE_DAYS = 7;
export const daysBetween = (from, to) => from && to ? Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) : 0;
const doneDay = item => dayInZone(item.completedAt, item.completedTimeZone || item.timeZone);
export const sortedSince = item => item.sortedOn || writtenDay(item);

// Where an open line sits: new from a recent note, Next, Waiting on, or Someday until its day comes back.
export function listOf(item, notes, today) {
  if (item.list === 'someday') return item.returnOn && item.returnOn <= today ? 'new' : 'someday';
  if (item.list) return item.list;
  const source = item.noteId && notes.find(note => [note._id, note.clientId].includes(item.noteId));
  return source && daysBetween(writtenDay(source), today) <= FRESH_DAYS ? 'new' : 'next';
}

export function outstanding(items, notes, today) {
  const open = items.filter(item => ['task', 'question'].includes(item.kind) && !item.completed);
  const lists = { new: [], next: [], waiting: [], someday: [] };
  open.forEach(item => lists[listOf(item, notes, today)].push(item));
  const week = weekDays(today).filter(day => day <= today);
  const done = items.filter(item => item.completed && week.includes(doneDay(item)));
  const lastWeek = items.filter(item => item.completed && weekDays(shiftDay(today, -7)).includes(doneDay(item))).length;
  return {
    ...lists,
    total: lists.new.length + lists.next.length + lists.waiting.length,
    quiet: lists.next.filter(item => !(item.plannedOn > today) && daysBetween(sortedSince(item), today) >= QUIET_DAYS),
    oneThing: open.find(item => item.oneThingOn === today) || null,
    ledger: week.map(day => ({ day, items: done.filter(item => doneDay(item) === day) })).filter(entry => entry.items.length),
    done: done.length, lastWeek,
    gotBack: done.filter(item => item.list === 'waiting').map(item => ({ item, days: daysBetween(sortedSince(item), doneDay(item)) }))
  };
}

// "@Sam the comp bands", "offsite in Lisbon someday", "renew the permit fri": one typed line, read the way people say it.
const PERSON = /(^|\s)@([\p{L}][\p{L}'-]*)/u;
export const waitingFrom = text => { const person = text.match(PERSON)?.[2] || ''; return { waitingOn: person, title: person ? text.replace(PERSON, ' ').replace(/\s+/g, ' ').trim() : text.trim() }; };
export function readOutstanding(text, today) {
  const { waitingOn, title } = waitingFrom(text), someday = /\s+someday$/i.test(title);
  const read = readPlan(title.replace(/\s+someday$/i, ''), today);
  return { title: read.title, plannedOn: read.plannedOn || null, list: waitingOn ? 'waiting' : someday ? 'someday' : 'next', waitingOn, sortedOn: today };
}

// Nudge drafts two plain lines from the line itself and the note it came from.
export function nudge(item, source) {
  const name = item.waitingOn.trim().split(/\s+/)[0];
  const thing = item.title.charAt(0).toLowerCase() + item.title.slice(1);
  return `Hi ${name}, any news on ${thing}?${source ? ` It came up when we spoke on ${source}.` : ''} No rush if it’s in hand.`;
}

export const peopleIn = text => (text || '').split(/,|\band\b|&/).map(name => name.trim()).filter(Boolean);
export const owes = (items, people) => items.filter(item => item.list === 'waiting' && !item.completed && people.some(person => person.toLowerCase().split(/\s+/)[0] === item.waitingOn.toLowerCase().split(/\s+/)[0]));
