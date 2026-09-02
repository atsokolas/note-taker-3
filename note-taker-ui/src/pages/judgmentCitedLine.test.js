import { upsertLineIntoJudgment } from './judgmentModel';

/*
 * A reason and the thing it rests on, written in one gesture.
 *
 * Until now the only way a source reached a Why or an Against was to accept
 * one an agent had already brought you. A reason you wrote yourself could
 * never say where it came from — which is the one question the case exists to
 * answer later.
 */

const page = { judgment: { why: [], against: [] } };
const source = {
  id: 'src-10k',
  label: 'SemiAnalysis — wafer economics',
  href: '/articles/src-10k'
};

const lineOf = (judgment, field = 'why') => judgment[field].at(-1);

describe('a cited reason', () => {
  it('carries the source it was written against', () => {
    const judgment = upsertLineIntoJudgment(page, 'Lead times are stretching.', 'why', 'why-1', source);
    expect(lineOf(judgment)).toMatchObject({
      reasonId: 'why-1',
      text: 'Lead times are stretching.',
      sourceLabel: 'SemiAnalysis — wafer economics',
      sourceRefIds: ['src-10k']
    });
  });

  it('binds a source to an Against the same way', () => {
    const judgment = upsertLineIntoJudgment(page, 'In-house silicon lands sooner.', 'against', 'a-1', source);
    expect(lineOf(judgment, 'against')).toMatchObject({ sourceLabel: 'SemiAnalysis — wafer economics' });
  });

  it('leaves an uncited line uncited rather than inventing a provenance', () => {
    const judgment = upsertLineIntoJudgment(page, 'A hunch.', 'why', 'why-2');
    expect(lineOf(judgment).sourceLabel).toBeUndefined();
    expect(lineOf(judgment).sourceRefIds).toBeUndefined();
  });

  /* The line autosaves while it is being typed, so the same id is written
     several times. The source must survive that, and must be replaceable. */
  it('keeps the source across the rewrites autosave makes', () => {
    const first = upsertLineIntoJudgment(page, 'Lead times', 'why', 'why-3', source);
    const second = upsertLineIntoJudgment({ judgment: first }, 'Lead times are stretching', 'why', 'why-3', source);
    expect(second.why).toHaveLength(1);
    expect(lineOf(second)).toMatchObject({
      text: 'Lead times are stretching',
      sourceLabel: 'SemiAnalysis — wafer economics'
    });
  });

  it('takes a different source when the writer changes their mind', () => {
    const first = upsertLineIntoJudgment(page, 'Lead times', 'why', 'why-4', source);
    const swapped = upsertLineIntoJudgment(
      { judgment: first },
      'Lead times',
      'why',
      'why-4',
      { id: 'other', label: 'Costco 10-K', href: '/articles/other' }
    );
    expect(lineOf(swapped)).toMatchObject({ sourceLabel: 'Costco 10-K', sourceRefIds: ['other'] });
  });

  /* An untouched line goes back through the persist shape, which spells "no
     source" as an empty string rather than a missing key. Either way it cites
     nothing, which is what matters. */
  it('does not disturb the lines already written', () => {
    const first = upsertLineIntoJudgment(page, 'One.', 'why', 'why-5');
    const second = upsertLineIntoJudgment({ judgment: first }, 'Two.', 'why', 'why-6', source);
    expect(second.why.map(line => line.text)).toEqual(['One.', 'Two.']);
    expect(second.why[0].sourceLabel).toBeFalsy();
    expect(lineOf(second).sourceLabel).toBe('SemiAnalysis — wafer economics');
  });
});
