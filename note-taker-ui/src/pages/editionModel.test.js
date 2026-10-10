import {
  byHand, byPaper, bySection, datelineLine, deskFor, foreignFilers, handsOf,
  issueLine, keepersFor, latestFilingLine, newCountOf, publicSourceHref,
  runGrid, sectionTones, sourceLinks, standLayout, stateOf, windowLine
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

describe('one paper’s run', () => {
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

  it('reads newest first, with a column in each of the four states', () => {
    const grid = runGrid(paper);
    expect(grid.rows.map(row => row.issue.number)).toEqual([3, 2, 1]);
    expect(grid.rows[1].cells.map(cell => cell.state)).toEqual(['filled', 'unreported', 'unknown']);
    expect(grid.rows[0].cells[1]).toEqual(expect.objectContaining({ state: 'checked', count: 0, label: 'Infrastructure & systems' }));
    expect(grid.rows[2].cells[2]).toEqual(expect.objectContaining({ state: 'filled', count: 2 }));
    expect(runGrid(null)).toEqual({ sections: [], rows: [] });
  });

  it('adds up what is new, and says nothing when no issue counted', () => {
    expect(newCountOf([{ newCount: 2 }, { newCount: 0 }, {}])).toBe(2);
    expect(newCountOf([{ newCount: 0 }])).toBe(0);
    expect(newCountOf([{}, {}])).toBeNull();
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

describe('who filed what', () => {
  const edition = {
    items: [
      { itemId: 'a', filedBy: 'Codex Wiki account grounding audit' },
      { itemId: 'b', filedBy: 'Desk', filedByRuntime: 'codex', readings: [{ filedBy: 'Jarvis', filedByRuntime: 'openclaw' }] },
      { itemId: 'c', filedBy: 'Second reader', filedByRuntime: 'openclaw' },
      { itemId: 'd', filedBy: 'Desk', filedByRuntime: 'codex' }
    ]
  };

  it('offers each hand once, most filings first, counting second readings', () => {
    expect(handsOf(edition).map(hand => [hand.agent.name, hand.count])).toEqual([['Codex', 3], ['OpenClaw', 2]]);
    expect(handsOf(null)).toEqual([]);
  });

  it('keeps the items a hand filed or read, and everything when no hand is chosen', () => {
    expect(edition.items.filter(item => byHand(item, 'openclaw')).map(item => item.itemId)).toEqual(['b', 'c']);
    expect(edition.items.filter(item => byHand(item, '')).length).toBe(4);
  });
});
