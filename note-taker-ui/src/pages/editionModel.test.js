import {
  byInboxEdition, byPaper, bySection, closesLine, datelineLine,
  deskFor, foreignFilers, inboxEditionLine, issueLine, keepersFor, latestFilingLine,
  publicSourceHref, resolvePaperIssueId, runLine, shelfIssuesForPaper,
  sectionTones, shelfGrid, sourceLinks, standLayout, stateOf, windowLine
} from './editionModel';

describe('the window a paper covers', () => {
  it('says one month once', () => {
    expect(windowLine({ windowStart: '2026-09-01', windowEnd: '2026-09-07' })).toBe('Sep 1 – 7');
  });

  it('names both months when the week crosses one', () => {
    expect(windowLine({ windowStart: '2026-08-30', windowEnd: '2026-09-05' })).toBe('Aug 30 – Sep 5');
  });

  it('says nothing rather than Invalid Date', () => {
    expect(windowLine({ windowStart: 'someday', windowEnd: '2026-09-07' })).toBe('');
    expect(windowLine()).toBe('');
  });
});

describe('the issue line', () => {
  it('uses the paper’s own word for an issue', () => {
    expect(issueLine({ issueLabel: 'Issue', number: 14 })).toBe('Issue 14');
    expect(issueLine({ number: 3 })).toBe('Edition 3');
  });

  /* A run nobody has numbered is not issue zero. */
  it('says nothing when there is no number', () => {
    expect(issueLine({ number: null })).toBe('');
    expect(issueLine({ number: 0 })).toBe('');
    expect(issueLine()).toBe('');
  });
});

describe('the filing line', () => {
  it('separates when an agent filed from the issue window it covered', () => {
    const now = new Date('2026-09-27T18:00:00Z');
    expect(latestFilingLine({ items: [{ filedAt: '2026-09-27T10:02:38.987Z' }] }, now))
      .toBe('Filed today');
    expect(latestFilingLine({ items: [{ filedAt: '2026-09-26T10:02:38.987Z' }] }, now))
      .toBe('Filed yesterday');
  });

  it('stays quiet when an edition has no filing time', () => {
    expect(latestFilingLine({ items: [{}] }, new Date('2026-09-27T18:00:00Z'))).toBe('');
  });
});

describe('reading it in sections', () => {
  const sections = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];

  it('keeps the order the profile names, empty sections included', () => {
    const read = bySection({ sections, items: [{ section: 'b', title: 'two' }] });
    expect(read.map(entry => entry.key)).toEqual(['a', 'b']);
    expect(read[0].items).toEqual([]);
    expect(read[1].items).toHaveLength(1);
  });

  /* The validator refuses unknown sections on the way in, so this only fires
     when a profile's sections change under an edition already filed. Those
     items still get read rather than silently vanishing. */
  it('still shows an item whose section the profile no longer names', () => {
    const read = bySection({ sections, items: [{ section: 'gone', title: 'orphan' }] });
    expect(read[read.length - 1]).toMatchObject({ label: 'Elsewhere' });
    expect(read[read.length - 1].items).toHaveLength(1);
  });

  it('adds no Elsewhere when every item has a home', () => {
    const read = bySection({ sections, items: [{ section: 'a' }] });
    expect(read.map(entry => entry.label)).toEqual(['A', 'B']);
    expect(bySection()).toEqual([]);
  });

  /* No configured columns is silence. Inventing Elsewhere — or evidence /
     counter-evidence — would be filler. */
  it('does not invent a column when none were configured', () => {
    expect(bySection({
      sections: [],
      items: [{ section: 'deployment', title: 'A finding' }]
    })).toEqual([]);
  });

  it('hands unsectioned items through as a list, not a role', () => {
    const items = [{ section: 'deployment', title: 'A finding' }];
    expect(standLayout({ sections: [], items })).toEqual({
      ready: true,
      columns: [],
      looseItems: items
    });
    expect(standLayout({ sections, items: [{ section: 'a' }] }).looseItems).toEqual([]);
    expect(standLayout(null).ready).toBe(false);
  });


});

