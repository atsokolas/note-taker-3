import { buildBoard, cardLine, countLine, doneReceipt, placeCard } from './notebookBoardModel';

const NOW = new Date('2026-10-11T12:00:00Z').getTime();
const daysAgo = n => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const notes = [
  { _id: 'a', title: 'On moats', updatedAt: daysAgo(2), createdAt: daysAgo(40) },
  { _id: 'b', title: 'Pricing power', updatedAt: daysAgo(45), createdAt: daysAgo(60) },
  { _id: 'c', title: 'Essay draft', board: { stage: 'in_progress' }, updatedAt: daysAgo(1) },
  { _id: 'd', title: 'Finished essay', board: { stage: 'done', movedAt: daysAgo(3) }, updatedAt: daysAgo(9) },
  { _id: 'e', title: 'Old essay', board: { stage: 'done', archivedAt: daysAgo(1) }, updatedAt: daysAgo(90) },
  { _id: 'f', title: 'Cold idea', board: { stage: 'idea', archivedAt: daysAgo(5) }, updatedAt: daysAgo(80) },
  { _id: 'g', title: 'Debug', debugOnly: true }
];

test('a note from before the board is an idea, and archived notes leave the columns', () => {
  const board = buildBoard(notes, NOW);
  expect(board.columns.idea.map(card => card.id)).toEqual(['a', 'b']);
  expect(board.columns.in_progress.map(card => card.id)).toEqual(['c']);
  expect(board.columns.done.map(card => card.id)).toEqual(['d']);
  expect(board.archive.done.map(card => card.id)).toEqual(['e']);
  expect(board.archive.idea.map(card => card.id)).toEqual(['f']);
  expect(board.archived).toBe(2);
  expect(countLine(board.columns)).toBe('2 ideas · 1 in progress · 1 done');
});

test('only ideas left a month without a word are offered for the archive', () => {
  const board = buildBoard(notes, NOW);
  expect(board.stale.map(card => card.id)).toEqual(['b']);
  expect(cardLine(board.columns.idea[1], NOW)).toBe('Untouched since 27 Aug');
  expect(cardLine(board.columns.idea[0], NOW)).toBe('Last written 2 days ago');
  expect(cardLine(board.columns.done[0], NOW)).toBe('Done 3 days ago');
  expect(cardLine(board.archive.done[0], NOW)).toBe('Finished, set aside yesterday');
});

test('finishing says how long the piece was in the making', () => {
  const [card] = buildBoard(notes, NOW).columns.idea;
  expect(doneReceipt(card, NOW)).toBe('“On moats” is done. Begun 1 Sep, 40 days in the making.');
  expect(doneReceipt({ title: 'Quick', createdAt: daysAgo(0) }, NOW)).toBe('“Quick” is done. Begun and finished today.');
});

test('placing a card changes only that note', () => {
  const placed = placeCard(notes, 'a', { stage: 'done' });
  expect(placed[0].board.stage).toBe('done');
  expect(placed[1]).toBe(notes[1]);
});
