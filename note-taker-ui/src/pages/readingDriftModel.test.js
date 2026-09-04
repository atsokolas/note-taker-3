import {
  BUCKET_DAYS,
  buildDrift,
  directionOf,
  driftClosesAt,
  driftSentence,
  driftShortfall,
  topicsOf
} from './readingDriftModel';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = days => new Date(NOW - days * DAY).toISOString();

const source = (topic, days, extra = {}) => ({
  _id: `${topic}-${days}-${Math.random()}`,
  title: `${topic || 'Unfiled'} work from ${days} days ago`,
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

  it('reads the drawer a nested leaf lives in, not the leaf', () => {
    const folders = [
      { _id: 'investing', name: 'Investing' },
      { _id: 'costco', name: 'Costco', parentFolderId: 'investing' }
    ];
    expect(topicsOf({ folder: { _id: 'costco', name: 'Costco' } }, folders))
      .toEqual(['Investing']);
  });

  it('reads the filed name when the cabinet is not at hand', () => {
    expect(topicsOf({ folder: { _id: 'costco', name: 'Costco' } }))
      .toEqual(['Costco']);
  });

  it('reads the filed name when its drawer is gone', () => {
    expect(topicsOf({ folder: { _id: 'costco', name: 'Costco' } }, [
      { _id: 'investing', name: 'Investing' }
    ])).toEqual(['Costco']);
  });

  it('reads a string folder id through the cabinet', () => {
    const folders = [
      { _id: 'investing', name: 'Investing' },
      { _id: 'costco', name: 'Costco', parentFolderId: 'investing' }
    ];
    expect(topicsOf({ folder: 'costco' }, folders)).toEqual(['Investing']);
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

  it('keeps the exact works and date window behind every point', () => {
    const drift = buildDrift([
      source('Power', 2, { _id: 'grid-1', title: 'The New Power Grid', siteName: 'IEEE' }),
      source('Power', 4, { _id: 'grid-2', title: 'Datacenters Meet the Grid', author: 'Jane Doe' })
    ], NOW);
    const current = drift.series.find(item => item.topic === 'Power').periods.at(-1);

    expect(current.count).toBe(2);
    expect(current.total).toBe(2);
    expect(current.startsAt).toBe('2026-08-04T12:00:00.000Z');
    expect(current.endsAt).toBe('2026-08-18T12:00:00.000Z');
    expect(current.works).toEqual([
      expect.objectContaining({ id: 'grid-1', title: 'The New Power Grid', publication: 'IEEE' }),
      expect.objectContaining({ id: 'grid-2', title: 'Datacenters Meet the Grid', author: 'Jane Doe' })
    ]);
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

/* Shipped saying "You have drifted away from Needs Review", which is the
   product mistaking its own filing tray for a subject. */
describe('procedural shelves', () => {
  const { isProceduralShelf } = require('./readingDriftModel');

  it('knows a stage of work from a subject', () => {
    ['Needs Review', 'needs review', 'Inbox', 'To Read', 'Read Later', 'Unsorted', 'Archive']
      .forEach(name => expect(isProceduralShelf(name)).toBe(true));
    ['Investing & Capital Allocation', 'Psychology & Decision Making', 'Power', 'Reviews of Books']
      .forEach(name => expect(isProceduralShelf(name)).toBe(false));
  });

  it('leaves them out of what a source is about', () => {
    expect(topicsOf({ folder: { name: 'Needs Review' }, tags: ['inbox', 'Capacity'] })).toEqual(['Capacity']);
  });

  it('so a source filed only in a tray counts as unfiled, not as a topic', () => {
    const drift = buildDrift([source('Needs Review', 2), source('Needs Review', 4)], NOW);
    expect(drift.filed).toBe(0);
  });
});

/* The paper prints the drift on its own fortnight — the sentence, not the
   surface — and only when the corpus is big enough for it to mean anything. */
describe('the drift on the paper', () => {
  const filed = (n, topic, at) => Array.from({ length: n }, (_, i) => ({
    _id: `${topic}-${i}`,
    tags: [topic],
    createdAt: at
  }));

  it('closes a bucket every fourteen days, and says which day that is', () => {
    const closes = driftClosesAt({ beganAt: '2026-08-01T00:00:00.000Z', now: new Date('2026-09-01T00:00:00.000Z').getTime() });
    expect(new Date(closes).toISOString()).toBe('2026-09-12T00:00:00.000Z');
  });

  it('says nothing about a close it cannot date', () => {
    expect(driftClosesAt({ beganAt: null })).toBeNull();
    expect(driftClosesAt({ beganAt: 'someday' })).toBeNull();
  });

  it('prints on the closing day and is silent the other thirteen', () => {
    const { isDriftCloseDay } = require('./readingDriftModel');
    const closes = '2026-09-12T12:00:00.000Z';
    expect(isDriftCloseDay({
      driftClosesAt: closes,
      now: new Date('2026-09-12T18:00:00.000Z').getTime()
    })).toBe(true);
    expect(isDriftCloseDay({
      driftClosesAt: closes,
      now: new Date('2026-09-13T12:00:00.000Z').getTime()
    })).toBe(false);
    expect(isDriftCloseDay({ driftClosesAt: null })).toBe(false);
    expect(isDriftCloseDay({})).toBe(false);
  });

  it('prints nothing below the minimum, however interesting the shape', () => {
    const thin = buildDrift(filed(3, 'macro', '2026-08-20T00:00:00.000Z'));
    expect(driftSentence(thin)).toBe('');
  });
});