describe('whether an agent kept its promise', () => {
  const week = (n) => ({ windowStart: new Date(Date.UTC(2026, 8, 6 - n * 7)).toISOString() });
  const month = (n) => ({ windowStart: new Date(Date.UTC(2026, 8 - n, 1)).toISOString() });

  it('counts a run of consecutive windows', () => {
    expect(runLine([week(0), week(1), week(2), week(3)])).toBe('4 weeks running, not one missed');
  });

  /* Measured against the paper's own rhythm: a monthly is not accused of
     missing fifty weeks. */
  it('reads a monthly in months', () => {
    expect(runLine([month(0), month(1), month(2)])).toBe('3 months running, not one missed');
  });

  /* One issue is not yet a periodical. */
  it('says nothing below a run', () => {
    expect(runLine([week(0)])).toBe('');
    expect(runLine([])).toBe('');
    expect(runLine()).toBe('');
  });

  /* Three editions filed in one afternoon are not a three-week run. */
  it('counts windows, not filings', () => {
    expect(runLine([week(0), week(0), week(0)])).toBe('');
  });

  it('stops at the first window missed', () => {
    expect(runLine([week(0), week(1), week(2), week(6), week(7)]))
      .toBe('3 weeks running, not one missed');
  });

  it('survives an edition with no window', () => {
    expect(() => runLine([{ windowStart: 'nonsense' }, week(0), week(1), week(2)])).not.toThrow();
  });
});

describe('the stand, arranged as papers', () => {
  const issue = (profile, number, startDay) => ({
    _id: `${profile}-${number}`,
    profile,
    profileLabel: profile === 'ai' ? 'This Week in AI' : 'Weekend Readings',
    issueLabel: 'Issue',
    number,
    windowStart: new Date(Date.UTC(2026, 8, startDay)).toISOString(),
    windowEnd: new Date(Date.UTC(2026, 8, startDay + 6)).toISOString()
  });

  /* Editions arrive newest-first across every profile, which reads as a pile. */
  it('gathers each profile into one paper, oldest issue first', () => {
    const papers = byPaper([issue('ai', 2, 13), issue('weekend', 1, 6), issue('ai', 1, 6)]);
    expect(papers).toHaveLength(2);
    const ai = papers.find(paper => paper.profile === 'ai');
    expect(ai.title).toBe('This Week in AI');
    expect(ai.issues.map(row => row.number)).toEqual([1, 2]);
    /* Without a filing timestamp, the latest calendar window remains current. */
    expect(ai.current).toBe(1);
    expect(papers[0].profile).toBe('ai');
  });

  it('opens the edition most recently filed, even when its window is older', () => {
    const past = {
      ...issue('weekend', 3, 6),
      updatedAt: '2026-09-27T10:02:38.987Z'
    };
    const future = {
      ...issue('weekend', 4, 20),
      updatedAt: '2026-09-20T10:03:47.010Z'
    };
    const [paper] = byPaper([future, past]);
    expect(paper.current).toBe(0);
    expect(paper.issues[paper.current]._id).toBe(past._id);
  });

  it('ignores a row with no paper to belong to', () => {
    expect(byPaper([{ _id: 'x' }])).toEqual([]);
    expect(byPaper()).toEqual([]);
  });
});

