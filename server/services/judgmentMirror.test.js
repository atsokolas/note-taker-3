const { buildJudgmentMirror } = require('./judgmentMirror');

const page = ({ userId = 'user-a', claims = [], judgment = {} } = {}) => ({
  _id: `page-${userId}-${claims[0]?.claimId || 'x'}`,
  userId,
  createdAt: new Date('2026-01-01'),
  judgment,
  claims
});

describe('the Mirror', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  const corpus = [
    page({
      userId: 'user-a',
      judgment: { currentJudgment: 'Compute is scarce.', kind: 'thesis' },
      claims: [{
        claimId: 'held-1',
        text: 'Compute is scarce.',
        bornAt: new Date('2026-01-01'),
        checkInStatus: 'reaffirmed',
        history: [
          { at: new Date('2026-03-01'), action: 'reaffirmed' },
          { at: new Date('2026-06-01'), action: 'revised' }
        ],
        verdicts: [{ at: new Date('2026-08-01'), verdict: 'held_up', trigger: 'horizon' }]
      }]
    }),
    page({
      userId: 'user-a',
      claims: [{
        claimId: 'held-2',
        text: 'Demand stays lumpy.',
        bornAt: new Date('2026-07-01'),
        checkInStatus: 'reaffirmed',
        history: [
          { at: new Date('2026-07-15'), support: 'conflicted' },
          { at: new Date('2026-07-25'), action: 'revised' }
        ],
        verdicts: [{ at: new Date('2026-08-20'), verdict: 'broke', trigger: 'evidence' }]
      }]
    }),
    page({
      userId: 'user-a',
      claims: [{
        claimId: 'retired-1',
        text: 'A retired belief.',
        bornAt: new Date('2025-01-01'),
        checkInStatus: 'retired',
        retiredAt: new Date('2026-02-01'),
        history: [{ action: 'retired' }]
      }]
    })
  ];

  it('aggregates this user’s claims and traces every stat to its rows', () => {
    const mirror = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a' });
    expect(mirror.userId).toBe('user-a');
    expect(mirror.stats.held.value).toBe(2);
    expect(mirror.stats.held.href).toBe('/judgment/mirror?stat=held');
    expect(mirror.stats.holdTime.display).toMatch(/days/);
    expect(mirror.stats.revisions.display).toBe('100%');
    expect(mirror.stats.verdicts.value).toEqual({
      held_up: 1,
      broke: 1,
      partly: 0,
      unresolvable: 0,
      right_for_wrong_reasons: 0
    });
    expect(mirror.stats.verdicts.display).not.toMatch(/strongest|score|streak/i);
    expect(mirror.stats.counterEvidence.display).toBe('10 days');
    expect(JSON.stringify(mirror)).not.toMatch(/confetti|toast|gamif/i);
  });

  it('click-through lists the claims behind a stat', () => {
    const held = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a', stat: 'held' });
    expect(held.claims.map((row) => row.claimId).sort()).toEqual(['held-1', 'held-2']);
    expect(held.claims[0].href).toMatch(/^\/judgment\//);

    const lag = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a', stat: 'counter-evidence' });
    expect(lag.claims).toEqual([expect.objectContaining({ claimId: 'held-2', days: 10 })]);

    const verdicts = buildJudgmentMirror({ pages: corpus, now, userId: 'user-a', stat: 'verdicts' });
    expect(verdicts.claims.map((row) => row.verdict).sort()).toEqual(['broke', 'held_up']);
  });

  it('does not mix another user’s ledger into this one', () => {
    const other = page({
      userId: 'user-b',
      claims: [{
        claimId: 'other-1',
        text: 'Someone else’s claim.',
        bornAt: new Date('2026-01-01'),
        checkInStatus: 'reaffirmed',
        history: [{ action: 'reaffirmed' }],
        verdicts: [{ verdict: 'held_up', trigger: 'horizon', at: new Date('2026-08-01') }]
      }]
    });
    const mine = corpus.filter((row) => row.userId === 'user-a');
    const mirror = buildJudgmentMirror({ pages: mine, now, userId: 'user-a' });
    expect(JSON.stringify(mirror)).not.toMatch(/other-1|Someone else’s/);
    expect(buildJudgmentMirror({ pages: [other], now, userId: 'user-b' }).stats.held.value).toBe(1);
  });
});
