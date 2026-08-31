const { recordClaimCheckIn, recordClaimVerdict, selectDailyClaimCheckIn } = require('./dailyLoopService');
const { applyFalsifiability } = require('./claimFalsifiability');

class FakeRevision {
  constructor(value) { Object.assign(this, value); this._id = 'revision-1'; }
  async save() { return this; }
}

const pageWith = (claim) => ({
  _id: 'p1',
  userId: 'u1',
  title: 'Page one',
  claims: [claim],
  toObject() { return JSON.parse(JSON.stringify(this)); },
  markModified() {},
  async save() { return this; }
});

describe('stage 1 daily loop writes', () => {
  const modelsFor = (page) => ({
    WikiPage: { findOne: async () => page },
    WikiRevision: FakeRevision,
    User: { findById: async () => null }
  });

  it('persists optional criteria and horizon on a check-in without requiring them', async () => {
    const page = pageWith({
      claimId: 'c1',
      text: 'Compute is scarce.',
      support: 'partial',
      checkInStatus: 'unreviewed',
      history: [],
      createdAt: new Date('2026-01-01')
    });
    const bare = await recordClaimCheckIn({
      models: modelsFor(page),
      userId: 'u1',
      pageId: 'p1',
      claimId: 'c1',
      action: 'reaffirmed',
      now: new Date('2026-08-31')
    });
    expect(bare.claim.checkInStatus).toBe('reaffirmed');
    expect(bare.claim.resolutionCriteria || '').toBe('');

    applyFalsifiability(page.claims[0], {});
    const withTest = await recordClaimCheckIn({
      models: modelsFor(page),
      userId: 'u1',
      pageId: 'p1',
      claimId: 'c1',
      action: 'reaffirmed',
      resolutionCriteria: 'Utilisation falls two quarters.',
      horizon: '2026-12-01',
      now: new Date('2026-08-31T13:00:00Z')
    });
    expect(withTest.claim.resolutionCriteria).toBe('Utilisation falls two quarters.');
    expect(new Date(withTest.claim.horizon).toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('appends a verdict and leaves the earlier one intact', async () => {
    const page = pageWith({
      claimId: 'c1',
      text: 'Compute is scarce.',
      support: 'partial',
      checkInStatus: 'reaffirmed',
      history: [],
      verdicts: [],
      horizon: new Date('2026-08-01')
    });
    const first = await recordClaimVerdict({
      models: modelsFor(page),
      userId: 'u1',
      pageId: 'p1',
      claimId: 'c1',
      verdict: 'held_up',
      trigger: 'horizon',
      now: new Date('2026-08-31')
    });
    const second = await recordClaimVerdict({
      models: modelsFor(page),
      userId: 'u1',
      pageId: 'p1',
      claimId: 'c1',
      verdict: 'broke',
      trigger: 'evidence',
      sourceEventId: 'evt-1',
      now: new Date('2026-09-01')
    });
    expect(first.claim.verdicts[0].verdict).toBe('held_up');
    expect(second.claim.verdicts.map((row) => row.verdict)).toEqual(['held_up', 'broke']);
    expect(second.claim.history.filter((row) => row.event === 'verdict')).toHaveLength(2);
  });

  it('does not serve a check-in for a claim already asked as a verdict', () => {
    const pages = [{
      _id: 'p1',
      title: 'Compute',
      pageType: 'concept',
      lastVisitedAt: '2026-07-18',
      judgment: { kind: 'thesis', currentJudgment: 'Compute stays scarce through 2027.' },
      claims: [{
        claimId: 'c1',
        text: 'Compute stays scarce through 2027.',
        checkInStatus: 'reaffirmed',
        lastCheckedAt: '2026-06-01T12:00:00Z',
        history: [{ actorType: 'user', action: 'reaffirmed' }]
      }]
    }];
    const skipKeys = new Set(['p1:c1']);
    expect(selectDailyClaimCheckIn({
      pages,
      watcherLeads: [],
      now: new Date('2026-07-19T12:00:00Z').getTime(),
      skipKeys
    })).toBeNull();
    expect(selectDailyClaimCheckIn({
      pages,
      watcherLeads: [],
      now: new Date('2026-07-19T12:00:00Z').getTime()
    }).claimId).toBe('c1');
  });
});
