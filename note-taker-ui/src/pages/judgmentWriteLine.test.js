import { writeLineIntoJudgment } from './judgmentModel';

/* Three of the four fields could only be reached by accepting an agent's line,
   so a judgment you started yourself had a claim and nothing under it. */
describe('writing a line by hand', () => {
  it('appends to Why without disturbing what is already there', () => {
    const page = { judgment: { why: [{ reasonId: 'r1', text: 'It held last quarter.', sourceRefIds: [], sourceLabel: 'Ledger' }] } };
    const next = writeLineIntoJudgment(page, 'The incentive points the same way.', 'why');
    expect(next.why.map(line => line.text)).toEqual(['It held last quarter.', 'The incentive points the same way.']);
    expect(next.why[0].sourceLabel).toBe('Ledger');
    expect(next.why[1].at).toEqual(expect.any(String));
  });

  it('writes a falsifier under "I’d change my mind if"', () => {
    const next = writeLineIntoJudgment({ judgment: {} }, 'Two quarters of falling margin.', 'changeMindIf');
    expect(next.falsifiers).toEqual([{ text: 'Two quarters of falling margin.' }]);
  });

  it('dates a ledger line and marks it taken, because it already happened', () => {
    const next = writeLineIntoJudgment({ judgment: {} }, 'Sold half the position.', 'whatIDid');
    expect(next.decisions).toHaveLength(1);
    expect(next.decisions[0].summary).toBe('Sold half the position.');
    expect(next.decisions[0].status).toBe('taken');
    expect(Number.isFinite(new Date(next.decisions[0].decidedAt).getTime())).toBe(true);
  });

  it('writes nothing for an empty line', () => {
    const judgment = { why: [] };
    expect(writeLineIntoJudgment({ judgment }, '   ', 'why')).toBe(judgment);
  });
});
