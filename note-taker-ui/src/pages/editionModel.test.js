import { agentRunLine, bySection, gapLine, issueLine, takenLine, windowLine } from './editionModel';

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

  /* The only fact on the stand about the agent rather than the reading. */
  it('counts a run of consecutive windows', () => {
    expect(agentRunLine([week(0), week(1), week(2), week(3)]))
      .toBe('4 weeks running. Not a week missed.');
  });

  /* Two in a row is not yet a habit. */
  it('says nothing below a run', () => {
    expect(agentRunLine([week(0), week(1)])).toBe('');
    expect(agentRunLine([])).toBe('');
    expect(agentRunLine()).toBe('');
  });

  /* Three editions filed in one afternoon are not a three-week run. */
  it('counts windows, not filings', () => {
    expect(agentRunLine([week(0), week(0), week(0)])).toBe('');
  });

  it('stops at the first week missed', () => {
    expect(agentRunLine([week(0), week(1), week(2), week(6), week(7)]))
      .toBe('3 weeks running. Not a week missed.');
  });

  it('survives an edition with no window', () => {
    expect(() => agentRunLine([{ windowStart: 'nonsense' }, week(0), week(1), week(2)])).not.toThrow();
  });
});
