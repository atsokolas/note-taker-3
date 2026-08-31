const {
  applyFalsifiability,
  hasCriteria,
  hasHorizon,
  parseHorizon,
  proposeCriteria
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
