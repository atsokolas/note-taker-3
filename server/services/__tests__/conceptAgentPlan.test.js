// The model sorts the reader's own candidates into groups. A plan that names
// nothing the reader holds is no plan: the local one answers instead.
jest.mock('../../ai/hfTextClient', () => ({
  isTextGenerationConfigured: () => true,
  chatComplete: jest.fn()
}));

const { chatComplete } = require('../../ai/hfTextClient');
const { __testables: { planConcept } } = require('../conceptAgentService');

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

  it('answers null when no group names a candidate, so the local plan runs', async () => {
    plan([{ title: 'Nothing real', item_refs: [{ type: 'article', id: 'nope' }] }, { title: 'No refs' }]);
    expect(await planConcept({ conceptTitle: 'Forecasting', candidateItems })).toBeNull();
  });
});
