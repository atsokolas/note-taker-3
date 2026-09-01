import { buildJudgmentLog, filterLog, omitEntry, sameWeek, sourceKinForCandidate, speaksWith, weekKey } from './judgmentLog';

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

describe('weekKey', () => {
  it('lights two dated lines from the same week', () => {
    expect(weekKey('2026-08-10T12:00:00.000Z')).toBe(weekKey('2026-08-14T12:00:00.000Z'));
    expect(sameWeek('2026-08-10T12:00:00.000Z', { week: weekKey('2026-08-14T12:00:00.000Z') })).toBe(true);
    expect(sameWeek('2026-02-14T12:00:00.000Z', { week: weekKey('2026-08-14T12:00:00.000Z') })).toBe(false);
  });
});


describe('the month boundary', () => {
  // A month boundary is a fact about the calendar, not about your thinking.
  const openEntriesOf = (groups) => groups.find(group => group.id === 'now')?.entries || [];

  it('does not fold away yesterday just because the month rolled over', () => {
    const view = {
      why: [{ id: 'w1', text: 'Written yesterday.', at: '2026-08-31T12:00:00.000Z' }],
      against: [{ id: 'a1', text: 'Written in spring.', at: '2026-03-04T12:00:00.000Z' }]
    };
    const log = buildJudgmentLog(view, new Date('2026-09-01T09:00:00.000Z').getTime());
    const open = openEntriesOf(log).map(entry => entry.text);

    expect(open).toContain('Written yesterday.');
    expect(open).not.toContain('Written in spring.');
    expect(log.find(group => group.id === '2026-03')?.open).toBe(false);
  });

  it('still folds a month once it is genuinely behind you', () => {
    const view = { why: [{ id: 'w1', text: 'Written in August.', at: '2026-08-31T12:00:00.000Z' }] };
    const log = buildJudgmentLog(view, new Date('2026-11-02T09:00:00.000Z').getTime());

    // Nothing is open on its own merits, so the existing fallback opens the
    // newest group rather than showing an empty log — but it is no longer the
    // 'now' band, which is the distinction that matters.
    expect(openEntriesOf(log)).toHaveLength(0);
    expect(log.find(group => group.id === '2026-08')).toBeTruthy();
  });

  it('crosses a year boundary without losing December', () => {
    const view = { why: [{ id: 'w1', text: 'Written in December.', at: '2026-12-30T12:00:00.000Z' }] };
    const log = buildJudgmentLog(view, new Date('2027-01-02T09:00:00.000Z').getTime());

    expect(openEntriesOf(log).map(entry => entry.text)).toContain('Written in December.');
  });
});
