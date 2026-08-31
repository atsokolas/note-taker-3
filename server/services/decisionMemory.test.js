const {
  SCHEMA_VERSION,
  DecisionMemoryError,
  ownerProjection,
  project,
  publicProjection,
  replayAudit,
  withinBudget
} = require('./decisionMemory');

const stuffed = {
  _id: '64f500000000000000000010',
  userId: 'user-host',
  email: 'private-owner@secret.example',
  token: 'jwt-secret-token-xyz',
  title: 'Compute stays scarce',
  slug: 'compute-stays-scarce',
  sourceRefs: [{
    _id: 'src-1',
    type: 'article',
    title: 'DOE capacity report',
    url: 'https://example.com/doe',
    snippet: 'LIBRARY_HIGHLIGHT_PASSAGE'
  }],
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    confidence: 0.87,
    why: [{ text: 'PRIVATE_NOTE_WHY_LEAK' }],
    against: [{ text: 'PRIVATE_NOTE_AGAINST_LEAK' }],
    decisionPosture: 'watch',
    verdicts: [{ verdictId: 'v1', result: 'partly', recordedAt: '2026-08-01T12:00:00.000Z', note: 'Eased in two regions.' }],
    outcomes: [{ result: 'mixed', observedAt: '2026-08-20T00:00:00.000Z', lesson: 'Capacity is lumpy.' }]
  }
};

describe('decision-memory API projection', () => {
  it('keeps owner notes on the owner projection and strips them from public', () => {
    const owner = ownerProjection(stuffed, {
      receipts: [{ kind: 'living_team_approval', at: '2026-08-31T00:00:00.000Z', summary: 'Approved.' }]
    });
    expect(owner.schema).toBe(SCHEMA_VERSION);
    expect(owner.visibility).toBe('owner');
    expect(owner.why).toContain('PRIVATE_NOTE_WHY_LEAK');
    expect(owner.claim).toMatch(/Compute stays scarce/);
    const published = publicProjection(stuffed);
    expect(published.visibility).toBe('public');
    expect(published.why).toBeUndefined();
    expect(JSON.stringify(published)).not.toMatch(/PRIVATE_NOTE_WHY_LEAK|jwt-secret|LIBRARY_HIGHLIGHT/);
    expect(JSON.stringify(published)).not.toMatch(/0\.87/);
  });

  it('refuses an anonymous read, budgets writes, and replays the audit in order', () => {
    expect(() => project({ page: stuffed, viewer: null })).toThrow(DecisionMemoryError);
    expect(() => project({ page: stuffed, viewer: null })).toThrow(/Sign in/);
    const signed = project({ page: stuffed, viewer: { id: 'user-host' } });
    expect(signed.visibility).toBe('owner');
    const writes = Array.from({ length: 60 }, (_, index) => ({ at: '2026-08-31T12:00:00.000Z', n: index }));
    expect(() => withinBudget(writes, { now: '2026-08-31T12:30:00.000Z' })).toThrow(/budget/);
    const replay = replayAudit([
      { at: '2026-08-31T13:00:00.000Z', kind: 'outcome', action: 'record', pageId: stuffed._id },
      { at: '2026-08-31T12:00:00.000Z', kind: 'claim', action: 'write', pageId: stuffed._id, requestId: 'r1' }
    ]);
    expect(replay[0].action).toBe('write');
    expect(replay[1].kind).toBe('outcome');
  });
});
