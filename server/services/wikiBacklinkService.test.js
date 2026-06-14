const { findWikiBacklinks, __testables } = require('./wikiBacklinkService');

const { buildTitleMatcher, scanCandidate, truncate } = __testables;

const fakeModel = (records) => ({
  find: () => ({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(records)
      })
    })
  })
});

describe('wikiBacklinkService', () => {
  describe('buildTitleMatcher', () => {
    it('returns null for titles that are too short to be useful', () => {
      expect(buildTitleMatcher('AI')).toBeNull();
      expect(buildTitleMatcher('   ')).toBeNull();
    });

    it('matches the title with word boundaries (case insensitive)', () => {
      const matcher = buildTitleMatcher('Compounding');
      expect('I love compounding interest.'.match(matcher)).not.toBeNull();
      expect('compoundinged is not a word.'.match(matcher)).toBeNull();
    });

    it('treats hyphens and spaces as equivalent inside the title', () => {
      const matcher = buildTitleMatcher('click-through');
      expect('Track click-through rate.'.match(matcher)).not.toBeNull();
      expect('Track click through rate.'.match(matcher)).not.toBeNull();
    });
  });

  describe('scanCandidate', () => {
    it('returns null when the candidate has no plain text', () => {
      const matcher = buildTitleMatcher('Compounding');
      expect(scanCandidate({ candidate: { plainText: '' }, matcher })).toBeNull();
      expect(scanCandidate({ candidate: { plainText: 'No mention here.' }, matcher })).toBeNull();
    });

    it('counts repeat mentions and returns a snippet around the first', () => {
      const matcher = buildTitleMatcher('Compounding');
      const out = scanCandidate({
        candidate: { plainText: 'Page about Compounding. Compounding rewards holding. End.' },
        matcher
      });
      expect(out.mentionCount).toBe(2);
      expect(out.snippet).toMatch(/Compounding/);
    });

    it('caps mention counting at 12 to bound work', () => {
      const matcher = buildTitleMatcher('Item');
      const repeated = Array.from({ length: 30 }, () => 'Item here.').join(' ');
      const out = scanCandidate({ candidate: { plainText: repeated }, matcher });
      expect(out.mentionCount).toBe(12);
    });
  });

  describe('truncate', () => {
    it('clamps the value to the limit and appends an ellipsis when over', () => {
      expect(truncate('short', 50)).toBe('short');
      const long = 'a'.repeat(120);
      expect(truncate(long, 30)).toMatch(/^a+…$/);
    });
  });

  describe('findWikiBacklinks', () => {
    const targetPage = { _id: 'target', title: 'Compounding interest' };

    it('excludes hidden, debug, and archived-flag pages from candidate scans', async () => {
      let capturedQuery = null;
      const model = {
        find: (query) => {
          capturedQuery = query;
          return {
            sort: () => ({
              limit: () => ({
                lean: () => Promise.resolve([])
              })
            })
          };
        }
      };
      await findWikiBacklinks({
        targetPage,
        userId: 'u1',
        models: { WikiPage: model }
      });
      expect(capturedQuery).toMatchObject({
        userId: 'u1',
        status: { $ne: 'archived' },
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true },
        _id: { $ne: 'target' }
      });
    });

    it('returns no backlinks when no other pages mention the target title', async () => {
      const out = await findWikiBacklinks({
        targetPage,
        userId: 'u1',
        models: { WikiPage: fakeModel([
          { _id: 'p1', title: 'Other', plainText: 'Nothing relevant here.' }
        ]) }
      });
      expect(out.backlinks).toEqual([]);
      expect(out.scanned).toBe(1);
    });

    it('ranks pages by mention count, then by recency', async () => {
      const records = [
        { _id: 'a', title: 'A', updatedAt: new Date('2026-04-20T00:00:00Z'), plainText: 'compounding interest matters.' },
        { _id: 'b', title: 'B', updatedAt: new Date('2026-04-25T00:00:00Z'), plainText: 'I keep thinking about compounding interest. Compounding interest scales.' },
        { _id: 'c', title: 'C', updatedAt: new Date('2026-04-22T00:00:00Z'), plainText: 'Compounding interest cohorts.' }
      ];
      const out = await findWikiBacklinks({
        targetPage,
        userId: 'u1',
        models: { WikiPage: fakeModel(records) }
      });
      // B has 2 mentions, A and C have 1 each. Among ties, more recent wins → C before A.
      expect(out.backlinks.map(b => b.pageId)).toEqual(['b', 'c', 'a']);
      expect(out.backlinks[0].mentionCount).toBe(2);
    });

    it('caps the backlinks list at MAX_BACKLINKS', async () => {
      const records = Array.from({ length: 20 }, (_, i) => ({
        _id: `p${i}`,
        title: `Page ${i}`,
        plainText: 'Compounding interest is the topic.'
      }));
      const out = await findWikiBacklinks({
        targetPage,
        userId: 'u1',
        models: { WikiPage: fakeModel(records) }
      });
      expect(out.backlinks.length).toBe(__testables.MAX_BACKLINKS);
      expect(out.scanned).toBe(20);
    });

    it('returns an empty list when the target title is missing or too short', async () => {
      const out = await findWikiBacklinks({
        targetPage: { _id: 'target', title: '' },
        userId: 'u1',
        models: { WikiPage: fakeModel([{ _id: 'p1', plainText: 'anything' }]) }
      });
      expect(out).toEqual({ backlinks: [], scanned: 0 });
    });

    it('returns a snippet that includes context around the match with leading and trailing ellipses', async () => {
      // Pad both sides of the mention with > SNIPPET_RADIUS characters so
      // the snippet window lands strictly inside the text (no edges hit).
      const lead = 'Aaaaa '.repeat(20).trim();
      const tail = 'Zzzzz '.repeat(20).trim();
      const records = [{
        _id: 'p1',
        title: 'Long page',
        plainText: `${lead}. The Compounding interest principle is a cornerstone of long-term thinking. ${tail}`
      }];
      const out = await findWikiBacklinks({
        targetPage,
        userId: 'u1',
        models: { WikiPage: fakeModel(records) }
      });
      expect(out.backlinks[0].snippet).toMatch(/Compounding interest/);
      expect(out.backlinks[0].snippet).toMatch(/^…/);
      expect(out.backlinks[0].snippet).toMatch(/…$/);
    });
  });
});
