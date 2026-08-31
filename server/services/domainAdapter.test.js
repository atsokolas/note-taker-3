const {
  CHAIN,
  DomainAdapterError,
  HELD_SENTENCE,
  adapterOf,
  assertKernel,
  projectChain,
  refuse
} = require('./domainAdapter');

const page = {
  title: 'Compute stays scarce',
  sourceRefs: [{ type: 'article', title: 'DOE capacity report', url: 'https://example.com/doe' }],
  judgment: {
    currentJudgment: 'Compute stays scarce through 2027.',
    decisionPosture: 'watch',
    verdicts: [{ result: 'partly', recordedAt: '2026-08-01T12:00:00.000Z' }],
    outcomes: [{ result: 'mixed', observedAt: '2026-08-20T00:00:00.000Z' }]
  }
};

describe('domain adapter contract', () => {
  it('projects a held sentence through the same claim-to-outcome chain', () => {
    const adapter = adapterOf('held-sentence');
    expect(adapter).toBe(HELD_SENTENCE);
    expect(adapter.policy.chain).toEqual(CHAIN);
    const projected = projectChain(page, adapter);
    expect(projected.chain.claim).toBe('Compute stays scarce through 2027.');
    expect(projected.chain.evidence[0].title).toMatch(/DOE/);
    expect(projected.chain.disposition[0].result).toBe('partly');
    expect(projected.chain.decision.posture).toBe('watch');
    expect(projected.chain.outcome[0].result).toBe('mixed');
    expect(projected.vocabulary.claim).toBe('held sentence');
    expect(projected.clocks).toEqual(['evidence', 'expectation', 'decision', 'review', 'outcome']);
  });

  it('refuses a fork of the kernel and unsupported 10-K semantics', () => {
    expect(() => assertKernel({
      policy: { chain: ['ticker', 'price', 'position'] }
    })).toThrow(DomainAdapterError);
    expect(() => refuse('ticker')).toThrow(/does not speak ticker/);
    expect(() => adapterOf('ten-k')).toThrow(/No adapter named/);
    expect(() => refuse('marketplace')).toThrow(DomainAdapterError);
  });
});
