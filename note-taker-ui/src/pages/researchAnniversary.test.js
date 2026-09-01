import { describeAnniversary, __testables } from './researchAnniversary';

const { anniversaryYears, revisionCount } = __testables;

// Local dates on purpose: an anniversary belongs to the reader's own calendar.
const day = (y, m, d) => new Date(y, m - 1, d, 9, 0, 0).getTime();
const change = (id) => ({ decisionId: `judgment-change-${id}` });
const claim = 'Costco membership economics survive a consumer downturn.';

describe('describeAnniversary', () => {
  it('returns the memory on the day itself', () => {
    expect(describeAnniversary({
      bornAt: new Date(day(2025, 9, 1)).toISOString(),
      now: day(2026, 9, 1),
      claim
    })).toBe('On this day a year ago you first held this. You have not changed a word of it.');
  });

  it('says how the belief has moved, because that is what makes it worth saying', () => {
    expect(describeAnniversary({
      bornAt: new Date(day(2024, 9, 1)).toISOString(),
      now: day(2026, 9, 1),
      decisions: [change('a'), change('b'), change('c')],
      claim
    })).toBe('On this day two years ago you first held this. You have revised it 3 times since.');
  });

  it('counts one revision as once', () => {
    expect(describeAnniversary({
      bornAt: new Date(day(2025, 9, 1)).toISOString(),
      now: day(2026, 9, 1),
      decisions: [change('a')],
      claim
    })).toContain('revised it once since');
  });

  it('is silent on every other day of the year', () => {
    expect(describeAnniversary({
      bornAt: new Date(day(2025, 9, 1)).toISOString(),
      now: day(2026, 8, 31),
      claim
    })).toBe('');
    expect(describeAnniversary({
      bornAt: new Date(day(2025, 9, 1)).toISOString(),
      now: day(2026, 9, 2),
      claim
    })).toBe('');
  });

  it('does not wish a belief a happy first day', () => {
    expect(describeAnniversary({
      bornAt: new Date(day(2026, 9, 1)).toISOString(),
      now: day(2026, 9, 1),
      claim
    })).toBe('');
  });

  it('says nothing without a real birth date', () => {
    expect(describeAnniversary({ bornAt: null, now: day(2026, 9, 1), claim })).toBe('');
    expect(describeAnniversary({ bornAt: 'someday', now: day(2026, 9, 1), claim })).toBe('');
  });

  it('does not return a memory of a sentence nobody can read', () => {
    expect(describeAnniversary({
      bornAt: new Date(day(2025, 9, 1)).toISOString(),
      now: day(2026, 9, 1),
      claim: '   '
    })).toBe('');
  });

  it('counts only the decisions that changed the held sentence', () => {
    expect(revisionCount([
      change('a'),
      { decisionId: 'decision-unrelated' },
      { decisionId: 'outcome-1' },
      change('b')
    ])).toBe(2);
  });

  it('gives a leap-year belief its own day and no consolation prize', () => {
    const born = new Date(day(2024, 2, 29)).toISOString();
    expect(anniversaryYears(born, day(2028, 2, 29))).toBe(4);
    expect(anniversaryYears(born, day(2025, 2, 28))).toBe(0);
    expect(anniversaryYears(born, day(2025, 3, 1))).toBe(0);
  });
});
