import {
  buildThinkPosturePath,
  getPrimaryNavItems,
  getSecondaryNavItems,
  getTopBarUtilityNavItems
} from './appNavigation';

describe('appNavigation', () => {
  it('opens the primary navigation with Paper, then the four rooms', () => {
    const primaryLabels = getPrimaryNavItems().map(item => item.label);

    // Paper is the front door, so it is named rather than left to whoever
    // knows the wordmark is a link. Judgment closes the row: what the reading
    // was for.
    expect(primaryLabels).toEqual(['Paper', 'Library', 'Think', 'Wiki', 'Judgment']);
    expect(primaryLabels).not.toContain('Notebook');
    expect(primaryLabels).not.toContain('Concepts');
    expect(primaryLabels).not.toContain('Questions');
  });

  it('marks Paper active on the root route as well as its own', () => {
    const paper = getPrimaryNavItems().find(item => item.label === 'Paper');

    expect(paper.to).toBe('/paper');
    expect(paper.match({ pathname: '/' })).toBe(true);
    expect(paper.match({ pathname: '/paper' })).toBe(true);
    expect(paper.match({ pathname: '/wiki' })).toBe(false);
  });

  it('keeps Paper out of the overflow menu now that it has a room', () => {
    expect(getSecondaryNavItems().map(item => item.label)).not.toContain('Paper');
  });

  it('keeps Judgment active across the index and a single claim', () => {
    const judgment = getPrimaryNavItems().find(item => item.label === 'Judgment');

    expect(judgment.to).toBe('/judgment');
    expect(judgment.match({ pathname: '/judgment' })).toBe(true);
    expect(judgment.match({ pathname: '/judgment/wiki-page-1' })).toBe(true);
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

    expect(utilityLabels).toEqual(['Connections', 'Settings']);
    expect(secondaryLabels).not.toContain('Connections');
    expect(secondaryLabels).not.toContain('Settings');
    expect(secondaryLabels).not.toContain('Capture');
    expect(getPrimaryNavItems().map(item => item.label)).not.toEqual(expect.arrayContaining(secondaryLabels));
  });

  it('stops advertising Today, Map, Review and the Return Queue as rooms', () => {
    // Their routes still resolve — Today lands on the paper, Map is reachable
    // from the wiki workspace, and the paper says what is due. What changed is
    // that they are no longer places you are invited to go.
    const secondaryLabels = getSecondaryNavItems().map(item => item.label);

    ['Today', 'Map', 'Review', 'Return Queue'].forEach((label) => {
      expect(secondaryLabels).not.toContain(label);
    });
    expect(secondaryLabels).toEqual(['Growth', 'How To Use']);
  });
});
