import {
  getWhyItMatters,
  pickLine,
  progressPhrase,
  showsWeather,
  weekKey
} from './libraryReadingRoomModel';

describe('libraryReadingRoomModel', () => {
  it('prefers excerpt text for why-it-matters when available', () => {
    expect(getWhyItMatters({ highlightCount: 3 }, 'Take a simple idea and take it seriously.'))
      .toBe('Take a simple idea and take it seriously.');
    expect(getWhyItMatters({ highlightCount: 0 })).toBe('');
  });

  it('keys a week by its Monday', () => {
    expect(weekKey(new Date(2026, 9, 14, 9))).toBe('2026-10-12');
    expect(weekKey(new Date(2026, 9, 12, 0, 5))).toBe('2026-10-12');
    expect(weekKey(new Date(2026, 9, 18, 23))).toBe('2026-10-12');
  });

  it('shows the weather on Mondays and on the first visit of any other week', () => {
    const monday = new Date(2026, 9, 12, 9);
    const wednesday = new Date(2026, 9, 14, 9);
    expect(showsWeather({ now: monday, seenWeek: '2026-10-12' })).toBe(true);
    expect(showsWeather({ now: wednesday, seenWeek: '2026-10-05' })).toBe(true);
    expect(showsWeather({ now: wednesday, seenWeek: '' })).toBe(true);
    expect(showsWeather({ now: wednesday, seenWeek: '2026-10-12' })).toBe(false);
  });

  it('says how far in you are without numbers', () => {
    expect(progressPhrase(null)).toBe('');
    expect(progressPhrase(0.2)).toBe('a little way in');
    expect(progressPhrase(0.5)).toBe('about halfway');
    expect(progressPhrase(0.8)).toBe('most of the way through');
  });

  it('says when the pick was saved and whether it was opened', () => {
    const now = new Date(2026, 9, 14);
    expect(pickLine({ savedAt: new Date(2026, 2, 4).toISOString() }, now)).toBe('Saved in March, not yet opened.');
    expect(pickLine({ savedAt: new Date(2025, 2, 4).toISOString(), ratio: 0.5 }, now)).toBe('Saved in March 2025. You are about halfway.');
    expect(pickLine({}, now)).toBe('Not yet opened.');
  });
});
