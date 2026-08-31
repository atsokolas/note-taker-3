/**
 * A day someone picked is a calendar day, not an instant.
 *
 * `<input type="date">` sends "2026-09-30". The server stores that as UTC
 * midnight, because that is what `new Date('2026-09-30')` means. Rendering it
 * back through the viewer's local timezone then moves it: anyone west of UTC
 * schedules a review for September 30 and is shown September 29 — on the same
 * page where the date field still reads the 30th, since that round-trips
 * through UTC and comes back correct.
 *
 * So a stored calendar day is read back in the timezone it was written in.
 * Instants — when something actually happened — keep using local time, which
 * is the right answer for them.
 */
const formatter = (options) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });

export const formatCalendarDate = (value, { year = false } = {}) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatter({ month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }).format(date);
};
