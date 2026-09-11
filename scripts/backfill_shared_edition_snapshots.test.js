const { hashPublicEdition, projectPublicEdition } = require('../server/services/editionShape');
const { run } = require('./backfill_shared_edition_snapshots');

const store = (rows) => ({
  rows,
  find: (query) => ({
    lean: async () => rows.filter(row => Object.entries(query).every(([key, value]) => {
      if (key === '$or') {
        return value.some(clause => Object.entries(clause).every(([field, expected]) => {
          const held = row[field];
          if (expected && typeof expected === 'object' && expected.$exists === false) return held === undefined;
          if (expected && typeof expected === 'object' && expected.$in) return expected.$in.includes(held);
          return held === expected;
        }));
      }
      return String(row[key]) === String(value);
    }))
  }),
  findOne: (query) => ({
    lean: async () => rows.find(row => Object.entries(query)
      .every(([key, value]) => String(row[key]) === String(value))) || null
  }),
  updateOne: async (query, patch) => {
    const row = rows.find(entry => String(entry._id) === String(query._id));
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(row, patch.$set || {});
    return { matchedCount: 1, modifiedCount: 1 };
  }
});

describe('freezing existing edition shares', () => {
  it('writes the current public projection and does not invent an original date', async () => {
    const now = new Date('2026-09-10T21:00:00.000Z');
    const editions = [{
      _id: 'e1',
      userId: 'u1',
      profile: 'this_week_in_ai',
      title: 'This Week in AI',
      windowStart: '2026-09-01',
      windowEnd: '2026-09-07',
      standfirst: 'Live copy.',
      items: [{
        itemId: 'item-1',
        title: 'A paper',
        url: 'https://example.com/p',
        section: 'models_methods',
        finding: 'Loss fell.',
        boundary: 'One lab.',
        savedArticleId: 'art-1'
      }]
    }];
    const shares = [{
      _id: 's1',
      userId: 'u1',
      editionId: 'e1',
      slug: 'abc123',
      ownerDisplayName: 'Athan',
      snapshot: null,
      contentHash: ''
    }];
    const result = await run({
      SharedEdition: store(shares),
      Edition: store(editions),
      EditionProfile: store([]),
      User: { findById: () => ({ select: () => ({ lean: async () => ({ displayName: 'Athan' }) }) }) },
      apply: true,
      now
    });
    expect(result.mode).toBe('apply');
    expect(result.count).toBe(1);
    expect(shares[0].publishedAt).toBe(now);
    expect(shares[0].snapshot.standfirst).toBe('Live copy.');
    expect(shares[0].snapshot.items[0].savedArticleId).toBeUndefined();
    expect(shares[0].contentHash).toBe(hashPublicEdition(projectPublicEdition(editions[0], 'Athan')));
  });

  it('leaves a share that already has a snapshot alone', async () => {
    const shares = [{
      _id: 's1',
      userId: 'u1',
      editionId: 'e1',
      slug: 'abc123',
      snapshot: { title: 'Already frozen' },
      contentHash: 'abc'
    }];
    const result = await run({
      SharedEdition: store(shares),
      Edition: store([]),
      EditionProfile: store([]),
      apply: true
    });
    expect(result.count).toBe(0);
    expect(shares[0].snapshot.title).toBe('Already frozen');
  });

  it('reports a share whose edition is gone rather than writing an empty paper', async () => {
    const shares = [{
      _id: 's1',
      userId: 'u1',
      editionId: 'missing',
      slug: 'gone',
      snapshot: null,
      contentHash: ''
    }];
    const result = await run({
      SharedEdition: store(shares),
      Edition: store([]),
      EditionProfile: store([]),
      apply: true
    });
    expect(result.missingEdition).toBe(1);
    expect(shares[0].snapshot).toBeNull();
  });
});
