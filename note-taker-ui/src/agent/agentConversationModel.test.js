import {
  buildAgentEvidenceCandidates,
  buildAgentContext,
  mapAgentThreadMessages,
  sourceLabelForAgentMessage
} from './agentConversationModel';

describe('agent conversation model', () => {
  it('turns only exact, Library-openable article excerpts into Judgment evidence', () => {
    expect(buildAgentEvidenceCandidates([
      { type: 'article', id: 'article-1', title: 'Grid queues', snippet: 'Interconnection waits still constrain new supply.' },
      { type: 'wiki_page', id: 'wiki-1', title: 'A synthesis', snippet: 'Agent-written synthesis.' },
      { type: 'article', id: 'article-2', title: 'Empty excerpt', snippet: '   ' }
    ])).toEqual([{
      sentence: 'Interconnection waits still constrain new supply.',
      body: 'Interconnection waits still constrain new supply.',
      source: 'Grid queues',
      sourceLabel: 'Grid queues',
      acceptedFrom: 'article:article-1'
    }]);
  });

  it('binds a Wiki and Judgment page to the exact accepted page identity', () => {
    expect(buildAgentContext({
      room: 'wiki',
      contractId: 'agent-surface.wiki',
      objectType: 'wiki_page',
      objectId: 'page-1',
      subject: 'Compound interest'
    })).toEqual(expect.objectContaining({
      type: 'wiki_page',
      id: 'page-1',
      pageId: 'page-1',
      title: 'Compound interest',
      metadata: expect.objectContaining({ room: 'wiki', objectType: 'wiki_page' })
    }));

    expect(buildAgentContext({
      room: 'judgment',
      objectType: 'judgment_claim',
      objectId: 'page-2',
      subject: 'A live claim'
    })).toEqual(expect.objectContaining({
      type: 'wiki_page',
      id: 'page-2',
      pageId: 'page-2'
    }));
  });

  it('keeps an opened Wiki sentence on the accepted page', () => {
    expect(buildAgentContext({
      room: 'wiki',
      contractId: 'agent-surface.wiki',
      objectType: 'wiki_claim',
      objectId: 'claim-1',
      pageId: 'page-1',
      subject: 'Children need room to make mistakes.'
    })).toEqual(expect.objectContaining({
      type: 'wiki_page',
      id: 'page-1',
      pageId: 'page-1',
      title: 'Children need room to make mistakes.',
      metadata: expect.objectContaining({
        objectType: 'wiki_claim',
        claimId: 'claim-1',
        primaryText: 'Children need room to make mistakes.'
      })
    }));
    expect(buildAgentContext({
      objectType: 'wiki_claim',
      objectId: 'claim-1'
    })).toBeNull();
  });

  it('forwards the exact private authored exploration with its selected Library source', () => {
    const exploration = {
      claimId: 'claim-1',
      draft: {
        writing: 'Recoverable error can be a form of care.',
        question: 'Where does protection become control?',
        pressure: {
          premise: 'The cost of one mistake rises sharply.'
        },
        selectedSource: {
          articleId: 'article-7',
          highlightId: '',
          title: 'The Uses of Error',
          passage: 'A reversible mistake preserves another attempt.',
          anchor: {
            text: 'A reversible mistake preserves another attempt.',
            prefix: 'Learning remains possible when ',
            suffix: ' That distinction matters.',
            startOffsetApprox: 96
          }
        }
      }
    };

    expect(buildAgentContext({
      room: 'wiki',
      contractId: 'agent-surface.wiki',
      objectType: 'wiki_claim',
      objectId: 'claim-1',
      pageId: 'page-1',
      subject: 'Children need room to make mistakes.',
      exploration
    })).toEqual(expect.objectContaining({
      type: 'wiki_page',
      id: 'page-1',
      metadata: expect.objectContaining({ exploration })
    }));
  });

  it('keeps ordinary Wiki, Library, and Think contexts unchanged', () => {
    const contexts = [
      buildAgentContext({ room: 'wiki', objectType: 'wiki_page', objectId: 'wiki-1', exploration: { private: true } }),
      buildAgentContext({ room: 'library', objectType: 'article', objectId: 'article-1', exploration: { private: true } }),
      buildAgentContext({ room: 'think', objectType: 'concept', objectId: 'concept-1', exploration: { private: true } })
    ];
    expect(contexts).toEqual([
      expect.objectContaining({ type: 'wiki_page', id: 'wiki-1', pageId: 'wiki-1' }),
      expect.objectContaining({ type: 'article', id: 'article-1' }),
      expect.objectContaining({ type: 'concept', id: 'concept-1' })
    ]);
    contexts.forEach((context) => expect(context.metadata).not.toHaveProperty('exploration'));
  });

  it('keeps durable thread messages and their provenance presentation-safe', () => {
    const messages = mapAgentThreadMessages({
      threadId: 'thread-1',
      messages: [
        { role: 'user', text: 'What changed?', createdAt: 'now' },
        {
          role: 'assistant',
          text: 'The evidence changed.',
          relatedItems: [{ title: 'Primary source' }],
          metadata: {
            premiumWebResearchAvailable: true,
            capability: {
              id: 'capability.workspace.retrieve',
              boundary: 'automatic'
            },
            modelRoute: {
              profile: 'partner_chat',
              reason: 'Conversation and retrieval use the grounded partner profile.'
            }
          }
        },
        { role: 'tool', text: '' }
      ]
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(expect.objectContaining({
      role: 'assistant',
      text: 'The evidence changed.',
      premiumWebResearchAvailable: true,
      capability: expect.objectContaining({
        id: 'capability.workspace.retrieve',
        boundary: 'automatic'
      }),
      modelRoute: expect.objectContaining({
        profile: 'partner_chat'
      })
    }));
    expect(sourceLabelForAgentMessage(messages[1])).toBe('From Primary source');
  });
});
