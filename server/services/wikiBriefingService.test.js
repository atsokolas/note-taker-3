const { buildWikiBriefing, __testables } = require('./wikiBriefingService');

const {
  collectRecentlyUpdatedPages,
  collectDriftingPages,
  buildFallbackSummary,
  isWithin,
  countNewSources
} = __testables;

const NOW = new Date('2026-05-06T12:00:00Z').getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const buildPage = (overrides = {}) => ({
  _id: 'p1',
  title: 'Compounding interest',
  status: 'draft',
  aiState: {
    lastDraftedAt: null,
    health: {
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: [],
      relatedPages: []
    }
  },
  ...overrides
});

const fakeModel = (records) => ({
  find: () => ({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(records)
      })
    })
  })
});

describe('wikiBriefingService', () => {
  describe('isWithin', () => {
    it('returns true for timestamps inside the window and false outside', () => {
      expect(isWithin(new Date(NOW - 1000).toISOString(), ONE_DAY_MS, NOW)).toBe(true);
      expect(isWithin(new Date(NOW - 2 * ONE_DAY_MS).toISOString(), ONE_DAY_MS, NOW)).toBe(false);
    });

    it('returns false for null / invalid timestamps', () => {
      expect(isWithin(null, ONE_DAY_MS, NOW)).toBe(false);
      expect(isWithin('not-a-date', ONE_DAY_MS, NOW)).toBe(false);
    });
  });

  describe('collectRecentlyUpdatedPages', () => {
    it('keeps only pages drafted inside the window and trims to 8', () => {
      const pages = Array.from({ length: 12 }, (_, i) => buildPage({
        _id: `p${i}`,
        title: `Page ${i}`,
        aiState: {
          lastDraftedAt: new Date(NOW - i * 1000).toISOString(),
          health: buildPage().aiState.health
        }
      }));
      // Add one stale page that should be filtered out.
      pages.push(buildPage({ _id: 'old', aiState: { lastDraftedAt: new Date(NOW - 3 * ONE_DAY_MS).toISOString(), health: buildPage().aiState.health } }));
      const out = collectRecentlyUpdatedPages(pages, { windowMs: ONE_DAY_MS, now: NOW });
      expect(out).toHaveLength(8);
      expect(out[0].title).toBe('Page 0');
      expect(out.find(p => p._id === 'old')).toBeUndefined();
    });
  });

  describe('collectDriftingPages', () => {
    it('orders by total drift signal count and trims to 8', () => {
      const heavy = buildPage({
        _id: 'heavy',
        title: 'Heavy',
        aiState: {
          lastDraftedAt: null,
          health: {
            newItems: [{}, {}, {}],
            unsupportedClaims: [{}, {}],
            missingCitations: [],
            staleSections: [{}],
            contradictions: [{}],
            relatedPages: []
          }
        }
      });
      const light = buildPage({
        _id: 'light',
        title: 'Light',
        aiState: {
          lastDraftedAt: null,
          health: { ...buildPage().aiState.health, newItems: [{}] }
        }
      });
      const clean = buildPage({ _id: 'clean', title: 'Clean' });
      const out = collectDriftingPages([clean, light, heavy]);
      expect(out.map(p => p._id)).toEqual(['heavy', 'light']);
      expect(out[0].driftSignals).toBe(7);
      expect(out[1].driftSignals).toBe(1);
    });

    it('returns an empty array when no page has drift signals', () => {
      expect(collectDriftingPages([buildPage(), buildPage()])).toEqual([]);
    });
  });

  describe('buildFallbackSummary', () => {
    it('returns the quiet-day sentence when nothing is happening', () => {
      const out = buildFallbackSummary({ newSources: 0, recentlyUpdatedPages: [], driftingPages: [] });
      expect(out).toMatch(/quiet today/i);
    });

    it('joins the populated parts with separators and pluralizes correctly', () => {
      const out = buildFallbackSummary({
        newSources: 1,
        recentlyUpdatedPages: [{ title: 'A' }, { title: 'B' }],
        driftingPages: [{ title: 'C' }]
      });
      expect(out).toMatch(/1 new source arrived/);
      expect(out).toMatch(/2 wiki pages updated/);
      expect(out).toMatch(/1 page drifting/);
    });
  });

  describe('countNewSources', () => {
    it('counts articles, highlights, and notebooks created in the window', async () => {
      const recentArticle = {
        createdAt: new Date(NOW - 1000).toISOString(),
        highlights: [
          { createdAt: new Date(NOW - 500).toISOString() },
          { createdAt: new Date(NOW - 2 * ONE_DAY_MS).toISOString() }
        ]
      };
      const oldArticle = { createdAt: new Date(NOW - 3 * ONE_DAY_MS).toISOString(), highlights: [] };
      const recentNotebook = { createdAt: new Date(NOW - 200).toISOString() };
      const out = await countNewSources({
        userId: 'u1',
        models: {
          Article: fakeModel([recentArticle, oldArticle]),
          NotebookEntry: fakeModel([recentNotebook])
        },
        windowMs: ONE_DAY_MS,
        now: NOW
      });
      // 1 recent article + 1 recent highlight + 1 recent notebook = 3
      expect(out).toBe(3);
    });
  });

  describe('buildWikiBriefing (orchestration)', () => {
    it('returns the deterministic fallback summary when HF is unconfigured', async () => {
      const briefing = await buildWikiBriefing({
        userId: 'u1',
        models: { WikiPage: fakeModel([]), Article: fakeModel([]), NotebookEntry: fakeModel([]) },
        now: NOW,
        chat: jest.fn(),
        isConfigured: () => false
      });
      expect(briefing.summary).toMatch(/quiet today/i);
      expect(briefing.model).toBe('stub');
      expect(briefing.counts).toEqual({ newSources: 0, recentlyUpdatedPages: 0, driftingPages: 0 });
      expect(briefing.recentlyUpdatedPages).toEqual([]);
      expect(briefing.driftingPages).toEqual([]);
    });

    it('uses the chat client output when there is signal and HF is configured', async () => {
      const updatedPage = buildPage({
        _id: 'updated',
        title: 'Updated page',
        aiState: { lastDraftedAt: new Date(NOW - 1000).toISOString(), health: buildPage().aiState.health }
      });
      const driftingPage = buildPage({
        _id: 'drift',
        title: 'Drifting page',
        aiState: { lastDraftedAt: null, health: { ...buildPage().aiState.health, newItems: [{}] } }
      });
      const chat = jest.fn().mockResolvedValue({ text: 'Two pages moved today: Updated and Drifting.', model: 'gpt-test' });
      const briefing = await buildWikiBriefing({
        userId: 'u1',
        models: {
          WikiPage: fakeModel([updatedPage, driftingPage]),
          Article: fakeModel([]),
          NotebookEntry: fakeModel([])
        },
        now: NOW,
        chat,
        isConfigured: () => true
      });
      expect(chat).toHaveBeenCalledTimes(1);
      expect(briefing.summary).toBe('Two pages moved today: Updated and Drifting.');
      expect(briefing.model).toBe('gpt-test');
      expect(briefing.counts.recentlyUpdatedPages).toBe(1);
      expect(briefing.counts.driftingPages).toBe(1);
      expect(briefing.recentlyUpdatedPages[0].title).toBe('Updated page');
      expect(briefing.driftingPages[0].title).toBe('Drifting page');
    });

    it('trims model summaries at a sentence boundary instead of mid-sentence', async () => {
      const updatedPage = buildPage({
        _id: 'updated',
        title: 'Availability Heuristic',
        aiState: { lastDraftedAt: new Date(NOW - 1000).toISOString(), health: buildPage().aiState.health }
      });
      const chat = jest.fn().mockResolvedValue({
        text: 'Availability Heuristic moved today with fresh evidence. This second sentence keeps going past the budget with extra detail about decision quality, base rates, and the kinds of availability traps that make vivid examples crowd out quieter evidence in everyday judgment while adding still more material about source freshness, drift signals, section review, graph context, and the owner return loop.',
        model: 'gpt-test'
      });
      const briefing = await buildWikiBriefing({
        userId: 'u1',
        models: {
          WikiPage: fakeModel([updatedPage]),
          Article: fakeModel([]),
          NotebookEntry: fakeModel([])
        },
        now: NOW,
        chat,
        isConfigured: () => true
      });

      expect(briefing.summary).toBe('Availability Heuristic moved today with fresh evidence.');
      expect(briefing.summary).toMatch(/[.!?]$/);
    });

    it('excludes blocked quality pages from briefing summaries and counts', async () => {
      const blockedUpdatedPage = buildPage({
        _id: 'blocked',
        title: 'Complementary Machine Thing',
        plainText: 'This should not become the morning paper.',
        aiState: { lastDraftedAt: new Date(NOW - 1000).toISOString(), health: buildPage().aiState.health }
      });
      const goodUpdatedPage = buildPage({
        _id: 'good',
        title: 'Network Effects',
        plainText: 'Network effects become stronger as users join.',
        aiState: { lastDraftedAt: new Date(NOW - 2000).toISOString(), health: buildPage().aiState.health }
      });
      const briefing = await buildWikiBriefing({
        userId: 'u1',
        models: {
          WikiPage: fakeModel([blockedUpdatedPage, goodUpdatedPage]),
          Article: fakeModel([]),
          NotebookEntry: fakeModel([])
        },
        now: NOW,
        chat: jest.fn(),
        isConfigured: () => false
      });
      expect(briefing.counts.recentlyUpdatedPages).toBe(1);
      expect(briefing.totalPages).toBe(1);
      expect(briefing.recentlyUpdatedPages.map(page => page.title)).toEqual(['Network Effects']);
      expect(briefing.summary).toMatch(/1 wiki page updated/);
      expect(briefing.summary).not.toMatch(/Complementary Machine Thing/);
    });

    it('excludes generated QA pages from recently updated briefing pages', async () => {
      const qaUpdatedPage = buildPage({
        _id: 'qa',
        title: 'QA Build Order Verification 2026-06-19',
        plainText: 'Browser test page created to verify build order.',
        aiState: { lastDraftedAt: new Date(NOW - 1000).toISOString(), health: buildPage().aiState.health }
      });
      const goodUpdatedPage = buildPage({
        _id: 'good',
        title: 'Opportunity Cost',
        plainText: 'Opportunity cost compares an action to the best available alternative.',
        aiState: { lastDraftedAt: new Date(NOW - 2000).toISOString(), health: buildPage().aiState.health }
      });

      const briefing = await buildWikiBriefing({
        userId: 'u1',
        models: {
          WikiPage: fakeModel([qaUpdatedPage, goodUpdatedPage]),
          Article: fakeModel([]),
          NotebookEntry: fakeModel([])
        },
        now: NOW,
        chat: jest.fn(),
        isConfigured: () => false
      });

      expect(briefing.recentlyUpdatedPages.map(page => page.title)).toEqual(['Opportunity Cost']);
      expect(briefing.totalPages).toBe(1);
    });

    it('falls back to the deterministic summary when the chat client throws', async () => {
      const chat = jest.fn().mockRejectedValue(new Error('HF down'));
      const briefing = await buildWikiBriefing({
        userId: 'u1',
        models: {
          WikiPage: fakeModel([buildPage({ aiState: { lastDraftedAt: new Date(NOW - 1000).toISOString(), health: buildPage().aiState.health } })]),
          Article: fakeModel([]),
          NotebookEntry: fakeModel([])
        },
        now: NOW,
        chat,
        isConfigured: () => true
      });
      expect(briefing.summary).toMatch(/wiki pages? updated/);
      expect(briefing.model).toBe('stub');
    });

    it('throws if no userId is provided', async () => {
      await expect(buildWikiBriefing({ models: { WikiPage: fakeModel([]) }, now: NOW }))
        .rejects.toThrow(/userId/);
    });
  });
});
