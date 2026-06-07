import {
  buildThinkPosturePath,
  getPrimaryNavItems,
  getSecondaryNavItems
} from './appNavigation';

describe('appNavigation', () => {
  it('keeps the primary product navigation collapsed to Library, Think, and Wiki', () => {
    const primaryLabels = getPrimaryNavItems().map(item => item.label);

    expect(primaryLabels).toEqual(['Library', 'Think', 'Wiki']);
    expect(primaryLabels).not.toContain('Notebook');
    expect(primaryLabels).not.toContain('Concepts');
    expect(primaryLabels).not.toContain('Questions');
  });

  it('keeps legacy Think postures addressable without reintroducing top-level surfaces', () => {
    expect(buildThinkPosturePath('concepts', 'Moats')).toBe('/think?tab=concepts&concept=Moats');
    expect(buildThinkPosturePath('notebook', 'note-123')).toBe('/think?tab=notebook&entryId=note-123');
    expect(buildThinkPosturePath('questions', 'question-123')).toBe('/think?tab=questions&questionId=question-123');
  });

  it('keeps operational tools out of the primary nav', () => {
    const secondaryLabels = getSecondaryNavItems().map(item => item.label);

    expect(secondaryLabels).toEqual(expect.arrayContaining(['Today', 'Review', 'Import data', 'Map']));
    expect(secondaryLabels).not.toContain('Capture');
    expect(getPrimaryNavItems().map(item => item.label)).not.toEqual(expect.arrayContaining(secondaryLabels));
  });
});
