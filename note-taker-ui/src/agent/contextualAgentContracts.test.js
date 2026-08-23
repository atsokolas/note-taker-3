import {
  CONTEXTUAL_AGENT_CONTRACTS,
  buildContextualAgentSurface,
  filterContextualAgentHandlers,
  getContextualAgentContract,
  hasContextualAgentRail,
  resolveContextualAgentContract
} from './contextualAgentContracts';

describe('contextual agent contracts', () => {
  it('has one stable identity per room projection and no duplicate contracts', () => {
    const ids = CONTEXTUAL_AGENT_CONTRACTS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    CONTEXTUAL_AGENT_CONTRACTS.forEach(item => {
      expect(item.schemaVersion).toBe(1);
      expect(item.proposalPolicy).toBe('human_acceptance');
      expect(item.capabilities.length).toBeGreaterThan(0);
      expect(item.actions.length).toBeGreaterThan(0);
    });
  });

  it('gives the richer Wiki workspace one embedded owner instead of a second rail', () => {
    const workspace = resolveContextualAgentContract({ pathname: '/wiki/workspace' });
    expect(workspace).toEqual(expect.objectContaining({
      id: 'agent-surface.wiki-workspace',
      agentId: 'agent.context-partner',
      presentation: 'embedded'
    }));
    expect(workspace.actions).toEqual(expect.arrayContaining(['build', 'ingest', 'lint', 'maintain']));
    expect(hasContextualAgentRail('/wiki/workspace')).toBe(false);
    expect(hasContextualAgentRail('/wiki/read/page-1')).toBe(true);
  });

  it('resolves every primary room without treating operational routes as agent surfaces', () => {
    expect(resolveContextualAgentContract({ pathname: '/library' })?.id).toBe('agent-surface.library');
    expect(resolveContextualAgentContract({ pathname: '/think' })?.id).toBe('agent-surface.think');
    expect(resolveContextualAgentContract({ pathname: '/wiki' })?.id).toBe('agent-surface.wiki');
    expect(resolveContextualAgentContract({ pathname: '/judgment/abc' })?.id).toBe('agent-surface.judgment');
    expect(resolveContextualAgentContract({ pathname: '/wiki/activity/run-1' })).toBeNull();
    expect(resolveContextualAgentContract({ pathname: '/settings' })).toBeNull();
  });

  it('builds exact, inspectable rail context from data while keeping policy in the contract', () => {
    expect(buildContextualAgentSurface('agent-surface.library', {
      objectType: 'article',
      objectId: 'article-1',
      subject: 'A source',
      lines: [null, { id: 'h', text: '2 highlights.' }]
    })).toEqual(expect.objectContaining({
      id: 'library:article:article-1',
      contractId: 'agent-surface.library',
      objectId: 'article-1',
      subject: 'A source',
      lines: [{ id: 'h', text: '2 highlights.' }],
      supportedActions: ['retrieve', 'accept.keep'],
      proposalPolicy: 'human_acceptance'
    }));
    expect(buildContextualAgentSurface('agent-surface.wiki-workspace', {})).toBeNull();
    expect(buildContextualAgentSurface('agent-surface.missing', {})).toBeNull();
  });

  it('fails closed when handlers exceed the registered action vocabulary', () => {
    const onAsk = jest.fn();
    const onAccept = jest.fn();
    expect(filterContextualAgentHandlers('agent-surface.library', { onAsk, onAccept, onPublish: jest.fn() }))
      .toEqual({ onAsk, onAccept });
    expect(filterContextualAgentHandlers('agent-surface.wiki-workspace', { onAsk, onAccept })).toEqual({});
    expect(filterContextualAgentHandlers('agent-surface.missing', { onAsk, onAccept })).toEqual({});
    expect(getContextualAgentContract('agent-surface.library')?.room).toBe('library');
  });
});
