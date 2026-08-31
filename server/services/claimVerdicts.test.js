const { appendVerdict, alreadyAsked, selectPaperVerdicts } = require('./claimVerdicts');
const { applyFalsifiability } = require('./claimFalsifiability');

const eligiblePage = (overrides = {}) => ({
  _id: 'p1',
  title: 'Compute',
  pageType: 'concept',
  judgment: { kind: 'thesis', currentJudgment: 'Compute stays scarce through 2027.' },
  claims: [{
    claimId: 'c1',
    text: 'Compute stays scarce through 2027.',
    checkInStatus: 'reaffirmed',
    history: [{ actorType: 'user', action: 'reaffirmed' }],
    verdicts: [],
    ...overrides.claim
  }],
  ...overrides.page
});

describe('append-only verdicts', () => {
  it('pushes a verdict onto history and never rewrites the earlier one', () => {
    const claim = { claimId: 'c1', text: 'Compute is scarce.', history: [], verdicts: [] };
    const first = appendVerdict(claim, {
      verdict: 'held_up',
      trigger: 'horizon',
      now: new Date('2026-09-01')
    });
    appendVerdict(claim, {
      verdict: 'broke',
      trigger: 'evidence',
      sourceEventId: 'evt-2',
      now: new Date('2026-09-02')
    });
    expect(claim.verdicts).toHaveLength(2);
    expect(claim.verdicts[0].verdict).toBe('held_up');
    expect(claim.verdicts[0].at).toEqual(first.at);
    expect(claim.verdicts[1].verdict).toBe('broke');
    expect(claim.history.map((row) => row.action)).toEqual(['held_up', 'broke']);
    expect(claim.verdicts[0].verdict).toBe('held_up');
  });

  it('refuses an unknown tap without touching history', () => {
    const claim = { claimId: 'c1', verdicts: [], history: [] };
    expect(() => appendVerdict(claim, { verdict: 'strongest', trigger: 'horizon' }))
      .toThrow(/held_up, broke, partly, or unresolvable/);
    expect(claim.verdicts).toHaveLength(0);
    expect(claim.history).toHaveLength(0);
  });
});

describe('morning paper verdicts', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('asks nothing on a quiet day', () => {
    const page = eligiblePage();
    expect(selectPaperVerdicts({ pages: [page], watcherLeads: [], now })).toEqual([]);
  });

  it('asks when a horizon has arrived', () => {
    const page = eligiblePage({
      claim: { horizon: new Date('2026-08-15T00:00:00.000Z'), resolutionCriteria: 'Utilisation falls two quarters.' }
    });
    const rows = selectPaperVerdicts({ pages: [page], watcherLeads: [], now });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      claimId: 'c1',
      trigger: 'horizon',
      text: 'Compute stays scarce through 2027.'
    });
  });

  it('asks when a watcher lands decisive evidence', () => {
    const page = eligiblePage();
    const rows = selectPaperVerdicts({
      pages: [page],
      watcherLeads: [{
        eventId: 'evt-1',
        page: { id: 'p1' },
        claimImpacts: [{ claimId: 'c1', beforeSupport: 'partial', afterSupport: 'conflicted' }]
      }],
      now
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ claimId: 'c1', trigger: 'evidence', sourceEventId: 'evt-1' });
  });

  it('shows horizon and evidence together', () => {
    const page = eligiblePage({
      claim: { horizon: new Date('2026-08-01') }
    });
    const rows = selectPaperVerdicts({
      pages: [page],
      watcherLeads: [{
        eventId: 'evt-1',
        page: { id: 'p1' },
        claimImpacts: [{ claimId: 'c1', beforeSupport: 'supported', afterSupport: 'conflicted' }]
      }],
      now
    });
    expect(rows.map((row) => row.trigger).sort()).toEqual(['evidence', 'horizon']);
  });

  it('does not re-ask a horizon already verdicted', () => {
    const page = eligiblePage({
      claim: {
        horizon: new Date('2026-08-15'),
        verdicts: [{
          at: new Date('2026-08-16'),
          verdict: 'held_up',
          trigger: 'horizon',
          horizon: new Date('2026-08-15')
        }]
      }
    });
    expect(selectPaperVerdicts({ pages: [page], watcherLeads: [], now })).toEqual([]);
  });

  it('keeps T1 silence for a repo dump even when a horizon is due', () => {
    const page = {
      _id: 'repo',
      title: 'note-taker-3 — repo wiki',
      pageType: 'repo',
      claims: [{
        claimId: 'dump',
        text: 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries… WikiRepoCreateComposer, createRepoWikiFromGitHub, POST /api/wiki/pages/from-github… debugging only the v…',
        horizon: new Date('2026-01-01'),
        checkInStatus: 'unreviewed',
        history: []
      }]
    };
    expect(selectPaperVerdicts({ pages: [page], watcherLeads: [], now })).toEqual([]);
  });

  it('does not treat a non-decisive watcher bump as a verdict ask', () => {
    const page = eligiblePage();
    expect(selectPaperVerdicts({
      pages: [page],
      watcherLeads: [{
        eventId: 'evt-soft',
        page: { id: 'p1' },
        claimImpacts: [{ claimId: 'c1', beforeSupport: 'partial', afterSupport: 'supported', evidenceChanged: true }]
      }],
      now
    })).toEqual([]);
  });
});

describe('alreadyAsked', () => {
  it('matches a horizon by the day named, not by later clock noise', () => {
    const claim = applyFalsifiability(
      { verdicts: [{ trigger: 'horizon', horizon: new Date('2026-08-15T08:00:00Z'), verdict: 'partly' }] },
      { horizon: '2026-08-15' }
    );
    expect(alreadyAsked(claim, { trigger: 'horizon', horizon: claim.horizon })).toBe(true);
    expect(alreadyAsked(claim, { trigger: 'horizon', horizon: new Date('2026-09-01') })).toBe(false);
  });
});
