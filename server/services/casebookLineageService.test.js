const assert = require('assert');
const {
  CasebookLineageError,
  followCasebook,
  folioHash,
  publicLineageTree,
  unfollowCasebook
} = require('./casebookLineageService');

const origin = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  slug: 'compute-stays-scarce',
  title: 'Compute stays scarce',
  visibility: 'shared',
  status: 'published',
  judgment: { currentJudgment: 'Compute stays scarce through 2027.' }
};

describe('casebook lineage', () => {
  it('follows without copying and keeps a frozen origin hash', async () => {
    const created = [];
    const CasebookLineage = {
      findOne: async () => null,
      create: async (row) => {
        created.push(row);
        return row;
      }
    };
    const first = await followCasebook({ CasebookLineage, userId: 'reader-1', originPage: origin });
    expect(first.idempotent).toBe(false);
    expect(first.lineage.action).toBe('follow');
    expect(first.lineage.childPageId).toBeUndefined();
    expect(first.lineage.originHash).toBe(folioHash(origin));
    CasebookLineage.findOne = async () => first.lineage;
    const again = await followCasebook({ CasebookLineage, userId: 'reader-1', originPage: origin });
    expect(again.idempotent).toBe(true);
    expect(created).toHaveLength(1);
  });

  it('lets a follow end without rewriting the frozen origin', async () => {
    const row = {
      action: 'follow',
      originHash: 'frozen-hash',
      originTitle: 'Compute stays scarce',
      revokedAt: null,
      save: async function save() { return this; }
    };
    const result = await unfollowCasebook({
      CasebookLineage: { findOne: async () => row },
      userId: 'reader-1',
      originPageId: origin._id,
      now: () => new Date('2026-08-31T12:00:00.000Z')
    });
    expect(result.lineage.originHash).toBe('frozen-hash');
    expect(result.lineage.revokedAt.toISOString()).toBe('2026-08-31T12:00:00.000Z');
  });

  it('shows public forks as a tree and keeps revoked origins named', async () => {
    const CasebookLineage = {
      findOne: async () => ({
        action: 'fork',
        originPageId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        originTitle: 'The first compute case',
        originSlug: 'first-compute',
        originHash: 'origin-hash-frozen',
        originClaim: 'Compute stays scarce through 2027.'
      }),
      find: async () => [{
        action: 'fork',
        childPageId: 'cccccccccccccccccccccccc',
        originClaim: 'Compute stays scarce through 2027.',
        createdAt: '2026-08-20T00:00:00.000Z'
      }]
    };
    const WikiPage = {
      findOne: async () => ({ visibility: 'private', slug: 'first-compute', title: 'hidden' }),
      find: async () => [{
        _id: 'cccccccccccccccccccccccc',
        title: 'A branched reading',
        slug: 'branched-reading',
        visibility: 'shared',
        judgment: { currentJudgment: 'Compute eases in two regions.' }
      }]
    };
    const tree = await publicLineageTree({ CasebookLineage, WikiPage, page: origin });
    expect(tree.origin).toMatchObject({
      title: 'The first compute case',
      slug: 'first-compute',
      hash: 'origin-hash-frozen',
      revoked: true
    });
    expect(tree.branches).toEqual([expect.objectContaining({
      title: 'A branched reading',
      slug: 'branched-reading',
      diverged: true
    })]);
    const wire = JSON.stringify(tree);
    assert.ok(!wire.includes('reader-1'));
    assert.ok(!/\b\d+\s+forks?\b/i.test(wire));
  });

  it('refuses to follow a private page', async () => {
    await expect(followCasebook({
      CasebookLineage: { findOne: async () => null },
      userId: 'reader-1',
      originPage: { ...origin, visibility: 'private' }
    })).rejects.toBeInstanceOf(CasebookLineageError);
  });
});
