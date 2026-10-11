const { buildJudgmentMirror } = require('./judgmentMirror');

const view = ({ id, userId = 'user-a', judgment = {} }) => ({
  _id: id,
  userId,
  createdAt: new Date('2026-01-01'),
  judgment
});

describe('the Mirror', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');
  const counterevidence = [{
    pageId: 'view-2',
    text: 'Demand stays lumpy.',
    href: '/judgment/view-2',
    days: 10
  }];

  const corpus = [
    view({
      id: 'view-1',
      judgment: {
        currentJudgment: 'Compute is scarce.',
        startedAt: new Date('2026-01-01'),
        heldHistory: [{ text: 'Compute is scarce for years.', until: new Date('2026-06-01') }],
        verdicts: [{ result: 'held_up', recordedAt: new Date('2026-08-01') }]
      }
    }),
    view({
      id: 'view-2',
      judgment: {
        currentJudgment: 'Demand stays lumpy.',
        startedAt: new Date('2026-07-01'),
        verdicts: [{ result: 'broke', recordedAt: new Date('2026-08-20') }]
      }
    }),
    view({
      id: 'view-3',
      judgment: { currentJudgment: 'A view set aside.', status: 'parked' }
    }),
    /* A wiki page with claims but no held sentence is not a view. */
    { _id: 'wiki-1', userId: 'user-a', claims: [{ claimId: 'c1', text: 'A wiki claim.' }] }
  ];

  it('counts the views the index lists and traces every stat to its rows', () => {
    const mirror = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a', counterevidence });
    expect(mirror.userId).toBe('user-a');
    expect(mirror.stats.held.label).toBe('Views held');
    expect(mirror.stats.held.value).toBe(2);
    expect(mirror.stats.holdTime.display).toMatch(/days/);
    expect(mirror.stats.revisions.display).toBe('33%');
    expect(mirror.stats.verdicts.value).toEqual({
      held_up: 1,
      broke: 1,
      partly: 0,
      unresolvable: 0,
      right_for_wrong_reasons: 0
    });
    expect(mirror.stats.verdicts.display).toBe('1 held up · 1 broke');
    expect(mirror.stats.counterEvidence.display).toBe('10 days');
  });

  it('click-through lists the views behind a stat', () => {
    const held = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a', stat: 'held' });
    expect(held.claims.map((row) => row.pageId).sort()).toEqual(['view-1', 'view-2']);
    expect(held.claims[0].href).toMatch(/^\/judgment\//);

    const verdicts = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a', stat: 'verdicts' });
    expect(verdicts.claims.map((row) => row.verdict).sort()).toEqual(['broke', 'held_up']);
  });

  it('says nothing about a ledger with no views in it', () => {
    const mirror = buildJudgmentMirror({ pages: [corpus[3]], now, userId: 'user-a' });
    expect(mirror.stats.held.value).toBe(0);
    expect(mirror.stats.verdicts.display).toBe('');
    expect(mirror.stats.revisions.value).toBeNull();
  });
});
