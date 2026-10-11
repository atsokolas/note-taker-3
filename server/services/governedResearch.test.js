const {
  AGENT_MANDATE_PAUSE,
  AGENT_MANDATE_TOOLS,
  MANDATE_NEEDS_FIELDS,
  evaluateAgentMandate,
  openAgentMandate,
  pauseAgentMandate,
  projectAgentMandate
} = require('./governedResearch');

describe('agent mandate on a published question', () => {
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
