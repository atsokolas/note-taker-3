import {
  deskClauses,
  editionsLine,
  END_OF_PAPER,
  firstMorningDeskLine,
  firstMorningLead,
  shelfClause
} from './paperEditions';

const at = (iso) => new Date(iso).getTime();

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

describe('the desk clauses', () => {
  const textOf = (clauses) => clauses.map(clause => clause.text);

  it('gives one clause per place that has something to say', () => {
    expect(textOf(deskClauses({
      later: 3, setAside: 1,
      topics: [{ name: 'Costco', open: 2 }]
    }))).toEqual(['3 owed a move', '1 at hand', 'Costco has 2 new folios']);
  });

  /* The sentence was a finished string, so the one thing a reader wanted to do
     with a count — go to the pile it counts — was the one thing it could not
     support. */
  it('carries the way to each pile', () => {
    const [later, setAside] = deskClauses({ later: 1, setAside: 1 });
    expect(later.href).toBe('/library?scope=later');
    expect(setAside.href).toBe('/library?scope=set-aside');
  });

  it('only lets a place speak when it has something on it', () => {
    expect(textOf(deskClauses({ later: 0, setAside: 2 }))).toEqual(['2 at hand']);
  });

  it('names folders, never the word feed', () => {
    const [topic] = deskClauses({ topics: [{ name: 'Macro', open: 1, href: '/library?scope=feed&topic=m' }] });
    expect(topic.text).toBe('Macro has 1 new folio');
    expect(topic.text.toLowerCase()).not.toContain('feed');
    expect(topic.href).toBe('/library?scope=feed&topic=m');
  });

  it('says nothing at all rather than a row of noughts', () => {
    expect(deskClauses({ later: 0, setAside: 0, topics: [] })).toEqual([]);
  });

  it('will not report a desk it has not read', () => {
    expect(deskClauses({ later: null, setAside: null })).toEqual([]);
  });

  it('counts only what it knows, and stays silent about the rest', () => {
    expect(textOf(deskClauses({ later: 3, setAside: null }))).toEqual(['3 owed a move']);
  });
});

describe('the shelf clause', () => {
  it('says what the canon holds, and how to reach it', () => {
    expect(shelfClause(7)).toEqual({ key: 'kept', text: 'The shelf holds 7', href: '/library?scope=kept' });
  });

  it('stays quiet about a canon holding nothing, or one nobody has counted', () => {
    expect(shelfClause(0)).toBeNull();
    expect(shelfClause(null)).toBeNull();
  });
});

describe('the first mornings', () => {
  it('prints one line on day one, and asks for nothing', () => {
    expect(firstMorningLead()).toBe('No news yet. Save something worth keeping — I’ll print it when it moves.');
    expect(firstMorningDeskLine()).toBe('Your desk is empty. The shelf holds nothing yet.');
  });
});

describe('the end of the paper', () => {
  it('has one, and says so', () => {
    expect(END_OF_PAPER).toBe('— end of the paper —');
  });
});