describe('new arrivals nested under their edition', () => {
  const arrival = (over = {}) => ({
    editionId: 'e2',
    itemId: 'i1',
    title: 'Fresh',
    profileLabel: 'This Week in AI',
    issueLabel: 'Issue',
    number: 2,
    ...over
  });

  it('gathers a pile back under the issues that filed them', () => {
    const groups = byInboxEdition([
      arrival(),
      arrival({ editionId: 'w1', itemId: 'i2', title: 'Weekend', profileLabel: 'Weekend Readings', number: 1 }),
      arrival({ itemId: 'i3', title: 'Also fresh' })
    ]);
    expect(groups.map(group => group.editionId)).toEqual(['e2', 'w1']);
    expect(groups[0].items.map(item => item.itemId)).toEqual(['i1', 'i3']);
    expect(groups[0].title).toBe('This Week in AI');
    expect(groups[0].issue).toBe('Issue 2');
    expect(inboxEditionLine(groups[0])).toBe('This Week in AI · Issue 2');
  });

  it('keeps an unnumbered issue as the paper’s name', () => {
    expect(inboxEditionLine({ title: 'Weekend Readings', issue: '' })).toBe('Weekend Readings');
  });

  it('says nothing about an empty pile', () => {
    expect(byInboxEdition([])).toEqual([]);
    expect(byInboxEdition()).toEqual([]);
  });
});

describe('the tense of an issue', () => {
  const at = (day) => Date.UTC(2026, 8, day);
  const window = { windowStart: '2026-09-06', windowEnd: '2026-09-12' };

  /* The whole stand turns on this: an issue inside its window is still being
     written, and one past it has finished. */
  it('is filling inside its window and closed after it', () => {
    expect(stateOf(window, at(9))).toBe('filling');
    expect(stateOf(window, at(6))).toBe('filling');
    expect(stateOf(window, at(15))).toBe('closed');
  });

  /* The window includes its last day, so Saturday is not already over. */
  it('is still filling on the day it closes', () => {
    expect(stateOf(window, at(12) + 60 * 60 * 1000)).toBe('filling');
  });

  it('is open before it begins', () => {
    expect(stateOf(window, at(1))).toBe('open');
  });

  /* Not a countdown. A paper says which day it goes to press. */
  it('names the day it closes', () => {
    expect(closesLine(window, at(9))).toBe('Closes Saturday');
    expect(closesLine(window, at(12) + 60 * 60 * 1000)).toBe('Closes today');
    expect(closesLine(window, at(20))).toBe('Closed');
    expect(closesLine({ windowStart: '2026-09-01', windowEnd: '2026-09-30' }, at(2))).toBe('Closes September 30');
  });
});

describe('the dateline a paper prints', () => {
  it('names the days and spells the month', () => {
    expect(datelineLine({ windowStart: '2026-09-06', windowEnd: '2026-09-12' }))
      .toBe('Sunday 6 – Saturday 12 September 2026');
  });

  it('names both months when the window crosses one', () => {
    expect(datelineLine({ windowStart: '2026-08-30', windowEnd: '2026-09-05' }))
      .toBe('Sunday 30 August – Saturday 5 September 2026');
  });

  /* A single day says one date, not the same date twice. */
  it('sets a daily issue as one day', () => {
    expect(datelineLine({ windowStart: '2026-09-09', windowEnd: '2026-09-09' }))
      .toBe('Wednesday 9 September 2026');
  });

  /* A whole month is a month, not the 1st through the 30th. */
  it('sets a monthly issue as its month', () => {
    expect(datelineLine({ windowStart: '2026-09-01', windowEnd: '2026-09-30' })).toBe('September 2026');
  });

  it('says nothing without a window', () => {
    expect(datelineLine()).toBe('');
  });
});

describe('a source a stranger may follow', () => {
  it('keeps http(s) and drops javascript', () => {
    expect(publicSourceHref('https://example.com/p')).toBe('https://example.com/p');
    expect(publicSourceHref('javascript:alert(1)')).toBe('');
    expect(publicSourceHref('not a url')).toBe('');
  });
});

