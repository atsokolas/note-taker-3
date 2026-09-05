const { assertionsFrom, askedBefore, closings, dayOf, keyOf, quietStreak } = require('./paperLedger');

const NOW = Date.UTC(2026, 8, 4);
const DAY = 24 * 60 * 60 * 1000;
const dayBack = n => new Date(NOW - n * DAY).toISOString().slice(0, 10);

const columns = (over = {}) => ({
  anniversary: { key: 'p1:c1', claimId: 'c1', pageId: 'p1', pageTitle: 'Alphabet', text: 'Capex is defensive.' },
  disagreement: { key: 'p2:c9', claimId: 'c9', pageId: 'p2', pageTitle: 'Compute', text: 'Inference costs fall.' },
  corrections: [{ key: 'k', text: 'x', was: 'retired', became: 'brought it back' }],
  obituary: { key: 'p3', pageId: 'p3', pageTitle: 'Deliberate Practice', days: 300 },
  ...over
});

const record = (day, assertions) => ({ day, assertions });

describe('what the paper is on record as saying', () => {
  it('keeps the questions it asked, with a door back to each', () => {
    const rows = assertionsFrom(columns());
    expect(rows.map(r => r.kind)).toEqual(['anniversary', 'disagreement', 'obituary']);
    expect(rows[0]).toMatchObject({ targetKey: 'p1:c1', pageId: 'p1', label: 'Alphabet' });
  });

  /* The corrections column reports the reader's own reversals, read out of a
     claim's history. The paper asserts nothing there, so there is nothing to
     hold it to later. */
  it('does not put the reader’s reversals on the paper’s own record', () => {
    expect(assertionsFrom(columns()).some(r => r.kind === 'correction')).toBe(false);
  });

  it('records nothing about a quiet morning', () => {
    expect(assertionsFrom({ anniversary: null, disagreement: null, corrections: [], obituary: null })).toEqual([]);
    expect(assertionsFrom()).toEqual([]);
  });

  /* Two different questions about one belief are two questions. */
  it('keys a question by what was asked, not only by what it points at', () => {
    expect(keyOf({ kind: 'anniversary', targetKey: 'p1:c1' }))
      .not.toBe(keyOf({ kind: 'disagreement', targetKey: 'p1:c1' }));
  });
});

describe('how many mornings it has asked', () => {
  const assertion = { kind: 'anniversary', targetKey: 'p1:c1' };
  const history = [
    record(dayBack(0), [assertion]),
    record(dayBack(1), [assertion]),
    record(dayBack(4), [assertion]),
    record(dayBack(6), [{ kind: 'obituary', targetKey: 'p3' }])
  ];

  it('counts the mornings before this one', () => {
    expect(askedBefore({ history, assertion, today: dayOf(NOW) })).toBe(2);
  });

  /* A reader who refreshes twice has not been asked twice. */
  it('does not count today, however many times the paper was loaded', () => {
    const busy = [...history, record(dayBack(0), [assertion])];
    expect(askedBefore({ history: busy, assertion, today: dayOf(NOW) })).toBe(2);
  });

  it('counts a different question separately', () => {
    expect(askedBefore({ history, assertion: { kind: 'disagreement', targetKey: 'p1:c1' }, today: dayOf(NOW) })).toBe(0);
  });

  it('says nothing about nothing', () => {
    expect(askedBefore({ history: [], assertion, today: dayOf(NOW) })).toBe(0);
    expect(askedBefore({})).toBe(0);
  });
});

