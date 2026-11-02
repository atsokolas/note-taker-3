import { listOf, nudge, outstanding, owes, peopleIn, readOutstanding } from './workOutstanding';

const done = (day, extra = {}) => ({ kind: 'task', completed: true, completedAt: `${day}T15:00:00Z`, completedTimeZone: 'UTC', ...extra });
const notes = [{ _id: 'recent', takenOn: '2026-10-26' }, { _id: 'old', takenOn: '2026-09-01' }];

test('a line from a recent note is new until sorted; older lines and lines added here are Next', () => {
  expect(listOf({ noteId: 'recent' }, notes, '2026-10-30')).toBe('new');
  expect(listOf({ noteId: 'old' }, notes, '2026-10-30')).toBe('next');
  expect(listOf({}, notes, '2026-10-30')).toBe('next');
  expect(listOf({ noteId: 'recent', list: 'waiting' }, notes, '2026-10-30')).toBe('waiting');
});

test('Someday keeps a line until its day comes back, then it is new again', () => {
  expect(listOf({ list: 'someday', returnOn: '2026-12-01' }, notes, '2026-11-30')).toBe('someday');
  expect(listOf({ list: 'someday', returnOn: '2026-12-01' }, notes, '2026-12-01')).toBe('new');
});

test('quiet lines, the week ledger, what came back and today’s one thing are read from the lines', () => {
  const items = [
    { id: 'a', kind: 'task', list: 'next', sortedOn: '2026-10-01', title: 'Read the memo' },
    { id: 'b', kind: 'task', list: 'next', sortedOn: '2026-10-28', title: 'Draft the post', oneThingOn: '2026-10-30' },
    { id: 'c', kind: 'appointment', plannedOn: '2026-10-30', title: 'Lunch' },
    done('2026-10-27', { id: 'd', title: 'Reply to Mira', list: 'waiting', waitingOn: 'Mira', sortedOn: '2026-10-22' }),
    done('2026-10-29', { id: 'e', title: 'Send the pack' }),
    done('2026-10-21', { id: 'f', title: 'Last week' })
  ];
  const lists = outstanding(items, notes, '2026-10-30');
  expect(lists.total).toBe(2);
  expect(lists.quiet.map(item => item.id)).toEqual(['a']);
  expect(lists.oneThing.id).toBe('b');
  expect(lists.ledger.map(entry => [entry.day, entry.items.map(item => item.id)])).toEqual([['2026-10-27', ['d']], ['2026-10-29', ['e']]]);
  expect(lists.done).toBe(2); expect(lists.lastWeek).toBe(1);
  expect(lists.gotBack).toEqual([{ item: items[3], days: 5 }]);
});

test('one typed line names who owes it, the day it is planned, or that it is for someday', () => {
  expect(readOutstanding('@Sam the comp bands', '2026-10-30')).toEqual({ title: 'the comp bands', plannedOn: null, list: 'waiting', waitingOn: 'Sam', sortedOn: '2026-10-30' });
  expect(readOutstanding('renew the permit mon', '2026-10-30')).toMatchObject({ title: 'renew the permit', plannedOn: '2026-11-02', list: 'next' });
  expect(readOutstanding('offsite in Lisbon someday', '2026-10-30')).toMatchObject({ title: 'offsite in Lisbon', list: 'someday' });
});

test('a nudge is two plain lines from the line and its note, and people in a note find what they owe', () => {
  expect(nudge({ waitingOn: 'Sam Lee', title: 'The comp bands' }, 'Monday 26 Oct')).toBe('Hi Sam, any news on the comp bands? It came up when we spoke on Monday 26 Oct. No rush if it’s in hand.');
  const lines = [{ list: 'waiting', waitingOn: 'Sam', title: 'Bands' }, { list: 'waiting', waitingOn: 'Priya', title: 'Room' }, { list: 'next', title: 'Mine' }];
  expect(peopleIn('Priya Shah, Sam and Ana')).toEqual(['Priya Shah', 'Sam', 'Ana']);
  expect(owes(lines, peopleIn('Sam')).map(item => item.title)).toEqual(['Bands']);
});
