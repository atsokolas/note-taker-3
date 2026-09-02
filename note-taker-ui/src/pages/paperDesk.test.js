import { editionDay, lastWorked, openCase, shelfPick } from './paperDesk';

const page = (id, title, updatedAt, judgment = null) => ({
  _id: id,
  title,
  updatedAt,
  ...(judgment ? { judgment } : {})
});

const belief = (sentence, extra = {}) => ({
  currentJudgment: sentence,
  bornAt: '2026-01-01T00:00:00.000Z',
  ...extra
});

describe('the page you were last in', () => {
  it('is the most recently touched one', () => {
    expect(lastWorked([
      page('a', 'Older', '2026-08-01T00:00:00.000Z'),
      page('b', 'Newest', '2026-09-01T00:00:00.000Z'),
      page('c', 'Middle', '2026-08-20T00:00:00.000Z')
    ])).toMatchObject({ text: 'Newest', href: '/wiki/workspace?page=b' });
  });

  /* Saying "you were last in AI Compute Bull" directly above "AI Compute Bull
     is still open" is the paper reading itself out twice. */
  it('leaves cases to the clause that knows how to talk about a case', () => {
    expect(lastWorked([
      page('j', 'A case', '2026-09-02T00:00:00.000Z', belief('Compute stays scarce.')),
      page('w', 'A wiki', '2026-08-01T00:00:00.000Z')
    ])).toMatchObject({ text: 'A wiki' });
  });

  it('falls back to when a page was made if nobody has touched it since', () => {
    expect(lastWorked([{ _id: 'a', title: 'Only made', createdAt: '2026-05-05T00:00:00.000Z' }]))
      .toMatchObject({ text: 'Only made' });
  });

  it('says nothing about a shelf of nameless pages, or no pages at all', () => {
    expect(lastWorked([{ _id: 'a', title: '   ' }])).toBeNull();
    expect(lastWorked([])).toBeNull();
    expect(lastWorked()).toBeNull();
  });
});

describe('the case still running', () => {
  it('is the one worked most recently', () => {
    expect(openCase([
      page('old', 'Older case', '2026-01-02T00:00:00.000Z', belief('One.')),
      page('new', 'Newer case', '2026-09-01T00:00:00.000Z', belief('Two.'))
    ])).toMatchObject({ text: 'Newer case', href: '/judgment/new' });
  });

  /* Parking is a decision to stop. Handing it back every morning argues with
     the reader about their own call. */
  it('does not hand back a case you parked', () => {
    expect(openCase([
      page('p', 'Parked case', '2026-09-01T00:00:00.000Z', belief('Held.', { status: 'parked' }))
    ])).toBeNull();
  });

  it('says nothing when no case is running', () => {
    expect(openCase([page('w', 'Just a wiki', '2026-09-01T00:00:00.000Z')])).toBeNull();
    expect(openCase([])).toBeNull();
    expect(openCase()).toBeNull();
  });
});

describe('the card off the shelf', () => {
  const shelf = [
    { _id: 'a1', title: 'Poor Charlie’s Almanack' },
    { _id: 'b2', title: 'The Munger Operating System' },
    { _id: 'c3', title: 'Playing to Win' }
  ];

  it('deals one, and links to it', () => {
    const pick = shelfPick(shelf, { now: Date.parse('2026-09-02T08:00:00.000Z') });
    expect(shelf.some(item => item.title === pick.text)).toBe(true);
    expect(pick.href).toBe(`/articles/${pick.id}`);
  });

  /* A paper that changes while you are holding it is a feed. The same morning
     deals the same card, however many times the page repaints. */
  it('deals the same card all morning', () => {
    const morning = Date.parse('2026-09-02T08:00:00.000Z');
    const evening = Date.parse('2026-09-02T22:30:00.000Z');
    expect(shelfPick(shelf, { now: morning }).id).toBe(shelfPick(shelf, { now: evening }).id);
  });

  it('does not care what order the shelf arrived in', () => {
    const now = Date.parse('2026-09-02T08:00:00.000Z');
    expect(shelfPick([...shelf].reverse(), { now }).id).toBe(shelfPick(shelf, { now }).id);
  });

  it('turns the card over across a run of mornings', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']
      .map(day => shelfPick(shelf, { now: Date.parse(`${day}T08:00:00.000Z`) }).id);
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('reads one edition as one day everywhere', () => {
    expect(editionDay(Date.parse('2026-09-02T23:59:00.000Z'))).toBe('2026-09-02');
  });

  it('deals nothing from an empty shelf, or one nobody has read', () => {
    expect(shelfPick([])).toBeNull();
    expect(shelfPick()).toBeNull();
    expect(shelfPick([{ _id: 'x' }])).toBeNull();
  });
});
