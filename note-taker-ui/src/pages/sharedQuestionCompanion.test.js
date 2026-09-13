import { boundCompanionLine, buildSharedQuestionCompanion, publicCompanionReadings } from './sharedQuestionCompanion';
import { questionBrief, questionContribution, questionSnapshot } from '../components/think/thinkShareFixture';

describe('sharedQuestionCompanion', () => {
  const page = questionSnapshot({
    contributions: [questionContribution()],
    brief: questionBrief(),
    yours: [questionContribution({ id: 'held', by: 'Ada', text: 'Still with the author.' })],
    here: [{ by: 'Mara' }]
  });

  it('binds the published question, placed readings, and brief — not held or presence', () => {
    expect(publicCompanionReadings(page).map((row) => row.by)).toEqual(['Mara']);
    expect(boundCompanionLine(page)).toBe(
      "Bound to this published question, Mara's reading, and the shared brief."
    );
    expect(boundCompanionLine(page)).not.toMatch(/Ada|here/i);
    expect(buildSharedQuestionCompanion({ slug: 'qslug', page })).toEqual(expect.objectContaining({
      contextType: 'shared_question',
      contextId: 'qslug',
      contextTitle: 'What survives compounding?',
      boundSources: 3,
      placeholder: 'Ask about this published question.'
    }));
    expect(buildSharedQuestionCompanion({ slug: 'qslug', page }).promptTemplates).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/related notes/i)])
    );
  });

  it('stays bound to the door when nothing else is on the page', () => {
    expect(boundCompanionLine(questionSnapshot())).toBe('Bound to this published question.');
    expect(buildSharedQuestionCompanion({ slug: 'qslug', page: questionSnapshot() }).boundSources).toBe(1);
    expect(buildSharedQuestionCompanion({ slug: '', page })).toBeNull();
  });
});
