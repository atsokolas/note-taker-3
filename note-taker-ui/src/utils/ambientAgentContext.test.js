import {
  buildArticleAmbientContext,
  buildHomeAmbientContext
} from './ambientAgentContext';

describe('ambientAgentContext', () => {
  it('uses explicitly provided article highlights as related agent context', () => {
    const context = buildArticleAmbientContext({
      article: {
        _id: 'article-1',
        title: 'World Models',
        content: 'World models compress experience into latent simulations.',
        url: 'https://example.com/world-models',
        tags: ['AI systems']
      },
      highlights: [
        {
          _id: 'highlight-1',
          text: 'Agents can plan in imagination before acting.',
          note: 'Planning mechanism',
          tags: ['agency']
        },
        {
          _id: 'highlight-2',
          text: 'Abstraction can drift away from ground truth.',
          tags: ['risk']
        }
      ]
    });

    expect(context.summary).toContain('2 saved highlights');
    expect(context.relatedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'highlight',
        id: 'highlight-1',
        title: 'Agents can plan in imagination before acting.',
        snippet: 'Planning mechanism'
      }),
      expect.objectContaining({
        type: 'concept',
        id: 'AI systems',
        title: 'AI systems'
      })
    ]));
  });

  it('folds article graph backlinks into source orientation context', () => {
    const context = buildArticleAmbientContext({
      article: {
        _id: 'article-1',
        title: 'Learning from Peter Keefe',
        content: 'Temperament is the active edge.',
        url: 'https://example.com/keefe'
      },
      graphConnections: {
        outgoing: [
          {
            _id: 'edge-out',
            relationType: 'supports',
            toType: 'wiki_page',
            toId: 'wiki-1',
            target: {
              title: 'Investor Temperament',
              snippet: 'A settled synthesis about patient judgment.'
            }
          }
        ],
        incoming: [
          {
            _id: 'edge-in',
            relationType: 'supported_by',
            fromType: 'question',
            fromId: 'question-1',
            source: {
              title: 'What makes investors patient?',
              snippet: 'A dialectical thread using this article as support.'
            }
          }
        ]
      }
    });

    expect(context.summary).toContain('Graph traces: 1 used, 1 used by');
    expect(context.nextActions).toEqual(expect.arrayContaining([
      'Use the incoming graph traces to explain where this source already matters.',
      'Follow the outgoing graph traces before treating this source in isolation.'
    ]));
    expect(context.relatedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'question',
        id: 'question-1',
        title: 'What makes investors patient?',
        snippet: expect.stringContaining('Uses this source')
      }),
      expect.objectContaining({
        type: 'wiki_page',
        id: 'wiki-1',
        title: 'Investor Temperament',
        snippet: expect.stringContaining('Referenced from this source')
      })
    ]));
  });

  it('keeps home orientation stocked with visible workspace objects', () => {
    const context = buildHomeAmbientContext({
      homeWorkingSet: {
        notebooks: [{ _id: 'note-1', title: 'Morning notes', content: 'A live note.' }],
        concepts: [{ _id: 'concept-1', name: 'Compounding knowledge', description: 'A working concept.' }],
        questions: [{ _id: 'question-1', text: 'What should compound next?' }]
      },
      recentTargets: [{ title: 'Review active concepts' }]
    });

    expect(context.summary).toContain('recent notes');
    expect(context.relatedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'notebook', id: 'note-1' }),
      expect.objectContaining({ type: 'concept', id: 'concept-1' }),
      expect.objectContaining({ type: 'question', id: 'question-1' })
    ]));
    expect(context.nextActions).toContain('Review active concepts');
  });
});
