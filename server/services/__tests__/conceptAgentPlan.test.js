// The model sorts the reader's own candidates into groups. A plan that names
// nothing the reader holds is no plan: the local one answers instead.
jest.mock('../../ai/hfTextClient', () => ({
  isTextGenerationConfigured: () => true,
  chatComplete: jest.fn(),
  parseStructuredText: jest.requireActual('../../ai/hfTextClient').parseStructuredText
}));

const { chatComplete } = require('../../ai/hfTextClient');
const { __testables: { planConcept, hitText } } = require('../conceptAgentService');
const { buildArticlePassages } = require('../../ai/articlePassages');

const candidateItems = [
  { type: 'article', id: 'a1', title: 'Base rates', text: 'How often it worked before.' },
  { type: 'highlight', id: 'h1', title: 'Premortem', text: 'Imagine it failed.' }
];
const plan = groups => chatComplete.mockResolvedValueOnce({ text: JSON.stringify({ groups }) });

describe('planConcept', () => {
  it('keeps only groups that name candidates, and only those refs', async () => {
    plan([
      { title: 'Track record', item_refs: [{ type: 'article', id: 'a1' }, { type: 'article', id: 'invented' }] },
      { title: 'Empty', item_refs: [{ type: 'note', id: 'x' }] }
    ]);
    const result = await planConcept({ conceptTitle: 'Forecasting', candidateItems });
    expect(result.groups).toEqual([{ title: 'Track record', item_refs: [{ type: 'article', id: 'a1' }] }]);
  });

  it('reads a plan the model wrapped in a code fence', async () => {
    chatComplete.mockResolvedValueOnce({ text: '```json\n{"groups":[{"title":"Track record","item_refs":[{"type":"article","id":"a1"}]}]}\n```' });
    const result = await planConcept({ conceptTitle: 'Forecasting', candidateItems });
    expect(result.groups.map(group => group.title)).toEqual(['Track record']);
  });

  it('answers null when no group names a candidate, so the local plan runs', async () => {
    plan([{ title: 'Nothing real', item_refs: [{ type: 'article', id: 'nope' }] }, { title: 'No refs' }]);
    expect(await planConcept({ conceptTitle: 'Forecasting', candidateItems })).toBeNull();
  });
});

describe('hitText', () => {
  it('reads a passage hit as that passage, not the opening', () => {
    const article = { _id: 'a1', title: 'Long', content: ['Opening line.', ...Array.from({ length: 5 }, (_, i) => `Later ${i} ${'word '.repeat(120)}`)].join('\n\n') };
    const [, second] = buildArticlePassages(article);
    expect(hitText({ metadata: { subId: second.subId } }, article)).toBe(second.excerpt);
    expect(hitText({}, article)).toBe(article.content);
  });
});