describe('what closed', () => {
  const anniversary = { kind: 'anniversary', targetKey: 'p1:c1', pageId: 'p1', label: 'Alphabet', text: 'Capex is defensive.' };
  const obituary = { kind: 'obituary', targetKey: 'p3', pageId: 'p3', label: 'Deliberate Practice', text: 'Deliberate Practice' };
  const history = [record(dayBack(3), [anniversary, obituary])];
  const known = new Set(['p1', 'p3']);

  /* Each column prints one candidate a day, so absence from today's paper is
     usually somebody else's turn — not an answer. */
  it('does not call a question closed just because it was not dealt today', () => {
    const open = { anniversary: new Set(['p1:c1']), disagreement: new Set(), obituary: new Set(['p3']) };
    expect(closings({ history, open, known, now: NOW })).toEqual([]);
  });

  it('reports a question whose target has stopped qualifying', () => {
    const open = { anniversary: new Set(), disagreement: new Set(), obituary: new Set(['p3']) };
    const [closed] = closings({ history, open, known, now: NOW });
    expect(closed).toMatchObject({ kind: 'anniversary', label: 'Alphabet', day: dayBack(3), vanished: false });
  });

  /* Gone is different from answered, and the reader can tell even when the
     paper cannot. */
  it('says when the paper asked about something that no longer exists', () => {
    const open = { anniversary: new Set(), disagreement: new Set(), obituary: new Set(['p3']) };
    const [closed] = closings({ history, open, known: new Set(['p3']), now: NOW });
    expect(closed.vanished).toBe(true);
  });

  /* A kind the caller did not compute is a kind we cannot speak about. */
  it('stays silent about a column it was given no open set for', () => {
    expect(closings({ history, open: { obituary: new Set(['p3']) }, known, now: NOW })).toEqual([]);
  });

  it('forgets a closing once it is old news', () => {
    const ancient = [record(dayBack(40), [anniversary])];
    const open = { anniversary: new Set(), disagreement: new Set(), obituary: new Set() };
    expect(closings({ history: ancient, open, known, now: NOW })).toEqual([]);
  });

  it('reports one closing once, however many mornings it was asked', () => {
    const repeated = [record(dayBack(2), [anniversary]), record(dayBack(5), [anniversary])];
    const open = { anniversary: new Set(), disagreement: new Set(), obituary: new Set() };
    const found = closings({ history: repeated, open, known, now: NOW });
    expect(found).toHaveLength(1);
    /* The most recent morning it was asked, because that is the one the
       reader might remember. */
    expect(found[0].day).toBe(dayBack(2));
  });

  it('keeps the box short', () => {
    const many = [record(dayBack(2), [
      anniversary,
      { ...anniversary, targetKey: 'p1:c2' },
      { ...anniversary, targetKey: 'p1:c3' }
    ])];
    const open = { anniversary: new Set(), disagreement: new Set(), obituary: new Set() };
    expect(closings({ history: many, open, known, now: NOW })).toHaveLength(2);
  });

  it('survives a ledger full of half-written days', () => {
    const junk = [null, {}, { day: '' }, record('nonsense', [anniversary]), record(dayBack(1), null)];
    const open = { anniversary: new Set(), disagreement: new Set(), obituary: new Set() };
    expect(() => closings({ history: junk, open, known, now: NOW })).not.toThrow();
  });
});

describe('a run of quiet mornings', () => {
  const spoke = n => record(dayBack(n), [{ kind: 'anniversary', targetKey: 'p1:c1' }]);

  /* A quiet morning writes no record, so a gap in the ledger is the streak. */
  it('counts the mornings since the paper last had news', () => {
    expect(quietStreak({ history: [spoke(6)], now: NOW })).toBe(5);
  });

  it('is not a streak while the paper is still talking', () => {
    expect(quietStreak({ history: [spoke(1), spoke(4)], now: NOW })).toBe(0);
  });

  /* A reader with no ledger has not had a run of quiet mornings — they have
     had no mornings. Absence of a record is not a streak. */
  it('says nothing about a reader who has no ledger yet', () => {
    expect(quietStreak({ history: [], now: NOW })).toBe(0);
    expect(quietStreak()).toBe(0);
  });

  it('never reaches further back than the ledger itself', () => {
    expect(quietStreak({ history: [spoke(2)], now: NOW })).toBe(1);
  });

  /* Today is not over — the paper may yet have news. */
  it('does not count today', () => {
    expect(quietStreak({ history: [spoke(0), spoke(5)], now: NOW })).toBe(4);
  });
});
