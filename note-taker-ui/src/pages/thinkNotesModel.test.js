import {
  buildNoteShelf,
  editedLine,
  namesAThinkObject,
  readRecentNoteIds,
  resolveOpenNoteId
} from './thinkNotesModel';

const notes = [
  { _id: 'n1', title: 'Replication checklist', updatedAt: '2026-08-14T08:10:00.000Z' },
  { _id: 'n2', title: 'First principles', updatedAt: '2026-08-13T08:10:00.000Z' },
  { _id: 'n3', title: 'Reading map', updatedAt: '2026-06-01T08:10:00.000Z' }
];

const storage = (value) => ({ getItem: () => (value === undefined ? null : JSON.stringify(value)) });

describe('which note Think opens', () => {
  it('opens the note the URL names', () => {
    expect(resolveOpenNoteId({ requestedId: 'n3', notes, recentIds: ['n2'] })).toBe('n3');
  });

  it('otherwise opens the last note the human was actually in', () => {
    expect(resolveOpenNoteId({ notes, recentIds: ['n3', 'n2'] })).toBe('n3');
  });

  it('falls back to the most recently edited note, never to nothing', () => {
    expect(resolveOpenNoteId({ notes })).toBe('n1');
    expect(resolveOpenNoteId({ notes, recentIds: ['gone'] })).toBe('n1');
  });

  it('ignores a recent or requested note that no longer exists', () => {
    expect(resolveOpenNoteId({ requestedId: 'deleted', notes, recentIds: ['also-deleted'] })).toBe('n1');
  });

  it('has nothing to open only when there are no notes', () => {
    expect(resolveOpenNoteId({ notes: [] })).toBe('');
  });
});

describe('readRecentNoteIds', () => {
  it('reads notebook targets newest first and ignores the other postures', () => {
    const recents = [
      { id: 'c1', type: 'concept', openedAt: '2026-08-14T10:00:00.000Z' },
      { id: 'n2', type: 'notebook', openedAt: '2026-08-13T10:00:00.000Z' },
      { id: 'n1', type: 'notebook', openedAt: '2026-08-14T09:00:00.000Z' }
    ];

    expect(readRecentNoteIds(storage(recents))).toEqual(['n1', 'n2']);
  });

  it('survives an unreadable store', () => {
    expect(readRecentNoteIds({ getItem: () => 'not json' })).toEqual([]);
    expect(readRecentNoteIds(storage())).toEqual([]);
  });
});

describe('the faint shelf', () => {
  it('lists every note newest first and marks the open one', () => {
    const shelf = buildNoteShelf({ notes, openId: 'n2' });

    expect(shelf.map(item => item.title)).toEqual(['Replication checklist', 'First principles', 'Reading map']);
    expect(shelf.map(item => item.isOpen)).toEqual([false, true, false]);
  });

  it('stays bounded until the human searches or asks for the full recent set', () => {
    const many = Array.from({ length: 24 }, (_, index) => ({
      _id: `note-${index}`,
      title: index === 22 ? 'A specific parenting thought' : `Note ${index}`,
      updatedAt: new Date(Date.UTC(2026, 7, 24, 0, index)).toISOString()
    }));

    expect(buildNoteShelf({ notes: many })).toHaveLength(18);
    expect(buildNoteShelf({ notes: many, query: 'parenting' }).map(item => item.title))
      .toEqual(['A specific parenting thought']);
    expect(buildNoteShelf({ notes: many, expanded: true })).toHaveLength(24);
  });
});

describe('editedLine', () => {
  const now = new Date('2026-08-14T15:00:00.000Z').getTime();

  it('says when, from the timestamp', () => {
    expect(editedLine({ updatedAt: new Date('2026-08-14T09:00:00.000Z') }, now)).toMatch(/^edited (this morning|today)$/);
    expect(editedLine({ updatedAt: '2026-08-13T09:00:00.000Z' }, now)).toBe('edited yesterday');
    expect(editedLine({ updatedAt: '2026-06-01T09:00:00.000Z' }, now)).toBe('edited June 1');
  });

  it('says nothing when there is no timestamp', () => {
    expect(editedLine({}, now)).toBe('');
  });
});

describe('namesAThinkObject', () => {
  it('is false for the ways a human asks for "Think"', () => {
    expect(namesAThinkObject('')).toBe(false);
    expect(namesAThinkObject('?tab=home')).toBe(false);
    // The posture with nothing named is the case that used to blank the editor.
    expect(namesAThinkObject('?tab=notebook')).toBe(false);
    expect(namesAThinkObject('?tab=concepts')).toBe(false);
    // A named note is still the note surface — it is Think's face now.
    expect(namesAThinkObject('?tab=notebook&entryId=n1')).toBe(false);
  });

  it('is true when a link points at one specific object elsewhere in Think', () => {
    expect(namesAThinkObject('?tab=concepts&concept=Moats')).toBe(true);
    expect(namesAThinkObject('?tab=questions&questionId=q1')).toBe(true);
    expect(namesAThinkObject('?tab=threads&threadId=t1')).toBe(true);
  });

  it('leaves postures it does not know to the older workspace', () => {
    expect(namesAThinkObject('?tab=organize')).toBe(true);
  });
});
