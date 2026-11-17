import { movedBoard, stageChange, stageLine, stageOf } from './notebookStages';

const NOW = new Date('2026-11-12T12:00:00Z').getTime();
const daysAgo = n => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

test('a note from before stages is an idea, and the old archive reads as closed', () => {
  expect(stageOf(undefined)).toBe('idea');
  expect(stageOf({ stage: 'in_progress' })).toBe('in_progress');
  expect(stageOf({ stage: 'idea', archivedAt: daysAgo(3) })).toBe('done');
});

test('each piece in the list says what matters for where it stands', () => {
  expect(stageLine({ stage: 'in_progress', nextTimeLine: 'Start from the renewal rate.' }, NOW)).toBe('Start from the renewal rate.');
  expect(stageLine({ stage: 'in_progress', updatedAt: daysAgo(1) }, NOW)).toBe('Last written yesterday');
  expect(stageLine({ stage: 'done', board: { stage: 'done', became: 'Sent to Sam' } }, NOW)).toBe('Sent to Sam');
  expect(stageLine({ stage: 'done', board: { stage: 'done', movedAt: daysAgo(10) } }, NOW)).toBe('Closed 2 Nov');
  expect(stageLine({ stage: 'done', board: { stage: 'idea', archivedAt: daysAgo(2) } }, NOW)).toBe('Set aside 2 days ago');
  expect(stageLine({ stage: 'idea' }, NOW)).toBe('');
});

test('closing carries its line, and reopening a set-aside piece takes it out of the archive', () => {
  expect(stageChange({}, 'done', 'Posted')).toEqual({ stage: 'done', became: 'Posted' });
  expect(stageChange({ archivedAt: daysAgo(1) }, 'in_progress')).toEqual({ stage: 'in_progress', archived: false });
  expect(movedBoard({ stage: 'done', archivedAt: 'x', became: 'Posted' }, { stage: 'idea', archived: false }, 'now'))
    .toEqual({ stage: 'idea', movedAt: 'now', archivedAt: null, became: 'Posted' });
});
