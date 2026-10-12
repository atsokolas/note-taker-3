import {
  CONTEXTUAL_AGENT_CONTRACTS,
  buildContextualAgentSurface,
  filterContextualAgentHandlers,
  getContextualAgentContract,
  hasPartnerPanel,
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

  it('opens the one Partner on the Wiki workspace like every other Wiki page', () => {
    expect(resolveContextualAgentContract({ pathname: '/wiki/workspace' })?.id).toBe('agent-surface.wiki');
    expect(hasPartnerPanel('/wiki/workspace')).toBe(true);
    expect(hasPartnerPanel('/wiki/read/page-1')).toBe(true);
    expect(hasPartnerPanel('/wiki/activity/run-1')).toBe(false);
  });

  it('resolves every primary room without treating operational routes as agent surfaces', () => {
    expect(resolveContextualAgentContract({ pathname: '/library' })?.id).toBe('agent-surface.library');
    expect(resolveContextualAgentContract({ pathname: '/think' })?.id).toBe('agent-surface.think');
    expect(resolveContextualAgentContract({ pathname: '/wiki' })?.id).toBe('agent-surface.wiki');
    expect(resolveContextualAgentContract({ pathname: '/judgment/abc' })?.id).toBe('agent-surface.judgment');
    expect(resolveContextualAgentContract({ pathname: '/editions/issue-1' })?.id).toBe('agent-surface.editions');
    expect(resolveContextualAgentContract({ pathname: '/wiki/activity/run-1' })).toBeNull();
    expect(resolveContextualAgentContract({ pathname: '/settings' })).toBeNull();
  });

  it('builds exact, inspectable rail context from data while keeping policy in the contract', () => {
    expect(buildContextualAgentSurface('agent-surface.library', {
      objectType: 'article',
      objectId: 'article-1',
      roleLabel: 'Partner',
      subject: 'A source',
      lines: [null, { id: 'h', text: '2 highlights.' }]
    })).toEqual(expect.objectContaining({
      id: 'library:article:article-1',
      contractId: 'agent-surface.library',
      objectId: 'article-1',
      subject: 'A source',
      lines: [{ id: 'h', text: '2 highlights.' }],
      scope: 'this source',
      caption: 'Ask about this source.',
      supportedActions: ['retrieve', 'accept.keep'],
      proposalPolicy: 'human_acceptance'
    }));
    expect(buildContextualAgentSurface('agent-surface.missing', {})).toBeNull();
  });

  it('changes only the scope from room to room', () => {
    const scopes = [
      ['agent-surface.library', 'article', 'this source'],
      ['agent-surface.think', 'notebook', 'this note'],
      ['agent-surface.wiki', 'wiki_page', 'this page'],
      ['agent-surface.judgment', 'judgment_claim', 'this view'],
      ['agent-surface.editions', 'edition', 'this issue'],
      ['agent-surface.editions', 'editions', 'everything']
    ].map(([contractId, objectType]) => buildContextualAgentSurface(contractId, { objectType, objectId: 'x' }));
    expect(scopes.map(surface => surface.scope)).toEqual(['this source', 'this note', 'this page', 'this view', 'this issue', 'everything']);
    expect(new Set(scopes.map(surface => surface.roleLabel))).toEqual(new Set(['Partner']));
    expect(scopes[5].caption).toBe('Ask about anything you have read.');
  });

  it('fails closed when handlers exceed the registered action vocabulary', () => {
    const onAsk = jest.fn();
    const onAccept = jest.fn();
    expect(filterContextualAgentHandlers('agent-surface.library', { onAsk, onAccept, onPublish: jest.fn() }))
      .toEqual({ onAccept });
    const onTryWording = jest.fn();
    expect(filterContextualAgentHandlers('agent-surface.think', { onAccept, onTryWording })).toEqual({ onTryWording });
    expect(filterContextualAgentHandlers('agent-surface.missing', { onAsk, onAccept })).toEqual({});
    expect(getContextualAgentContract('agent-surface.library')?.room).toBe('library');
  });
});
