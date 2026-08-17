import {
  buildThinkPosturePath,
  getPrimaryNavItems,
  getSecondaryNavItems,
  getTopBarUtilityNavItems
} from './appNavigation';

describe('appNavigation', () => {
  it('names four rooms, and no longer names the paper as a fifth', () => {
    const primaryLabels = getPrimaryNavItems().map(item => item.label);

    /* Paper used to open this row. It named the same place twice: the wiki
       opened onto its own morning briefing while Paper held the reading loop,
       so two front pages competed for the same first look. The paper is the
       top of the wiki now, and the nav names the four rooms. */
    expect(primaryLabels).toEqual(['Library', 'Think', 'Wiki', 'Judgment']);
    expect(primaryLabels).not.toContain('Paper');
    expect(primaryLabels).not.toContain('Notebook');
    expect(primaryLabels).not.toContain('Concepts');
    expect(primaryLabels).not.toContain('Questions');
  });

  it('marks Wiki active on the root route and on the paper it absorbed', () => {
    const wiki = getPrimaryNavItems().find(item => item.label === 'Wiki');

    expect(wiki.to).toBe('/wiki');
    expect(wiki.match({ pathname: '/' })).toBe(true);
    expect(wiki.match({ pathname: '/paper' })).toBe(true);
    expect(wiki.match({ pathname: '/wiki' })).toBe(true);
    expect(wiki.match({ pathname: '/library' })).toBe(false);
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
