import { formatSurfaceDate, parseDisplayDate } from './dateDisplay';

describe('dateDisplay', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');

  it('formats visible recent dates relatively', () => {
    expect(formatSurfaceDate('2026-06-25T11:59:30.000Z', { now })).toBe('just now');
    expect(formatSurfaceDate('2026-06-25T11:48:00.000Z', { now })).toBe('12m ago');
    expect(formatSurfaceDate('2026-06-25T09:00:00.000Z', { now })).toBe('3h ago');
    expect(formatSurfaceDate('2026-06-23T12:00:00.000Z', { now })).toBe('2d ago');
    expect(formatSurfaceDate('2026-06-19T12:00:00.000Z', { now })).toBe('6d ago');
  });

  it('formats seven-day and older dates as absolute dates with the year', () => {
    expect(formatSurfaceDate('2026-06-18T12:00:00.000Z', { now })).toBe('Jun 18, 2026');
    expect(formatSurfaceDate('2026-05-01T12:00:00.000Z', { now })).toBe('May 1, 2026');
  });

  it('allows compact absolute dates when a surface explicitly asks for them', () => {
    expect(formatSurfaceDate('2026-05-01T12:00:00.000Z', { now, includeYear: false })).toBe('May 1');
  });

  it('returns the fallback for invalid input', () => {
    expect(parseDisplayDate('bad')).toBeNull();
    expect(formatSurfaceDate('bad', { now })).toBe('');
    expect(formatSurfaceDate('bad', { now, fallback: 'No date' })).toBe('No date');
  });
});
