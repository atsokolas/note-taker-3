import { RECURS, timePhrase, timeWord } from './timeWord';

// A Thursday, so "six days out" lands on a Wednesday and not on the same name.
const NOW = new Date('2026-10-01T12:00:00.000Z').getTime();
const day = (iso) => `${iso}T12:00:00.000Z`;

describe('the one time word', () => {
  it('names the weekday inside six days', () => {
    expect(timeWord(day('2026-10-02'), { now: NOW })).toBe('FRI');
    expect(timeWord(day('2026-10-06'), { now: NOW })).toBe('TUE');
  });

  it('names the date beyond six days, where a weekday would be ambiguous', () => {
    expect(timeWord(day('2026-10-09'), { now: NOW })).toBe('OCT 9');
    expect(timeWord(day('2026-11-01'), { now: NOW })).toBe('NOV 1');
  });

  it('marks a recurring promise, which is a weekday forever', () => {
    expect(timeWord(day('2026-10-05'), { now: NOW, recurring: true })).toBe(`MON ${RECURS}`);
  });

  it('says nothing for a day it does not have', () => {
    expect(timeWord(null, { now: NOW })).toBe('');
    expect(timeWord('someday', { now: NOW })).toBe('');
    expect(timeWord('', { now: NOW })).toBe('');
  });

  it('still names today by its weekday', () => {
    expect(timeWord(day('2026-10-01'), { now: NOW })).toBe('THU');
  });

  it('gives a day already past its date, not a weekday from last week', () => {
    expect(timeWord(day('2026-09-20'), { now: NOW })).toBe('SEP 20');
  });

  it('reads a chosen day in the timezone it was chosen in', () => {
    // Midnight UTC is the previous evening in Chicago; the promise is still
    // for the first of October.
    expect(timeWord('2026-10-01T00:00:00.000Z', { now: NOW })).toBe('THU');
  });

  it('prints in the mono register, without stops', () => {
    expect(timeWord(day('2026-10-09'), { now: NOW })).toBe(timeWord(day('2026-10-09'), { now: NOW }).toUpperCase());
    expect(timeWord(day('2026-10-09'), { now: NOW })).not.toContain('.');
  });
});

describe('the same day in prose', () => {
  it('spells the weekday out when a sentence is doing the talking', () => {
    expect(timePhrase(day('2026-10-06'), { now: NOW })).toBe('Tuesday');
  });

  it('spells the date out beyond the week', () => {
    expect(timePhrase(day('2026-11-01'), { now: NOW })).toBe('November 1');
  });

  it('says nothing it does not know', () => {
    expect(timePhrase(null, { now: NOW })).toBe('');
  });
});
