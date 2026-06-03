import { buildThinkWikiPromotionPayload } from './thinkWikiPromotion';

describe('buildThinkWikiPromotionPayload', () => {
  it('builds a durable wiki payload from a concept', () => {
    const payload = buildThinkWikiPromotionPayload({
      type: 'concept',
      concept: {
        _id: 'concept-1',
        name: 'Margin of Safety',
        description: 'A buffer between price and intrinsic value.'
      },
      conceptQuestions: [{ text: 'How large should the buffer be?' }],
      pulledReferences: [
        {
          type: 'highlight',
          id: 'highlight-1',
          articleId: 'article-1',
          title: 'Buffett highlight',
          snippet: 'Margin of safety protects against mistakes.'
        },
        {
          type: 'wiki_page',
          id: 'wiki-1',
          title: 'Value investing'
        }
      ]
    });

    expect(payload.title).toBe('Margin of Safety');
    expect(payload.pageType).toBe('concept');
    expect(payload.initialSourceRefs).toEqual([
      {
        type: 'highlight',
        objectId: 'highlight-1',
        parentObjectId: 'article-1',
        title: 'Buffett highlight',
        snippet: 'Margin of safety protects against mistakes.',
        url: '',
        citationLabel: '',
        addedBy: 'user'
      },
      {
        type: 'external',
        objectId: '',
        parentObjectId: '',
        title: 'Value investing',
        snippet: '',
        url: '',
        citationLabel: 'wiki:wiki-1',
        addedBy: 'user'
      }
    ]);
    expect(payload.createdFrom).toMatchObject({
      type: 'concept',
      objectId: 'concept-1',
      label: 'Margin of Safety',
      path: '/think?tab=concepts&concept=Margin%20of%20Safety'
    });
    expect(JSON.stringify(payload.body)).toContain('How large should the buffer be?');
    expect(JSON.stringify(payload.body)).toContain('Promotion Provenance');
    expect(JSON.stringify(payload.body)).toContain('Pulled References');
    expect(JSON.stringify(payload.body)).toContain('Buffett highlight');
    expect(JSON.stringify(payload.body)).toContain('concept:concept-1');
    expect(JSON.stringify(payload.body)).toContain('/think?tab=concepts&concept=Margin%20of%20Safety');
    expect(JSON.stringify(payload.body)).toContain('bidirectional graph edge');
  });

  it('builds a durable wiki payload from a question', () => {
    const payload = buildThinkWikiPromotionPayload({
      type: 'question',
      question: {
        _id: 'question-1',
        text: 'Should investors concentrate or diversify?',
        linkedTagName: 'Investing'
      }
    });

    expect(payload.title).toBe('Should investors concentrate or diversify');
    expect(payload.pageType).toBe('question');
    expect(payload.createdFrom).toMatchObject({
      type: 'question',
      objectId: 'question-1',
      label: 'Investing',
      path: '/think?tab=questions&questionId=question-1'
    });
    expect(JSON.stringify(payload.body)).toContain('Source Question');
    expect(JSON.stringify(payload.body)).toContain('Investing');
    expect(JSON.stringify(payload.body)).toContain('Promotion Provenance');
    expect(JSON.stringify(payload.body)).toContain('question:question-1');
    expect(JSON.stringify(payload.body)).toContain('/think?tab=questions&questionId=question-1');
  });

  it('builds a durable wiki payload from a notebook page', () => {
    const payload = buildThinkWikiPromotionPayload({
      type: 'notebook',
      notebook: {
        _id: 'note-1',
        title: 'Research map scratchpad',
        content: '<p>Bridge source memos into a durable map.</p>',
        tags: ['wiki', 'map']
      }
    });

    expect(payload.title).toBe('Research map scratchpad');
    expect(payload.pageType).toBe('overview');
    expect(payload.createdFrom).toMatchObject({
      type: 'notebook',
      objectId: 'note-1',
      label: 'Research map scratchpad',
      path: '/think?tab=notebook&entryId=note-1'
    });
    expect(JSON.stringify(payload.body)).toContain('Bridge source memos into a durable map.');
    expect(JSON.stringify(payload.body)).toContain('Working Tags');
    expect(JSON.stringify(payload.body)).toContain('wiki');
    expect(JSON.stringify(payload.body)).toContain('Promotion Provenance');
    expect(JSON.stringify(payload.body)).toContain('notebook:note-1');
    expect(JSON.stringify(payload.body)).toContain('/think?tab=notebook&entryId=note-1');
  });
});
