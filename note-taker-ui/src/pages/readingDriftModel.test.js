import {
  BUCKET_DAYS,
  buildDrift,
  directionOf,
  driftSentence,
  driftShortfall,
  topicsOf
} from './readingDriftModel';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = days => new Date(NOW - days * DAY).toISOString();

const source = (topic, days, extra = {}) => ({
  _id: `${topic}-${days}-${Math.random()}`,
  createdAt: daysAgo(days),
  folder: topic ? { _id: topic, name: topic } : null,
  ...extra
});

describe('topicsOf', () => {
  it('reads the shelf first, because filing is a deliberate act', () => {
    expect(topicsOf({ folder: { name: 'Capacity' }, tags: ['power'] })).toEqual(['Capacity', 'power']);
  });

  it('takes tags in either shape', () => {
    expect(topicsOf({ tags: [{ name: 'Grid' }, 'power'] })).toEqual(['Grid', 'power']);
  });

  it('does not count the same topic twice', () => {
    expect(topicsOf({ folder: { name: 'Power' }, tags: ['power'] })).toEqual(['Power']);
  });

  it('says nothing about a source that is neither filed nor tagged', () => {
    // A fake topic is worse than a smaller sample.
    expect(topicsOf({ title: 'Something unfiled' })).toEqual([]);
  });
});

describe('buildDrift', () => {
  it('buckets by fortnight, oldest first, so it reads left to right like time', () => {
    const drift = buildDrift([source('Capacity', 1), source('Capacity', 70)], NOW);
    const capacity = drift.series.find(item => item.topic === 'Capacity');
    expect(capacity.counts).toHaveLength(6);
    expect(capacity.counts[capacity.counts.length - 1]).toBe(1); // most recent fortnight
    expect(capacity.counts[0]).toBe(1); // ~70 days ago
  });

  it('ignores reading older than the window', () => {
    const drift = buildDrift([source('Capacity', BUCKET_DAYS * 20)], NOW);
    expect(drift.filed).toBe(0);
  });

  it('leaves unfiled reading out of the count entirely', () => {
    const drift = buildDrift([source('Capacity', 2), { _id: 'x', createdAt: daysAgo(2) }], NOW);
    expect(drift.filed).toBe(1);
  });

  it('refuses to call two articles a direction', () => {
    const drift = buildDrift([source('Capacity', 2), source('Power', 3)], NOW);
    expect(drift.enough).toBe(false);
    expect(driftShortfall(drift)).toContain('not enough to call it a direction yet');
  });

  it('survives being given nothing', () => {
    expect(buildDrift().filed).toBe(0);
    expect(driftShortfall(buildDrift())).toContain('fills in as you file');
  });
});

describe('directionOf', () => {
  it('reads the recent half against the older half, not the last point', () => {
    expect(directionOf([0, 0, 0, 0.6, 0.7, 0.8])).toBe('rising');
    expect(directionOf([0.8, 0.7, 0.6, 0, 0, 0])).toBe('fading');
    expect(directionOf([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toBe('steady');
  });

  it('does not let one busy fortnight read as a trend', () => {
    expect(directionOf([0.5, 0.5, 0.5, 0.5, 0.5, 0.56])).toBe('steady');
  });
});

describe('driftSentence', () => {
  const many = (topic, days, count) => Array.from({ length: count }, () => source(topic, days));

  it('notices out loud when one thing gives way to another', () => {
    const drift = buildDrift([
      ...many('Capacity', 70, 4), ...many('Capacity', 56, 3),
      ...many('Power', 10, 4), ...many('Power', 3, 4)
    ], NOW);
    expect(drift.enough).toBe(true);
    expect(driftSentence(drift)).toBe('You are reading less about Capacity and more about Power.');
  });

  it('says when nothing moved, which is also worth knowing', () => {
    const drift = buildDrift([
      ...many('Capacity', 70, 2), ...many('Capacity', 42, 2),
      ...many('Capacity', 20, 2), ...many('Capacity', 3, 2),
      ...many('Power', 70, 1), ...many('Power', 42, 1),
      ...many('Power', 20, 1), ...many('Power', 3, 1)
    ], NOW);
    expect(driftSentence(drift)).toBe('Three months of reading, and it has not moved: still mostly Capacity.');
  });

  it('stays quiet when there is not enough to go on', () => {
    expect(driftSentence(buildDrift([source('Capacity', 2)], NOW))).toBe('');
  });
});
