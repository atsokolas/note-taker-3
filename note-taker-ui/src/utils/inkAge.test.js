import { inkAge } from './inkAge';

const now = new Date('2026-11-22T12:00:00Z').getTime();

it('lets ink settle after a fortnight and fade after six weeks', () => {
  expect(inkAge('2026-11-20', now)).toBeUndefined();
  expect(inkAge('2026-11-01', now)).toBe('settled');
  expect(inkAge('2026-09-01', now)).toBe('faded');
  expect(inkAge(null, now)).toBeUndefined();
});
