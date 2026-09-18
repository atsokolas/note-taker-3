import { formatDeliveryHour, nextEligibleDeliveryMoments } from './morningPaperSchedule';

describe('morningPaperSchedule', () => {
  it('formats delivery hours for readers', () => {
    expect(formatDeliveryHour(7)).toBe('7:00 AM');
    expect(formatDeliveryHour(0)).toBe('12:00 AM');
  });

  it('finds upcoming eligible moments in a timezone', () => {
    const { moments, error } = nextEligibleDeliveryMoments(
      7,
      'America/Chicago',
      new Date('2026-06-01T12:00:00.000Z'),
      2
    );
    expect(error).toBe('');
    expect(moments.length).toBeGreaterThan(0);
  });
});
