import {
  byPaper, bylineFor, bySection, closesLine, datelineLine, gapLine, isNewSince,
  issueLine, lastSeen, markSeen, newSinceLine, runLine, stateOf, takenLine, windowLine
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

describe('what the paper admits about itself', () => {
  /* An AI weekly with nothing under counterevidence is telling you something
     real, and it has to say which section went missing, not how many did. */
  it('names the section the week never filled', () => {
    expect(gapLine({ unfilled: ['Evaluation & counterevidence'] }))
      .toBe('Nothing this week under Evaluation & counterevidence.');
  });

  it('names all of them, and joins the last with "or"', () => {
    expect(gapLine({ unfilled: ['Infrastructure & systems', 'Evaluation & counterevidence'] }))
      .toBe('Nothing this week under Infrastructure & systems or Evaluation & counterevidence.');
    expect(gapLine({ unfilled: ['A', 'B', 'C'] })).toBe('Nothing this week under A, B or C.');
  });

  /* A week that covered its own shape has nothing to confess, and "0 sections
     empty" is filler. */
  it('stays quiet when the week filled every section', () => {
    expect(gapLine({ unfilled: [] })).toBe('');
    expect(gapLine()).toBe('');
  });
});

describe('what you took from it', () => {
  /* An unread edition is not a failed one, so before you take anything the
     paper says how much there is — never that you have taken none. */
  it('offers the sources before it counts them', () => {
    expect(takenLine({ itemCount: 4, savedCount: 0 })).toBe('4 sources.');
    expect(takenLine({ itemCount: 1, savedCount: 0 })).toBe('1 source.');
  });

  it('counts what crossed over', () => {
    expect(takenLine({ itemCount: 4, savedCount: 2 })).toBe('2 of 4 in your library.');
    expect(takenLine({ itemCount: 4, savedCount: 4 })).toBe('All 4 in your library.');
  });

  it('says nothing about an edition with nothing in it', () => {
    expect(takenLine({ itemCount: 0, savedCount: 0 })).toBe('');
    expect(takenLine()).toBe('');
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
    /* The current issue is the last one, and the freshest paper stands first. */
    expect(ai.current).toBe(1);
    expect(papers[0].profile).toBe('ai');
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

describe('who filed a column', () => {
  const by = (label) => ({ filedBy: label });

  /* The masthead names whoever wrote last, which stops being the whole truth
     the moment two agents keep the same paper. */
  it('signs one agent, and names them all when several filed', () => {
    expect(bylineFor([by('Jarvis'), by('Jarvis')])).toBe('Filed by Jarvis');
    expect(bylineFor([by('Jarvis'), by('Hermes')])).toBe('Filed by Jarvis and Hermes');
    expect(bylineFor([by('Jarvis'), by('Hermes'), by('Codex')]))
      .toBe('Filed by Jarvis, Hermes and Codex');
  });

  /* Silence rather than a guess at the reader's own agent. */
  it('says nothing about an unsigned column', () => {
    expect(bylineFor([by(''), {}])).toBe('');
    expect(bylineFor([])).toBe('');
    expect(bylineFor()).toBe('');
  });
});

describe('what arrived since you last stood here', () => {
  beforeEach(() => window.localStorage.clear());

  const filed = (at) => ({ filedAt: at });

  /* An issue you have never opened marks nothing: everything in it is new,
     and marking all of it says nothing at all. */
  it('marks nothing on an issue you have never opened', () => {
    expect(lastSeen('e1')).toBe('');
    expect(isNewSince(filed('2026-09-10T00:00:00Z'), '')).toBe(false);
    expect(newSinceLine([filed('2026-09-10T00:00:00Z')], '')).toBe('');
  });

  it('remembers when you were last here, per issue', () => {
    markSeen('e1', '2026-09-09T00:00:00Z');
    expect(lastSeen('e1')).toBe('2026-09-09T00:00:00Z');
    expect(lastSeen('e2')).toBe('');
  });

  it('marks only what was filed after that', () => {
    const since = '2026-09-09T00:00:00Z';
    expect(isNewSince(filed('2026-09-10T00:00:00Z'), since)).toBe(true);
    expect(isNewSince(filed('2026-09-08T00:00:00Z'), since)).toBe(false);
    /* An item filed before per-item dates existed carries no claim either way. */
    expect(isNewSince({}, since)).toBe(false);
  });

  it('counts them in a sentence, and stays silent at none', () => {
    const since = '2026-09-09T00:00:00Z';
    const items = [filed('2026-09-10T00:00:00Z'), filed('2026-09-11T00:00:00Z'), filed('2026-09-01T00:00:00Z')];
    expect(newSinceLine(items, since)).toBe('2 new since you last looked');
    expect(newSinceLine([filed('2026-09-01T00:00:00Z')], since)).toBe('');
    expect(newSinceLine()).toBe('');
  });
});
