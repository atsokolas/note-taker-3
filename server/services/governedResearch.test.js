const {
  GovernedResearchError,
  acceptProposal,
  killWatch,
  openMandate,
  proposeFromWatch,
  reverseProposal,
  serializeWatch
} = require('./governedResearch');

describe('governed autonomous research', () => {
  it('lets a watch propose once, dedupe, and stay silent when the world did not move', () => {
    const mandate = openMandate({
      purpose: 'Watch conversion prints.',
      pageId: 'page-a',
      actorId: 'user-host',
      budget: 2
    });
    const first = proposeFromWatch(mandate, {
      summary: 'DOE printed a new capacity figure.',
      source: { title: 'DOE', url: 'https://example.com/doe' },
      claimText: 'Compute stays scarce through 2027.'
    });
    expect(first.proposal.status).toBe('proposed');
    expect(first.proposal.generatedLabel).toMatch(/Not yet accepted/);
    expect(first.mandate.budget.remaining).toBe(1);
    const dup = proposeFromWatch(first.mandate, {
      summary: 'DOE printed a new capacity figure.',
      source: { title: 'DOE', url: 'https://example.com/doe' },
      claimText: 'Compute stays scarce through 2027.'
    });
    expect(dup.proposal.duplicateOf).toBe(first.proposal.id);
    expect(dup.mandate.budget.remaining).toBe(1);
    const quiet = proposeFromWatch(mandate, { summary: '' });
    expect(quiet.silence).toBe('The world did not move.');
    expect(serializeWatch(quiet.mandate).note).toMatch(/did not move/);
  });

  it('requires a human accept, can reverse, and can kill the watch', () => {
    let mandate = openMandate({ purpose: 'Watch prices.', pageId: 'page-a', actorId: 'host', budget: 1 });
    const proposed = proposeFromWatch(mandate, {
      summary: 'Spot prices fell through the median.',
      source: { title: 'Spot' }
    });
    mandate = acceptProposal(proposed.mandate, proposed.proposal.id, { actorId: 'host' });
    expect(mandate.proposals[0].status).toBe('accepted');
    mandate = reverseProposal(mandate, proposed.proposal.id, { actorId: 'host' });
    expect(mandate.proposals[0].status).toBe('reversed');
    mandate = killWatch(mandate, { actorId: 'host' });
    expect(mandate.status).toBe('killed');
    expect(() => proposeFromWatch(mandate, { summary: 'Later news.' })).toThrow(GovernedResearchError);
    expect(serializeWatch(mandate).killed).toBe(true);
  });
});
