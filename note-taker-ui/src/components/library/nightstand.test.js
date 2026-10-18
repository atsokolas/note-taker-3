import { hasWaitedLong, tonightFrom } from './nightstand';

const day = n => new Date(Date.UTC(2026, 9, n)).toISOString();
const NOW = Date.parse(day(32));

test('tonight is the longest-waiting short piece, the weekend the longest-waiting long one', () => {
  const rows = [
    { _id: 'new-short', placement: 'later', placementAt: day(20), minutes: 6 },
    { _id: 'old-short', placement: 'later', placementAt: day(5), minutes: 12 },
    { _id: 'long', placement: 'later', placementAt: day(9), minutes: 45 },
    { _id: 'read', placement: 'stream', minutes: 3 }
  ];
  const { tonight, weekend } = tonightFrom(rows);
  expect([tonight._id, weekend._id]).toEqual(['old-short', 'long']);
  expect(tonightFrom(rows.filter(row => row.minutes < 15))).toMatchObject({ weekend: null });
  expect(tonightFrom([])).toEqual({ tonight: null, weekend: null });
});

test('a month on the nightstand is a long wait; elsewhere there is no wait to ask about', () => {
  expect(hasWaitedLong({ placement: 'later', placementAt: day(1) }, NOW)).toBe(true);
  expect(hasWaitedLong({ placement: 'later', placementAt: day(10) }, NOW)).toBe(false);
  expect(hasWaitedLong({ placement: 'later', createdAt: day(1) }, NOW)).toBe(true);
  expect(hasWaitedLong({ placement: 'setAside', placementAt: day(1) }, NOW)).toBe(false);
});