describe('the sources an issue cites', () => {
  it('lists followable items once, labelled from what they already carried', () => {
    expect(sourceLinks({
      items: [
        { title: 'A paper', url: 'https://example.com/a', sourceLabel: 'arXiv' },
        { title: 'Same url again', url: 'https://example.com/a', sourceLabel: 'arXiv' },
        { title: 'Another', url: 'https://example.com/b' }
      ]
    })).toEqual([
      { href: 'https://example.com/a', label: 'arXiv · A paper', sourceDate: '' },
      { href: 'https://example.com/b', label: 'Another', sourceDate: '' }
    ]);
  });

  it('drops javascript and empty urls rather than inventing a link', () => {
    expect(sourceLinks({
      items: [
        { title: 'Unsafe', url: 'javascript:alert(1)' },
        { title: 'No url' },
        { title: 'Blank', url: '   ' }
      ]
    })).toEqual([]);
  });

  it('stays silent when there is nothing to cite', () => {
    expect(sourceLinks({ items: [] })).toEqual([]);
    expect(sourceLinks()).toEqual([]);
  });

  it('falls back to the host rather than a placeholder name', () => {
    expect(sourceLinks({ items: [{ url: 'https://www.example.com/p' }] })).toEqual([
      { href: 'https://www.example.com/p', label: 'example.com', sourceDate: '' }
    ]);
  });
});

describe('the editions shelf', () => {
  const issues = [
    { _id: 'i1', windowStart: '2026-09-06', windowEnd: '2026-09-12', number: 2 },
    { _id: 'i2', windowStart: '2026-09-13', windowEnd: '2026-09-19', number: 3 },
    { _id: 'i0', windowStart: '2026-08-30', windowEnd: '2026-09-05', number: 1 }
  ];

  it('keeps a historical selection visible outside the recent window', () => {
    const many = Array.from({ length: 14 }, (_, index) => ({
      _id: `e${index}`,
      windowStart: `2026-01-${String(index + 1).padStart(2, '0')}`,
      windowEnd: `2026-01-${String(index + 1).padStart(2, '0')}`
    }));
    const rows = shelfIssuesForPaper(many, 'e0', 12);
    expect(rows.some((row) => row._id === 'e0')).toBe(true);
    expect(rows.length).toBe(13);
  });

  it('returns the remembered issue for a paper when it still exists', () => {
    const paper = { profile: 'weekend', issues, current: 1 };
    expect(resolvePaperIssueId(paper, () => ({ issueId: 'i0' }))).toBe('i0');
    expect(resolvePaperIssueId(paper, () => ({ issueId: 'missing' }))).toBe('i2');
  });
});

describe('who keeps each column', () => {
  const sections = [{ key: 'infra', label: 'Infrastructure' }, { key: 'counter', label: 'Counter-evidence' }];
  const by = (section, filedBy, filedByRuntime = '') => ({ section, filedBy, filedByRuntime });
  const issues = [
    { items: [by('infra', 'Codex job', 'codex'), by('infra', 'Codex job', 'codex'), by('counter', 'Claude', 'claude-code')] },
    { items: [by('infra', 'Claude', 'claude-code'), by('counter', 'Codex job', 'codex')] }
  ];

  it('names the keeper the reader configured', () => {
    const keepers = keepersFor(issues, [{ ...sections[0], keeper: { runtime: 'claude-code', label: 'Claude' } }]);
    expect(keepers.infra).toEqual({ agent: expect.objectContaining({ key: 'claude-code' }), derived: false });
  });

  it('offers the most frequent filer as derived, and names no one on a tie', () => {
    const keepers = keepersFor(issues, sections);
    expect(keepers.infra).toEqual({ agent: expect.objectContaining({ key: 'codex' }), derived: true });
    expect(keepers.counter).toBeNull();
  });

  it('marks the hands that filed into a column other than its keeper', () => {
    const keepers = keepersFor(issues, sections);
    expect(foreignFilers(issues[1], keepers)).toEqual({
      infra: [expect.objectContaining({ key: 'claude-code' })],
      counter: [expect.objectContaining({ key: 'codex' })]
    });
    expect(foreignFilers(issues[0], keepers).infra).toBeUndefined();
  });
});

