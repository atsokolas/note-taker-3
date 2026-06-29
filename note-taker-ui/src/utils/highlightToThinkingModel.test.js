import {
  buildQuestionPayloadFromHighlights,
  buildWikiSectionPayloadFromHighlights,
  deriveQuestionDraftText,
  parseHighlightToQuestionIntent,
  parseHighlightToWikiSectionIntent,
  resolveHighlightsForIntent,
  writeHighlightActionContext
} from './highlightToThinkingModel';

describe('highlightToThinkingModel', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('parses highlight-to-question commands with topic or selected-context phrasing', () => {
    expect(parseHighlightToQuestionIntent('turn my highlights on incentives into a question')).toMatchObject({
      topic: 'incentives',
      useContextHighlights: false
    });
    expect(parseHighlightToQuestionIntent('turn these highlights into a question')).toMatchObject({
      useContextHighlights: true,
      label: 'Turn selected highlights into a question'
    });
    expect(parseHighlightToQuestionIntent('incentives')).toBe(null);
  });

  it('parses highlight-to-wiki-section commands', () => {
    expect(parseHighlightToWikiSectionIntent('turn these highlights into a wiki section draft')).toMatchObject({
      useContextHighlights: true
    });
    expect(parseHighlightToWikiSectionIntent('turn my highlights on compounding into a wiki section')).toMatchObject({
      topic: 'compounding'
    });
  });

  it('resolves selected highlights from session context for "these highlights" intents', () => {
    writeHighlightActionContext([
      { _id: 'h1', text: 'Margin of safety matters', articleId: 'a1' },
      { _id: 'h2', text: 'Risk is not volatility', articleId: 'a2' }
    ]);
    const resolved = resolveHighlightsForIntent({
      intent: { useContextHighlights: true },
      searchGroups: { highlights: [] }
    });
    expect(resolved).toHaveLength(2);
    expect(resolved[0]._id).toBe('h1');
  });

  it('builds a reviewable question payload with highlight refs', () => {
    const payload = buildQuestionPayloadFromHighlights({
      highlights: [{ _id: 'h1', text: 'Incentives drive behavior', tags: ['Economics'] }],
      topic: 'incentives',
      createId: () => 'block-1'
    });
    expect(payload.text).toContain('incentives');
    expect(payload.conceptName).toBe('Economics');
    expect(payload.linkedHighlightIds).toEqual(['h1']);
    expect(payload.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'highlight-ref', highlightId: 'h1' })
    ]));
  });

  it('builds a wiki section payload with selected highlight sources', () => {
    const payload = buildWikiSectionPayloadFromHighlights({
      highlights: [
        { _id: 'h1', text: 'Compounding rewards patience', articleId: 'a1', articleTitle: 'Buffett letter' }
      ],
      topic: 'compounding'
    });
    expect(payload.createdFrom).toMatchObject({
      type: 'highlight',
      objectIds: ['h1']
    });
    expect(payload.initialSourceRefs).toEqual([
      expect.objectContaining({ type: 'highlight', objectId: 'h1' })
    ]);
    expect(payload.title).toBe('compounding');
  });

  it('derives sensible question draft text for single and multi highlight sets', () => {
    expect(deriveQuestionDraftText({
      highlights: [{ text: 'What if incentives misfire?' }],
      topic: ''
    })).toBe('What if incentives misfire?');
    expect(deriveQuestionDraftText({
      highlights: [{ text: 'Short' }, { text: 'Also short' }],
      topic: ''
    })).toBe('What question connects these 2 highlights?');
  });
});
