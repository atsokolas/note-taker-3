const {
  applyFalsifiability,
  hasCriteria,
  hasHorizon,
  parseHorizon,
  proposeCriteria,
  syncClaimFalsifier
} = require('./claimFalsifiability');

describe('claim falsifiability', () => {
  it('persists criteria and horizon on a claim', () => {
    const claim = { claimId: 'c1', text: 'Compute is scarce.' };
    applyFalsifiability(claim, {
      resolutionCriteria: '  Two quarters of falling utilisation.  ',
      horizon: '2026-12-01'
    });
    expect(claim.resolutionCriteria).toBe('Two quarters of falling utilisation.');
    expect(parseHorizon(claim.horizon).toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(hasCriteria(claim)).toBe(true);
    expect(hasHorizon(claim)).toBe(true);
  });

  it('never blocks a write when criteria and horizon are omitted or unparseable', () => {
    const claim = { claimId: 'c1', text: 'Compute is scarce.', resolutionCriteria: '', horizon: null };
    expect(() => applyFalsifiability(claim, {})).not.toThrow();
    expect(() => applyFalsifiability(claim, { resolutionCriteria: '', horizon: 'not-a-date' })).not.toThrow();
    expect(claim.resolutionCriteria).toBe('');
    expect(claim.horizon).toBeNull();
    expect(hasCriteria(claim)).toBe(false);
    expect(hasHorizon(claim)).toBe(false);
  });

  it('leaves existing values when the patch omits a key', () => {
    const claim = {
      claimId: 'c1',
      resolutionCriteria: 'Capacity converts inside 90 days.',
      horizon: new Date('2026-09-15')
    };
    applyFalsifiability(claim, { resolutionCriteria: 'A new test.' });
    expect(claim.resolutionCriteria).toBe('A new test.');
    expect(parseHorizon(claim.horizon).toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('proposes criteria as a suggestion, not a write', () => {
    const claim = { claimId: 'c1', resolutionCriteria: '' };
    const suggestion = proposeCriteria({
      text: 'If signed capacity slips two quarters.',
      horizon: '2027-01-01'
    });
    expect(suggestion.autoWrite).toBe(false);
    expect(suggestion.field).toBe('criteria');
    expect(suggestion.kind).toBe('suggestion');
    expect(claim.resolutionCriteria).toBe('');
    expect(claim.horizon).toBeUndefined();
  });
});

describe('the falsifier a criteria answer should always have created', () => {
  const claim = (over = {}) => ({
    claimId: 'c1',
    text: 'Alphabet capex is defensive.',
    resolutionCriteria: 'Nvidia guides datacenter revenue down two quarters',
    ...over
  });

  it('creates one, tied to the claim and not yet observed', () => {
    const page = { judgment: { falsifiers: [] } };
    syncClaimFalsifier(page, claim());
    expect(page.judgment.falsifiers).toHaveLength(1);
    expect(page.judgment.falsifiers[0]).toMatchObject({
      falsifierId: 'claim-c1',
      observableSignal: 'Nvidia guides datacenter revenue down two quarters',
      status: 'unobserved',
      affectedClaimIds: ['c1']
    });
  });

  /* Editing the answer edits the watch, rather than growing a second one that
     fires for a sentence the reader has moved on from. */
  it('edits in place when the answer changes', () => {
    const page = { judgment: { falsifiers: [] } };
    syncClaimFalsifier(page, claim());
    syncClaimFalsifier(page, claim({ resolutionCriteria: 'Three quarters, not two' }));
    expect(page.judgment.falsifiers).toHaveLength(1);
    expect(page.judgment.falsifiers[0].observableSignal).toBe('Three quarters, not two');
  });

  /* Retired, not deleted: answering and then thinking better of it is part of
     the record. */
  it('retires the watch when the answer is cleared', () => {
    const page = { judgment: { falsifiers: [] } };
    syncClaimFalsifier(page, claim());
    syncClaimFalsifier(page, claim({ resolutionCriteria: '' }));
    expect(page.judgment.falsifiers[0].status).toBe('retired');
  });

  /* One that already fired is waiting on a person; clearing the answer must
     not quietly un-fire it. */
  it('leaves a triggered watch alone', () => {
    const page = { judgment: { falsifiers: [{
      falsifierId: 'claim-c1', observableSignal: 'x', status: 'triggered', affectedClaimIds: ['c1']
    }] } };
    syncClaimFalsifier(page, claim({ resolutionCriteria: '' }));
    expect(page.judgment.falsifiers[0].status).toBe('triggered');
  });

  it('does nothing without a page or a claim id', () => {
    expect(() => syncClaimFalsifier(null, claim())).not.toThrow();
    expect(() => syncClaimFalsifier({}, { resolutionCriteria: 'x' })).not.toThrow();
  });

  it('builds the judgment block when the page has none', () => {
    const page = {};
    syncClaimFalsifier(page, claim());
    expect(page.judgment.falsifiers).toHaveLength(1);
  });
});
