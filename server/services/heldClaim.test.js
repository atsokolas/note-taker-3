const { ensureHeldClaim, findHeldClaim } = require('./heldClaim');

describe('held claim ledger', () => {
  it('stamps a per-page claim from the held sentence so the paper can see it', () => {
    const page = {
      _id: 'p1',
      userId: 'user-a',
      createdAt: new Date('2026-01-01'),
      judgment: { currentJudgment: 'Compute is scarce.', startedAt: new Date('2026-03-01') },
      claims: []
    };
    const claim = ensureHeldClaim(page, { now: new Date('2026-08-31'), actorType: 'user' });
    expect(claim.text).toBe('Compute is scarce.');
    expect(claim.history[0].actorType).toBe('user');
    expect(claim.history[0].disposition).toBe('accepted');
    expect(page.claims).toHaveLength(1);
    expect(findHeldClaim(page).claimId).toBe(claim.claimId);
  });

  it('does not invent a second claim when the sentence is already on the page', () => {
    const page = {
      _id: 'p1',
      judgment: { currentJudgment: 'Compute is scarce.' },
      claims: [{ claimId: 'kept', text: 'Compute is scarce.', history: [{ actorType: 'user' }] }]
    };
    const claim = ensureHeldClaim(page, { now: new Date('2026-08-31') });
    expect(claim.claimId).toBe('kept');
    expect(page.claims).toHaveLength(1);
  });

  it('keeps two users’ pages apart — no founder denormalization', () => {
    const a = {
      _id: 'page-a',
      userId: 'user-a',
      judgment: { currentJudgment: 'Compute is scarce.' },
      claims: []
    };
    const b = {
      _id: 'page-b',
      userId: 'user-b',
      judgment: { currentJudgment: 'Compute is scarce.' },
      claims: []
    };
    const claimA = ensureHeldClaim(a, { now: new Date('2026-08-31') });
    const claimB = ensureHeldClaim(b, { now: new Date('2026-08-31') });
    expect(claimA.claimId).not.toBe(claimB.claimId);
    expect(a.claims[0].claimId).not.toBe(b.claims[0].claimId);
  });
});
