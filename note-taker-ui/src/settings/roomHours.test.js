import { roomHours } from './roomHours';

test('lamplight from midnight to five, a broadsheet on Sunday mornings, and nothing otherwise', () => {
  expect(roomHours(new Date(2026, 10, 18, 1, 30))).toEqual({ hour: 'lamplight', day: '' });
  expect(roomHours(new Date(2026, 10, 22, 9, 0))).toEqual({ hour: '', day: 'sunday-morning' });
  expect(roomHours(new Date(2026, 10, 22, 2, 0))).toEqual({ hour: 'lamplight', day: '' });
  expect(roomHours(new Date(2026, 10, 22, 13, 0))).toEqual({ hour: '', day: '' });
});
