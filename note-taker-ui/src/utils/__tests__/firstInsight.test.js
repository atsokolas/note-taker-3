import {
  clearFirstInsightState,
  getFirstInsightOpenPath,
  isFirstInsightActive,
  readFirstInsightState,
  saveFirstInsightState,
  updateFirstInsightState
} from '../firstInsight';

describe('firstInsight storage helpers', () => {
  beforeEach(() => {
    clearFirstInsightState();
  });

  it('saves, reads, and updates activation state', () => {
    const saved = saveFirstInsightState({
      sourceType: 'manual-note',
      title: 'Working note',
      notebookEntryId: 'note-1',
      counts: { importedNotes: 1 }
    });

    expect(saved.title).toBe('Working note');
    expect(readFirstInsightState()).toMatchObject({
      sourceType: 'manual-note',
      notebookEntryId: 'note-1'
    });

    const updated = updateFirstInsightState({
      conceptId: 'concept-1',
      conceptName: 'Retrieval systems',
      status: 'concept-created'
    });

    expect(updated).toMatchObject({
      conceptId: 'concept-1',
      conceptName: 'Retrieval systems',
      status: 'concept-created'
    });
    expect(getFirstInsightOpenPath(updated)).toBe('/think?tab=concepts&concept=Retrieval%20systems');
  });

  it('marks recent work active and clears cleanly', () => {
    const saved = saveFirstInsightState({
      sourceType: 'markdown',
      title: 'Imported note',
      notebookEntryId: 'note-2'
    });

    expect(isFirstInsightActive(saved)).toBe(true);
    clearFirstInsightState();
    expect(readFirstInsightState()).toBeNull();
  });
});
