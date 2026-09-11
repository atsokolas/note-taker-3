import { abbreviateLine, historyEvents } from './judgmentHistory';

describe('judgmentHistory', () => {
  it('keeps a short line whole, and trims a long one on a word', () => {
    expect(abbreviateLine('Held')).toBe('Held');
    expect(abbreviateLine('A business ought to be able to self-fund its own growth without begging for more silicon every year.', 40))
      .toMatch(/…$/);
    expect(abbreviateLine('A business ought to be able to self-fund its own growth without begging for more silicon every year.', 40))
      .not.toMatch(/\s…$/);
  });

  it('leaves how long you have held it to the standing line, not the spine', () => {
    const events = historyEvents({
      view: {
        standing: { since: 'Held since August 18.' },
        lessons: [],
        review: null
      }
    });
    expect(events).toEqual([]);
  });

  it('abbreviates a lesson, and keeps the full sentence behind the click', () => {
    const events = historyEvents({
      view: {
        standing: {},
        lessons: [{
          id: 'l1',
          at: '2026-08-20T12:00:00.000Z',
          text: 'Announced capacity is not delivered capacity, and the gap is the whole bet.'
        }]
      }
    });
    expect(events[0].teaser.length).toBeLessThan(events[0].detail.length);
    expect(events[0].detail).toContain('the gap is the whole bet');
    expect(events[0].when).toMatch(/Aug/);
  });

  it('puts a due review on the spine without filling in what you have not said', () => {
    const events = historyEvents({
      view: {
        standing: {},
        review: { state: 'due', decisionId: 'd-1', at: '2026-12-01T12:00:00.000Z' }
      }
    });
    expect(events[0].teaser).toMatch(/review date passed/i);
    expect(events[0].detail).toMatch(/until you say what happened/i);
  });
});
