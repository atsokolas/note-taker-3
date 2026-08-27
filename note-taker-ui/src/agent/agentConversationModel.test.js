import {
  buildAgentContext,
  mapAgentThreadMessages,
  sourceLabelForAgentMessage
} from './agentConversationModel';

describe('agent conversation model', () => {
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
