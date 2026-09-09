import { sameWeek, sourceKinForCandidate, speaksWith, weekKey } from './judgmentLog';

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

describe('weekKey', () => {
  it('lights two dated lines from the same week', () => {
    expect(weekKey('2026-08-10T12:00:00.000Z')).toBe(weekKey('2026-08-14T12:00:00.000Z'));
    expect(sameWeek('2026-08-10T12:00:00.000Z', { week: weekKey('2026-08-14T12:00:00.000Z') })).toBe(true);
    expect(sameWeek('2026-02-14T12:00:00.000Z', { week: weekKey('2026-08-14T12:00:00.000Z') })).toBe(false);
  });
});
