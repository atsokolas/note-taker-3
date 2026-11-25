import { apart, dayOf, depthOf, depthSince, pathOf } from './homeModel';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-25T18:00:00Z');
const ago = days => new Date(NOW - days * DAY).toISOString();

describe('home model', () => {
  it('opens a book on its page, and anything else at the passage', () => {
    expect(pathOf({ book: true, articleId: 'b1' })).toBe('/books/b1');
    expect(pathOf({ book: true, articleId: 'b1', highlightId: 'h1' })).toBe('/books/b1?highlight=h1');
    expect(pathOf({ articleId: 'a1' })).toContain('a1');
    expect(pathOf({ articleId: 'a1', highlightId: 'h1' })).toContain('h1');
  });

  it('says how long ago the way a person would', () => {
    expect(dayOf(ago(0.2), NOW)).toBe('today');
    expect(dayOf(ago(1.5), NOW)).toBe('yesterday');
    expect(dayOf(ago(8), NOW)).toBe('a week ago');
    expect(dayOf(ago(15), NOW)).toBe('two weeks ago');
  });

  it('fades what you read lately as it sinks', () => {
    expect(depthOf(ago(0), NOW)).toBe(1);
    expect(depthOf(ago(7), NOW)).toBe(0.72);
    expect(depthOf(ago(30), NOW)).toBe(0.45);
  });

  it('measures the distance between two marks in months, then years', () => {
    expect(apart(ago(0), ago(31))).toBe('a month apart');
    expect(apart(ago(0), ago(200))).toBe('seven months apart');
    expect(apart(ago(0), ago(800))).toBe('two years apart');
  });

  it('counts the years underneath from the first mark', () => {
    expect(depthSince(ago(7 * 365.25 + 3), NOW)).toBe('seven years of reading');
    expect(depthSince(ago(100), NOW)).toMatch(/^reading since /);
    expect(depthSince(null, NOW)).toBe('');
  });
});