describe('the run as a storage unit', () => {
  const sections = [
    { key: 'models', label: 'Models & methods' },
    { key: 'infra', label: 'Infrastructure & systems' },
    { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence' }
  ];
  const codex = (section, extra = {}) => ({ section, filedBy: 'Codex job', filedByRuntime: 'codex', ...extra });
  const issue = (number, filings, silences = []) => ({
    _id: `issue-${number}`,
    number,
    windowStart: `2026-09-${String(number * 7).padStart(2, '0')}`,
    windowEnd: `2026-09-${String(number * 7 + 6).padStart(2, '0')}`,
    sections,
    filings,
    silences
  });
  const paper = {
    current: 2,
    issues: [
      issue(1, [codex('models'), codex('infra'), codex('evaluation_counterevidence'), codex('evaluation_counterevidence')]),
      issue(2, [codex('models')], [{ key: 'infra', state: 'unreported', by: [] }]),
      issue(3, [codex('models'), { section: 'evaluation_counterevidence', filedBy: 'Claude', filedByRuntime: 'claude-code' }],
        [{ key: 'infra', state: 'checked', by: [{ label: 'Codex job', runtime: 'codex' }] }])
    ]
  };

  it('draws a row per issue, oldest first, and a bay in each of the four states', () => {
    const grid = shelfGrid(paper, 'issue-3');
    expect(grid.rows.map(row => row.label)).toEqual(['1 · Sep 7', '2 · Sep 14', '3 · Sep 21']);
    expect(grid.rows[2].current).toBe(true);
    expect(grid.rows[1].cells.map(cell => cell.state)).toEqual(['filled', 'unreported', 'unknown']);
    expect(grid.rows[2].cells[1]).toEqual(expect.objectContaining({ state: 'checked', count: 0 }));
    expect(grid.rows[0].cells[2]).toEqual(expect.objectContaining({ state: 'filled', count: 2 }));
  });

  it('marks a hand that filed outside the column it keeps', () => {
    const grid = shelfGrid(paper, 'issue-3');
    expect(grid.sections[2].keeper).toEqual({ agent: expect.objectContaining({ key: 'codex' }), derived: true });
    expect(grid.rows[2].cells[2].foreign).toEqual([expect.objectContaining({ key: 'claude-code' })]);
    expect(grid.rows[0].cells[2].foreign).toEqual([]);
  });

  it('holds at most the rail’s twelve issues, the open one kept', () => {
    const long = { current: 19, issues: Array.from({ length: 20 }, (_, index) => issue(index + 1, [])) };
    long.issues.forEach((row, index) => { row.windowStart = new Date(Date.UTC(2026, 0, 1 + index * 7)).toISOString(); });
    const grid = shelfGrid(long, 'issue-2');
    expect(grid.rows).toHaveLength(13);
    expect(grid.rows[0].issueId).toBe('issue-2');
  });

  it('colours counter-evidence red and the rest in profile order', () => {
    expect(sectionTones(sections)).toEqual({ models: 'blue', infra: 'ochre', evaluation_counterevidence: 'red' });
  });

  it('shows no desk for a paper one agent keeps', () => {
    const single = { ...paper, issues: paper.issues.slice(0, 2) };
    expect(deskFor(single, single.issues[1])).toEqual([]);
  });

  it('says what each hand did this issue and how much of its filing the reader kept', () => {
    const now = Date.parse('2026-10-09');
    const withSaved = { ...paper, issues: [{ ...paper.issues[0], filings: [codex('models', { saved: true }), codex('infra'), codex('evaluation_counterevidence'), codex('evaluation_counterevidence')] }, ...paper.issues.slice(1)] };
    const desk = deskFor(withSaved, { ...withSaved.issues[2], filings: [codex('models', { filedAt: '2026-10-06T09:00:00Z' })] }, now);
    expect(desk.map(hand => [hand.agent.name, hand.thisIssue, hand.kept])).toEqual([
      ['Codex', 'Filed Oct 6', 'Kept by you: 1 of 6'],
      ['Claude', 'Not reported', 'Kept by you: 0 of 1']
    ]);
    expect(desk[0].usually).toEqual(['every column']);
  });
});
