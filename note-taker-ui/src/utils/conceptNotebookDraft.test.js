import { buildNotebookDraftFromConcept } from './conceptNotebookDraft';

describe('buildNotebookDraftFromConcept', () => {
  it('builds a notebook payload seeded from concept state', () => {
    const createBlockId = jest.fn()
      .mockReturnValueOnce('b1')
      .mockReturnValueOnce('b2')
      .mockReturnValueOnce('b3')
      .mockReturnValueOnce('b4')
      .mockReturnValueOnce('b5')
      .mockReturnValueOnce('b6')
      .mockReturnValueOnce('b7')
      .mockReturnValueOnce('b8')
      .mockReturnValueOnce('b9')
      .mockReturnValueOnce('b10')
      .mockReturnValueOnce('b11')
      .mockReturnValueOnce('b12');

    const payload = buildNotebookDraftFromConcept({
      concept: { _id: 'concept-1', name: 'Template Concept', description: 'Why does this matter?' },
      state: {
        header: { prompt: 'Fallback framing question' },
        hypothesis: { html: '<p>The working claim.</p>' },
        cards: [
          { zone: 'supports', title: 'Support card' },
          { zone: 'contradictions', title: 'Tension card' },
          { zone: 'questions', title: 'Open question' }
        ]
      },
      currentMaturity: 'Forming',
      hypothesisVersion: { label: 'v3' },
      createBlockId
    });

    expect(payload.title).toBe('Template Concept v3 notebook draft');
    expect(payload.tags).toEqual(['Template Concept', 'concept-draft']);
    expect(payload.source).toBe('concept');
    expect(payload.importMeta).toEqual(expect.objectContaining({
      provider: 'noeis',
      sourceType: 'concept',
      sourceLabel: 'Template Concept',
      sourceUrl: '/think?tab=concepts&concept=Template%20Concept',
      externalId: 'concept-1'
    }));
    expect(payload.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'b1', type: 'heading', text: 'Template Concept' }),
      expect.objectContaining({ type: 'paragraph', text: 'The working claim.' }),
      expect.objectContaining({ type: 'bullet', text: 'Support card' }),
      expect.objectContaining({ type: 'bullet', text: 'Tension card' }),
      expect.objectContaining({ type: 'bullet', text: 'Open question' })
    ]));
    expect(payload.conceptContext).toEqual({
      conceptId: 'concept-1',
      conceptName: 'Template Concept',
      maturity: 'Forming',
      hypothesisVersion: 'v3'
    });
  });
});
