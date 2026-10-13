import { boundCompanionLine, buildSharedQuestionCompanion, publicCompanionReadings } from './sharedQuestionCompanion';
import { questionBrief, questionContribution, questionSnapshot, questionSuccession } from '../components/think/thinkShareFixture';

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
      placeholder: 'Ask about this published question.',
      askLabel: 'Ask about this reading'
    }));
  });

  it('stays bound to the door when nothing else is on the page', () => {
    expect(boundCompanionLine(questionSnapshot())).toBe('Bound to this published question.');
    expect(buildSharedQuestionCompanion({ slug: '', page })).toBeNull();
  });

  it('binds a successor to the frozen handoff, not the live brief or held reading', () => {
    const handed = questionSnapshot({
      contributions: [questionContribution()],
      brief: questionBrief(),
      yours: [questionContribution({ id: 'held', by: 'Ada', text: 'Still with the author.' })],
      succession: questionSuccession()
    });
    const partner = buildSharedQuestionCompanion({ slug: 'qslug', page: handed });
    expect(boundCompanionLine(handed)).toBe('Bound to this successor record.');
    expect(boundCompanionLine(handed)).not.toMatch(/Ada|brief|Library/i);
    expect(partner).toEqual(expect.objectContaining({
      contextTitle: 'The window may close before compounding pays.',
      placeholder: 'Ask about this handoff.',
      askLabel: 'Ask about this handoff'
    }));
  });

  it('names what happened later once an outcome is recorded', () => {
    const archived = questionSnapshot({
      contributions: [
        questionContribution(),
        questionContribution({ id: 'later', by: 'Nia', text: 'A reading placed after the handoff.' })
      ],
      brief: questionBrief(),
      succession: questionSuccession({
        outcome: 'The window closed. The latecomer paid.'
      })
    });
    expect(boundCompanionLine(archived)).toBe(
      "Bound to this successor record, what happened later, and Nia's later reading."
    );
  });
});
