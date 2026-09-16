import { citationOccurrence, wikiPassageReference, wikiRevisionLabel } from './wikiCopyReference';

describe('wikiCopyReference', () => {
  const page = {
    _id: 'page-1',
    title: 'Strategy is a set of choices',
    status: 'published',
    updatedAt: '2026-09-09T12:00:00.000Z'
  };

  it('names a citation by page, revision, claim, and source occurrence', () => {
    expect(citationOccurrence({
      pageId: 'page-1',
      revisionId: 'rev-3',
      claimId: 's2',
      sourceId: 'src-9',
      citationIndex: 2
    })).toEqual({
      pageId: 'page-1',
      revisionId: 'rev-3',
      claimId: 's2',
      sourceId: 'src-9',
      citationIndex: 2
    });
  });

  it('copies current wording with a version-aware reference', () => {
    const clip = wikiPassageReference({
      page,
      revisionId: 'rev-3',
      claimId: 's2',
      text: 'A strategy is only real when it closes off alternatives.',
      sources: [{ title: 'A choice needs a consequence' }]
    });
    expect(clip).toContain('“A strategy is only real when it closes off alternatives.”');
    expect(clip).toContain('current version rev-3');
    expect(clip).toContain('passage s2');
    expect(clip).toContain('A choice needs a consequence');
    expect(clip).not.toMatch(/accepted/i);
  });

  it('refuses to give a proposal an accepted-version identity', () => {
    const clip = wikiPassageReference({
      page,
      revisionId: 'rev-3',
      text: 'A bounded experiment can itself be a commitment.',
      proposed: true
    });
    expect(clip).toMatch(/^PROPOSED — NOT ACCEPTED/);
    expect(clip).toContain('proposed wording · not accepted');
    expect(clip).not.toContain('current version');
  });

  it('keeps a historical reference pointed at the earlier words', () => {
    expect(wikiRevisionLabel({
      page: { ...page, status: 'published' },
      revisionId: 'rev-2',
      historical: true
    })).toBe('earlier version rev-2');
    expect(wikiRevisionLabel({ page: { ...page, status: 'draft' }, revisionId: 'draft-1' }))
      .toBe('draft version draft-1');
    const clip = wikiPassageReference({
      page,
      revisionId: 'rev-2',
      historical: true,
      text: 'The earlier words.'
    });
    expect(clip).toContain('The earlier words.');
    expect(clip).toContain('earlier version rev-2');
    expect(clip).not.toContain('current version');
  });
});
