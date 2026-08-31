import { formatCalendarDate } from './calendarDate';

describe('formatCalendarDate', () => {
  it('shows the day that was picked, not the day the viewer is standing in', () => {
    // What <input type="date"> + Mongo produce for "September 30".
    expect(formatCalendarDate('2026-09-30T00:00:00.000Z')).toBe('Sep 30');
  });

  it('reads a bare calendar day the same way', () => {
    expect(formatCalendarDate('2026-09-30')).toBe('Sep 30');
  });

  it('can carry the year when the surface needs it', () => {
    expect(formatCalendarDate('2026-09-30', { year: true })).toBe('Sep 30, 2026');
  });

  it('says nothing for an absent or unparseable day', () => {
    expect(formatCalendarDate(null)).toBe('');
    expect(formatCalendarDate('')).toBe('');
    expect(formatCalendarDate('someday')).toBe('');
  });
});
