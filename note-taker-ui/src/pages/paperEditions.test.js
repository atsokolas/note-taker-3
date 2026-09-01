import {
  day120Line,
  deskLine,
  editionNumber,
  editionsLine,
  END_OF_PAPER,
  firstMorningDeskLine,
  firstMorningLead,
  printedTime
} from './paperEditions';

const at = (iso) => new Date(iso).getTime();

describe('the edition number', () => {
  it('counts the mornings since the account began, today included', () => {
    expect(editionNumber({ beganAt: '2025-08-01T09:00:00.000Z', now: at('2025-08-01T09:30:00.000Z') })).toBe(1);
    expect(editionNumber({ beganAt: '2025-08-01T09:00:00.000Z', now: at('2025-08-02T06:00:00.000Z') })).toBe(2);
  });

  it('never resets, however long the account has run', () => {
    expect(editionNumber({ beganAt: '2025-08-01T12:00:00.000Z', now: at('2026-09-15T12:00:00.000Z') })).toBe(411);
  });

  it('says nothing when it does not know when the account began', () => {
    expect(editionNumber({ beganAt: null, now: at('2026-09-01T09:00:00.000Z') })).toBeNull();
    expect(editionNumber({ beganAt: 'someday', now: at('2026-09-01T09:00:00.000Z') })).toBeNull();
  });

  it('refuses to number a morning before the account existed', () => {
    expect(editionNumber({ beganAt: '2026-09-05T12:00:00.000Z', now: at('2026-09-01T12:00:00.000Z') })).toBeNull();
  });
});

describe('the print time', () => {
  it('says when the paper printed, not when you opened it', () => {
    expect(printedTime('2026-09-01T06:02:00.000Z', 'UTC')).toBe('printed 6:02');
  });

  it('says nothing about a time it does not have', () => {
    expect(printedTime(null)).toBe('');
    expect(printedTime('whenever')).toBe('');
  });
});

describe('the editions line', () => {
  const base = {
    now: at('2026-09-01T09:00:00.000Z'),
    driftClosesAt: '2026-09-08T00:00:00.000Z',
    keptCount: 7
  };

  it('prints the cadences, and marks the one you are reading', () => {
    const line = editionsLine({ ...base, edition: 'today' });
    expect(line.map(part => part.label)).toEqual([
      'today', 'the weekend', 'the drift closes Tue', 'the canon — 7 kept'
    ]);
    expect(line.find(part => part.current).label).toBe('today');
  });

  it('marks the weekend when that is the edition on the stand', () => {
    expect(editionsLine({ ...base, edition: 'the weekend' }).find(part => part.current).label)
      .toBe('the weekend');
  });

  it('drops the drift when no bucket is closing', () => {
    const line = editionsLine({ ...base, driftClosesAt: null });
    expect(line.map(part => part.label)).not.toContain(expect.stringContaining('drift'));
  });

  it('will not print a canon it has not counted', () => {
    const line = editionsLine({ ...base, keptCount: null });
    expect(line.some(part => part.label.includes('canon'))).toBe(false);
  });

  it('names one kept thing in the singular', () => {
    const line = editionsLine({ ...base, keptCount: 1 });
    expect(line.find(part => part.label.includes('canon')).label).toBe('the canon — 1 kept');
  });

  it('says nothing about a canon that holds nothing', () => {
    const line = editionsLine({ ...base, keptCount: 0 });
    expect(line.some(part => part.label.includes('canon'))).toBe(false);
  });
});

describe('the desk line', () => {
  it('composes one sentence out of the places that have something to say', () => {
    expect(deskLine({
      later: 3, setAside: 1, kept: 7,
      topics: [{ name: 'Costco', open: 2 }]
    })).toBe('On your desk — 3 owed a move, 1 at hand, Costco has 2 new folios. The shelf holds 7.');
  });

  it('only lets a place speak when it has something on it', () => {
    expect(deskLine({ later: 0, setAside: 2, kept: 7, topics: [] }))
      .toBe('On your desk — 2 at hand. The shelf holds 7.');
  });

  it('names folders, never the word feed', () => {
    const line = deskLine({ later: 0, setAside: 0, kept: 4, topics: [{ name: 'Macro', open: 1 }] });
    expect(line).toContain('Macro has 1 new folio');
    expect(line.toLowerCase()).not.toContain('feed');
  });

  it('says the shelf even when the desk is clear, because the canon always speaks', () => {
    expect(deskLine({ later: 0, setAside: 0, kept: 7, topics: [] })).toBe('The shelf holds 7.');
  });

  it('says nothing at all rather than a row of noughts', () => {
    expect(deskLine({ later: 0, setAside: 0, kept: 0, topics: [] })).toBe('');
  });

  it('will not report a desk it has not read', () => {
    expect(deskLine({ later: null, setAside: null, kept: null, topics: [] })).toBe('');
  });

  it('counts only what it knows, and stays silent about the rest', () => {
    expect(deskLine({ later: 3, setAside: null, kept: null, topics: [] }))
      .toBe('On your desk — 3 owed a move.');
  });
});

describe('the first mornings', () => {
  it('prints one line on day one, and asks for nothing', () => {
    expect(firstMorningLead()).toBe('No news yet. Save something worth keeping — I’ll print it when it moves.');
    expect(firstMorningDeskLine()).toBe('Your desk is empty. The shelf holds nothing yet.');
  });

  it('says the corpus can talk back, once, on the hundred and twentieth morning', () => {
    expect(day120Line({ edition: 120 })).toBe('The corpus is old enough to talk back.');
    expect(day120Line({ edition: 119 })).toBe('');
    expect(day120Line({ edition: 121 })).toBe('');
    expect(day120Line({ edition: null })).toBe('');
  });
});

describe('the end of the paper', () => {
  it('has one, and says so', () => {
    expect(END_OF_PAPER).toBe('— end of the paper —');
  });
});
