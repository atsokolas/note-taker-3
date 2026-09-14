const {
  AGENT_MANDATE_PAUSE,
  AGENT_MANDATE_TOOLS,
  GovernedResearchError,
  MANDATE_NEEDS_FIELDS,
  acceptProposal,
  evaluateAgentMandate,
  killWatch,
  openAgentMandate,
  openMandate,
  pauseAgentMandate,
  projectAgentMandate,
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

  it('names an agent assignment and pauses when the owner or budget lapses', () => {
    const mandate = openAgentMandate({
      owner: 'Athan',
      ownerId: 'owner-1',
      scope: 'This published question.',
      stop: 'Stop when the successor writes what happened later.',
      review: 'Return to this door to end or renew the assignment.',
      budget: 2
    });
    expect(mandate.tools).toBe(AGENT_MANDATE_TOOLS);
    expect(mandate.budget).toEqual({ asks: 2, remaining: 2, spent: 0 });
    expect(evaluateAgentMandate(mandate, { ownerId: 'owner-1' }).lapsed).toBe(false);
    expect(evaluateAgentMandate(mandate, { ownerId: 'gone' }).reason).toBe(AGENT_MANDATE_PAUSE.owner);
    expect(projectAgentMandate({
      owner: 'Athan',
      scope: 'This published question.',
      tools: AGENT_MANDATE_TOOLS,
      stop: 'Stop.',
      review: 'Review here.',
      budget: { asks: 2, remaining: 0, spent: 2 }
    }).pause).toBe(AGENT_MANDATE_PAUSE.budget);
    const paused = pauseAgentMandate(mandate, { reason: AGENT_MANDATE_PAUSE.ended });
    expect(paused.status).toBe('paused');
    expect(evaluateAgentMandate(paused, { ownerId: 'owner-1' }).reason).toBe(AGENT_MANDATE_PAUSE.ended);
    expect(() => openAgentMandate({ owner: 'Athan' })).toThrow(MANDATE_NEEDS_FIELDS);
    expect(projectAgentMandate({ owner: 'Athan', scope: 'Missing the rest.' })).toBeNull();
  });
});
