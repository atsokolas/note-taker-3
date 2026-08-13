import {
  buildThinkPosturePath,
  getPrimaryNavItems,
  getSecondaryNavItems,
  getTopBarUtilityNavItems
} from './appNavigation';

describe('appNavigation', () => {
  it('keeps the primary product navigation collapsed to the four product rooms', () => {
    const primaryLabels = getPrimaryNavItems().map(item => item.label);

    expect(primaryLabels).toEqual(['Library', 'Think', 'Wiki', 'Judgment']);
    expect(primaryLabels).not.toContain('Notebook');
    expect(primaryLabels).not.toContain('Concepts');
    expect(primaryLabels).not.toContain('Questions');
  });

  it('marks Judgment active across its routed casebook', () => {
    const judgment = getPrimaryNavItems().find(item => item.label === 'Judgment');

    expect(judgment.to).toBe('/judgment');
    expect(judgment.match({ pathname: '/judgment' })).toBe(true);
    expect(judgment.match({ pathname: '/judgment/cases/example' })).toBe(true);
    expect(judgment.match({ pathname: '/wiki' })).toBe(false);
  });

  it('keeps legacy Think postures addressable without reintroducing top-level surfaces', () => {
    expect(buildThinkPosturePath('concepts', 'Moats')).toBe('/think?tab=concepts&concept=Moats');
    expect(buildThinkPosturePath('notebook', 'note-123')).toBe('/think?tab=notebook&entryId=note-123');
    expect(buildThinkPosturePath('questions', 'question-123')).toBe('/think?tab=questions&questionId=question-123');
  });

  it('keeps operational tools out of the primary nav', () => {
    const secondaryLabels = getSecondaryNavItems().map(item => item.label);
    const utilityLabels = getTopBarUtilityNavItems().map(item => item.label);

    expect(secondaryLabels).toEqual(expect.arrayContaining(['Today', 'Review', 'Map']));
    expect(utilityLabels).toEqual(['Connections', 'Settings']);
    expect(secondaryLabels).not.toContain('Connections');
    expect(secondaryLabels).not.toContain('Settings');
    expect(secondaryLabels).not.toContain('Capture');
    expect(getPrimaryNavItems().map(item => item.label)).not.toEqual(expect.arrayContaining(secondaryLabels));
  });
});
