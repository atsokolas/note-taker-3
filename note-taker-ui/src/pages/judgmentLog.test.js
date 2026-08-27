import { buildJudgmentLog, filterLog, omitEntry } from './judgmentLog';

const NOW = new Date('2026-08-14T12:00:00.000Z').getTime();

const view = {
  why: [
    { id: 'w1', text: 'Demand compounds.', sources: [{ id: 's1', n: 1, label: 'SemiAnalysis' }], at: null },
    { id: 'w2', text: 'A fresh reason.', sources: [], at: '2026-08-10T12:00:00.000Z' }
  ],
  against: [
    { id: 'a1', text: 'In-house silicon.', sources: [{ id: 's1', n: 1, label: 'SemiAnalysis' }], at: null }
  ],
  whatIDid: [
    { id: 'd1', text: 'Started 1.5%.', at: '2026-02-14T12:00:00.000Z' }
  ]
};

describe('the judgment log', () => {
  it('keeps this month and undated lines in the open band, newest first', () => {
    const [open, earlier] = buildJudgmentLog(view, NOW);
    expect(open.open).toBe(true);
    expect(open.entries.map(entry => entry.id)).toEqual(['w2', 'w1', 'a1']);
    expect(earlier.label).toBe('February 2026');
    expect(earlier.open).toBe(false);
    expect(earlier.entries.map(entry => entry.id)).toEqual(['d1']);
  });

  it('lets a filter hide a side without inventing lines', () => {
    const groups = filterLog(buildJudgmentLog(view, NOW), 'against');
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map(entry => entry.kind)).toEqual(['against']);
  });

  it('is empty when there is nothing to hold', () => {
    expect(buildJudgmentLog({ why: [], against: [], whatIDid: [] }, NOW)).toEqual([]);
  });

  it('keeps a line still being typed out of the spine', () => {
    const [open] = omitEntry(buildJudgmentLog(view, NOW), 'w2');
    expect(open.entries.map(entry => entry.id)).toEqual(['w1', 'a1']);
  });
});
