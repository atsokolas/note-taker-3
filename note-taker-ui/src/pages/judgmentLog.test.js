import { buildJudgmentLog, filterLog, omitEntry, sourceKinForCandidate, speaksWith } from './judgmentLog';

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

describe('sourceKinForCandidate', () => {
  it('shares a numbered source when the inbox already speaks in the log', () => {
    const match = sourceKinForCandidate(view, {
      id: 'highlight:a1:h1',
      sourceLabel: 'SemiAnalysis'
    });
    expect(match).toMatchObject({ n: 1, label: 'SemiAnalysis' });
  });

  it('still carries a name to whisper when the source is new', () => {
    expect(sourceKinForCandidate(view, {
      id: 'highlight:z:h',
      sourceLabel: 'On compute · FT'
    })).toEqual({ n: null, label: 'On compute · FT', href: '/library?articleId=z&highlightId=h' });
  });
});

describe('speaksWith', () => {
  const semi = { n: 1, label: 'SemiAnalysis', href: 'https://semianalysis.com/capacity' };
  const filed = { n: 3, label: 'SemiAnalysis', href: '/library?articleId=a9&highlightId=h9' };

  it('treats the same source as kin after it has been filed under a library href', () => {
    expect(speaksWith(filed, semi)).toBe(true);
    expect(speaksWith(semi, filed)).toBe(true);
  });

  it('does not invent kinship across different sources', () => {
    expect(speaksWith(filed, { n: 2, label: 'TrendForce', href: 'https://trendforce.com/supply' })).toBe(false);
  });
});
