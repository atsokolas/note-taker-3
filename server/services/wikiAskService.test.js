const { askWikiPage, loadWikiAskCorpus, __testables } = require('./wikiAskService');

const {
  buildSourceList,
  buildRelatedPageContexts,
  buildGraphHighlightContexts,
  buildConceptContexts,
  buildBacklinkContexts,
  buildAskGraphContext,
  buildGraphSearchSummary,
  provenanceFromContext,
  buildSystemPrompt,
  collectClaimContradictionContexts,
  collectTemporalChangeContexts,
  normalizeAnswerSchema,
  buildFallbackAnswer,
  buildGraphFallbackAnswer,
  buildTemporalFallbackAnswer,
  buildContradictionFallbackAnswer,
  docFromAnswer,
  buildPageContext,
  buildPageSummaryAnswer,
  isTemporalQuestion,
  isContradictionQuestion,
  isSummaryRequest,
  truncateAtSentenceBoundary,
  pickExactPageSentence,
  isSelectedPageOnlyQuestion,
  pageTitleMentionedInQuestion,
  extractMentionedTitleCandidates,
  rankWikiPageCandidates
} = __testables;

const buildPage = (overrides = {}) => ({
  title: 'Compounding interest',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compounders need patience.' }] }] },
  sourceRefs: [
    { _id: 'src1', type: 'highlight', title: 'Buffett', snippet: 'Hold what you understand.' },
    { _id: 'src2', type: 'article', title: 'Disruption', snippet: 'Compounding windows can shorten.' }
  ],
  ...overrides
});

const findClaimMarks = (doc) => {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks
        .filter(mark => mark?.type === 'claim')
        .forEach(mark => out.push({ text: node.text, attrs: mark.attrs }));
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return out;
};

describe('wikiAskService', () => {
  describe('buildSourceList', () => {
    it('1-indexes sources and trims to 12', () => {
      const sources = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, snippet: 'snip', type: 'article' }));
      const list = buildSourceList(sources);
      expect(list).toHaveLength(12);
      expect(list[0].index).toBe(1);
      expect(list[11].index).toBe(12);
    });

    it('falls back to "Untitled source" when title is missing', () => {
      expect(buildSourceList([{ snippet: 'x' }])[0].title).toBe('Untitled source');
    });
  });

  describe('buildSystemPrompt', () => {
    it('appends the wiki schema conventions to ask prompts', () => {
      const prompt = buildSystemPrompt({
        page: buildPage(),
        sources: buildSourceList(buildPage().sourceRefs),
        question: 'What matters?',
        wikiSchemaContent: '## Voice and tone\n- Prefer durable reference prose.'
      });
      expect(prompt).toContain('User wiki schema conventions');
      expect(prompt).toContain('Prefer durable reference prose.');
    });

    it('includes related wiki pages selected from the question', () => {
      const prompt = buildSystemPrompt({
        page: buildPage({ title: 'Loss Aversion' }),
        sources: [],
        relatedPageContexts: [{
          id: 'page-opportunity-cost',
          title: 'Opportunity Cost',
          plainText: 'Opportunity cost is the value of the next best alternative.',
          pageType: 'concept'
        }],
        highlightContexts: [{
          id: 'hl-1',
          title: 'Kahneman highlight',
          snippet: 'Losses loom larger than gains.',
          fromPageTitle: 'Loss Aversion'
        }],
        conceptContexts: [{
          id: 'concept-1',
          name: 'Opportunity Cost',
          description: 'The hidden cost of the next best alternative.'
        }],
        question: 'How does Loss Aversion connect to Opportunity Cost?'
      });
      expect(prompt).toContain('Related wiki pages selected');
      expect(prompt).toContain('RELATED WIKI PAGE 1: Opportunity Cost');
      expect(prompt).toContain('Relevant highlights from the corpus');
      expect(prompt).toContain('Never say "Answered from the selected wiki page"');
    });

    it('uses sentence-bounded page context for exact quote requests', () => {
      const page = buildPage({
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: [
                'Alpha is the opening frame.',
                'Margin of safety protects investors from valuation error.',
                'The closing sentence should remain complete.'
              ].join(' ')
            }]
          }]
        }
      });
      const context = buildPageContext({
        page,
        question: 'Quote the exact sentence about valuation error.'
      });
      expect(context).toContain('Margin of safety protects investors from valuation error.');
      expect(context).not.toMatch(/\.\.\.$/);
      const prompt = buildSystemPrompt({
        page,
        sources: [],
        question: 'Quote the exact sentence about valuation error.'
      });
      expect(prompt).toContain('preserve quoted sentence wording exactly');
    });

    it('does not stitch headings into exact quote candidates', () => {
      const page = buildPage({
        body: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Investors should distinguish price from value.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Diverging Evidence' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'The Mr. Market metaphor says prices swing between pessimism and optimism.' }] }
          ]
        }
      });

      expect(pickExactPageSentence({
        page,
        question: 'Quote the exact sentence about Mr. Market from this page.'
      })).toBe('The Mr. Market metaphor says prices swing between pessimism and optimism.');
    });

    it('does not cut long context mid-sentence when a sentence boundary is available', () => {
      const text = 'First complete sentence. Second complete sentence. Third sentence is too long to include fully.';
      expect(truncateAtSentenceBoundary(text, 56)).toBe('First complete sentence. Second complete sentence.');
    });
  });

  describe('normalizeAnswerSchema', () => {
    it('returns the fallback when input is null', () => {
      const fallback = { paragraphs: [{ text: 'fallback', citationIndexes: [] }], citationIndexesUsed: [] };
      expect(normalizeAnswerSchema(null, fallback)).toBe(fallback);
    });

    it('strips trailing "[1, 2]" suffixes from paragraph text', () => {
      const fallback = { paragraphs: [], citationIndexesUsed: [] };
      const out = normalizeAnswerSchema({ paragraphs: [{ text: 'Real answer text. [1, 2]', citationIndexes: [1, 2] }] }, fallback);
      expect(out.paragraphs[0].text).toBe('Real answer text.');
      expect(out.paragraphs[0].citationIndexes).toEqual([1, 2]);
    });

    it('drops paragraphs with empty text and caps to 6 paragraphs', () => {
      const fallback = { paragraphs: [], citationIndexesUsed: [] };
      const input = { paragraphs: Array.from({ length: 12 }, (_, i) => ({ text: i % 2 === 0 ? 'good' : '   ', citationIndexes: [] })) };
      const out = normalizeAnswerSchema(input, fallback);
      // Half were empty → only 6 "good" survive but cap is 6.
      expect(out.paragraphs.length).toBeLessThanOrEqual(6);
      out.paragraphs.forEach(p => expect(p.text).toBe('good'));
    });

    it('aggregates citation indexes across paragraphs into a sorted unique list', () => {
      const fallback = { paragraphs: [], citationIndexesUsed: [] };
      const out = normalizeAnswerSchema({
        paragraphs: [
          { text: 'a', citationIndexes: [3, 1] },
          { text: 'b', citationIndexes: [1, 2] }
        ]
      }, fallback);
      expect(out.citationIndexesUsed).toEqual([1, 2, 3]);
    });

    it('drops invalid (non-positive, non-finite) citation indexes', () => {
      const fallback = { paragraphs: [], citationIndexesUsed: [] };
      const out = normalizeAnswerSchema({
        paragraphs: [{ text: 'a', citationIndexes: [0, -1, NaN, 'not-a-number', 2] }]
      }, fallback);
      expect(out.paragraphs[0].citationIndexes).toEqual([2]);
    });

    it('drops citation indexes outside the attached source list', () => {
      const fallback = { paragraphs: [], citationIndexesUsed: [] };
      const out = normalizeAnswerSchema({
        paragraphs: [
          { text: 'a', citationIndexes: [1, 999] },
          { text: 'b', citationIndexes: [2, 3] }
        ]
      }, fallback, 2);
      expect(out.paragraphs[0].citationIndexes).toEqual([1]);
      expect(out.paragraphs[1].citationIndexes).toEqual([2]);
      expect(out.citationIndexesUsed).toEqual([1, 2]);
    });

    it('preserves deterministic fallback citations when model prose omits them', () => {
      const fallback = {
        paragraphs: [{ text: 'Fallback source-backed answer.', citationIndexes: [1] }],
        citationIndexesUsed: [1]
      };
      const out = normalizeAnswerSchema({
        paragraphs: [{ text: 'Model answer forgot citations.', citationIndexes: [] }]
      }, fallback, 2);
      expect(out.paragraphs[0].text).toBe('Model answer forgot citations.');
      expect(out.paragraphs[0].citationIndexes).toEqual([1]);
      expect(out.citationIndexesUsed).toEqual([1]);
    });
  });

  describe('docFromAnswer', () => {
    it('wraps each paragraph in a claim mark with the right citation indexes and inferred support', () => {
      const doc = docFromAnswer({
        paragraphs: [
          { text: 'A.', citationIndexes: [1, 2] },
          { text: 'B.', citationIndexes: [1] },
          { text: 'C.', citationIndexes: [] }
        ]
      });
      const marks = findClaimMarks(doc);
      expect(marks).toHaveLength(3);
      expect(marks[0].attrs.support).toBe('supported');
      expect(marks[1].attrs.support).toBe('partial');
      expect(marks[2].attrs.support).toBe('unsupported');
      expect(marks[0].attrs.citationIndexes).toEqual([1, 2]);
    });
  });

  describe('buildFallbackAnswer', () => {
    it('cites the top two attached sources when present', () => {
      const sources = buildSourceList(buildPage().sourceRefs);
      const out = buildFallbackAnswer({ page: buildPage(), sources, question: 'What makes compounding useful?' });
      expect(out.citationIndexesUsed).toContain(2);
      expect(out.paragraphs).toHaveLength(1);
      expect(out.paragraphs[0].text).toMatch(/compounding/i);
    });

    it('returns no citation indexes when no sources are attached', () => {
      const out = buildFallbackAnswer({ page: { title: 'X', body: {} }, sources: [], question: 'why?' });
      expect(out.citationIndexesUsed).toEqual([]);
    });

    it('admits when the page lacks evidence and states what was searched', () => {
      const sources = buildSourceList(buildPage().sourceRefs);
      const out = buildFallbackAnswer({
        page: buildPage(),
        sources,
        question: 'What is the weather in Chicago?',
        searchedSummary: 'Searched Compounding interest, 1 related wiki page, 2 highlights.'
      });
      expect(out.citationIndexesUsed).toEqual([]);
      expect(out.paragraphs[0].text).toMatch(/do not see enough evidence/i);
      expect(out.paragraphs[0].text).toMatch(/Searched Compounding interest/);
    });
  });

  describe('summary requests', () => {
    const investingPage = buildPage({
      title: 'Investing - Concepts, Ideas, and Strategies',
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Investing is the disciplined allocation of capital to assets whose expected cash flows exceed their purchase price.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'The page explains cash-flow valuation and repeatable decision processes.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Converging Evidence' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Evidence emphasizes patience, source discipline, and risk limits.' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Diverging Evidence' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Narrow concentration can work for experts but requires strict controls.' }] }
        ]
      }
    });

    it('detects summarize and overview prompts', () => {
      expect(isSummaryRequest('Summarize this page in one sentence.')).toBe(true);
      expect(isSummaryRequest('Give me a 3-bullet overview.')).toBe(true);
      expect(isSummaryRequest('How does this connect to Opportunity Cost?')).toBe(false);
    });

    it('builds one whole-page sentence from the lead and section structure', () => {
      const out = buildPageSummaryAnswer({
        page: investingPage,
        question: 'Summarize this page in one sentence.'
      });
      expect(out.paragraphs).toHaveLength(1);
      expect(out.paragraphs[0].text).toMatch(/Investing - Concepts/);
      expect(out.paragraphs[0].text).toMatch(/disciplined allocation of capital/);
      expect(out.paragraphs[0].text).toMatch(/Overview/);
      expect(out.paragraphs[0].text).toMatch(/Converging Evidence/);
    });

    it('returns requested overview breadth instead of a single retrieved sub-point', () => {
      const out = buildPageSummaryAnswer({
        page: investingPage,
        question: 'Give me a 3-bullet overview.'
      });
      expect(out.paragraphs).toHaveLength(3);
      expect(out.paragraphs[0].text).toMatch(/disciplined allocation of capital/);
      expect(out.paragraphs[1].text).toMatch(/Overview/i);
      expect(out.paragraphs[2].text).toMatch(/Converging Evidence/i);
    });
  });

  describe('graph context', () => {
    it('detects when the reader scoped the question to the selected page only', () => {
      expect(isSelectedPageOnlyQuestion('Answer only from this page.')).toBe(true);
      expect(isSelectedPageOnlyQuestion('How does Loss Aversion connect to Opportunity Cost?')).toBe(false);
    });

    it('matches named wiki page titles in the question', () => {
      expect(pageTitleMentionedInQuestion('Opportunity Cost', 'How does Loss Aversion connect to Opportunity Cost?')).toBe(true);
      expect(pageTitleMentionedInQuestion('Random Walk', 'How does Loss Aversion connect to Opportunity Cost?')).toBe(false);
    });

    it('extracts title-like question phrases for exact page prefetch', () => {
      const candidates = extractMentionedTitleCandidates({
        question: 'How does Loss Aversion connect to Opportunity Cost?',
        selectedTitle: 'Loss Aversion'
      });
      expect(candidates).toContain('opportunity cost');
      expect(candidates).not.toContain('loss aversion');
    });

    it('prioritizes question-mentioned pages ahead of unrelated recent pages', () => {
      const ranked = rankWikiPageCandidates({
        page: { _id: 'page-loss', title: 'Loss Aversion' },
        question: 'How does Loss Aversion connect to Opportunity Cost?',
        relatedPages: [
          { _id: 'page-random', title: 'Random Walk', plainText: 'Noise.' },
          { _id: 'page-opp', title: 'Opportunity Cost', plainText: 'Hidden cost.' }
        ]
      });
      expect(ranked[0].title).toBe('Opportunity Cost');
    });

    it('selects a named related wiki page from the question', () => {
      const related = buildRelatedPageContexts({
        page: { _id: 'page-loss', title: 'Loss Aversion', plainText: 'Losses feel larger than gains.' },
        question: 'How does Loss Aversion connect to Opportunity Cost?',
        relatedPages: [
          { _id: 'page-loss', title: 'Loss Aversion', plainText: 'Current page.' },
          { _id: 'page-opp', title: 'Opportunity Cost', pageType: 'concept', plainText: 'Opportunity cost is the forgone alternative.' },
          { _id: 'page-random', title: 'Random Walk', plainText: 'Market prices move unpredictably.' }
        ]
      });
      expect(related).toHaveLength(1);
      expect(related[0].title).toBe('Opportunity Cost');
    });

    it('skips related pages when the reader scoped the question to the selected page only', () => {
      const related = buildRelatedPageContexts({
        page: { _id: 'page-loss', title: 'Loss Aversion', plainText: 'Losses feel larger than gains.' },
        question: 'On this page only, what is the main claim?',
        selectedPageOnly: true,
        relatedPages: [
          { _id: 'page-opp', title: 'Opportunity Cost', plainText: 'Opportunity cost is the forgone alternative.' }
        ]
      });
      expect(related).toEqual([]);
    });

    it('collects highlight evidence from related pages', () => {
      const highlights = buildGraphHighlightContexts({
        page: {
          _id: 'page-loss',
          title: 'Loss Aversion',
          sourceRefs: [{ _id: 'hl-1', type: 'highlight', title: 'Kahneman', snippet: 'Losses loom larger than gains.' }]
        },
        relatedPages: [{
          _id: 'page-opp',
          title: 'Opportunity Cost',
          sourceRefs: [{ _id: 'hl-2', type: 'highlight', title: 'Thaler', snippet: 'Hidden opportunity costs feel weaker than visible losses.' }]
        }],
        relatedPageContexts: [{ id: 'page-opp', title: 'Opportunity Cost', plainText: 'Hidden cost.' }],
        question: 'How does Loss Aversion connect to Opportunity Cost?'
      });
      expect(highlights).toHaveLength(2);
      expect(highlights.some(row => row.title === 'Thaler')).toBe(true);
    });

    it('collects temporal revision context for change questions', () => {
      expect(isTemporalQuestion('What changed in my thinking over the last month?')).toBe(true);
      const contexts = collectTemporalChangeContexts({
        page: { _id: 'page-loss', title: 'Loss Aversion' },
        question: 'What changed in my thinking?',
        revisionRows: [{
          _id: 'rev-1',
          pageId: 'page-loss',
          reason: 'agent_maintenance',
          actorType: 'agent',
          summary: 'Added source-backed distinction between visible losses and hidden costs.',
          before: {
            title: 'Loss Aversion',
            sourceRefs: [],
            claims: [],
            plainText: 'Loss aversion is a bias.'
          },
          after: {
            title: 'Loss Aversion',
            sourceRefs: [{ _id: 'src-1', title: 'Kahneman' }],
            claims: [{ text: 'Visible losses can hide opportunity costs.' }],
            plainText: 'Loss aversion now includes opportunity cost tension.'
          },
          createdAt: '2026-06-28T10:00:00.000Z'
        }]
      });
      expect(contexts).toHaveLength(1);
      expect(contexts[0].date).toBe('2026-06-28');
      expect(contexts[0].summary).toMatch(/Added source-backed distinction/);
      expect(contexts[0].sourceDelta).toBe(1);
    });

    it('collects explicit contradiction contexts from selected and related page claims', () => {
      expect(isContradictionQuestion('Where do these claims contradict each other?')).toBe(true);
      const contexts = collectClaimContradictionContexts({
        page: {
          _id: 'page-loss',
          title: 'Loss Aversion',
          sourceRefs: [{ _id: 'src-counter', title: 'Lab replication note' }],
          claims: [{
            _id: 'claim-1',
            text: 'Loss aversion is stable across all decision contexts.',
            support: 'conflicted',
            contradictedByCitationIds: ['src-counter']
          }]
        },
        relatedPages: [{
          _id: 'page-opp',
          title: 'Opportunity Cost',
          claims: [{ text: 'Hidden opportunity costs are often underweighted.', support: 'supported' }]
        }],
        question: 'Where does Loss Aversion contradict the evidence?'
      });
      expect(contexts).toHaveLength(1);
      expect(contexts[0].text).toMatch(/stable across all decision contexts/);
      expect(contexts[0].contradictedByTitles).toEqual(['Lab replication note']);
    });

    it('does not load hidden or debug wiki pages into graph ask corpus', async () => {
      const lean = jest.fn().mockResolvedValue([]);
      const select = jest.fn(() => ({ lean }));
      const limit = jest.fn(() => ({ select }));
      const sort = jest.fn(() => ({ limit }));
      const find = jest.fn(() => ({ sort, limit }));

      await loadWikiAskCorpus({
        page: { _id: 'page-loss', title: 'Loss Aversion' },
        question: 'How does this connect to Opportunity Cost?',
        userId: 'user-1',
        WikiPage: { find },
        TagMeta: null,
        findWikiBacklinks: null
      });

      expect(find).toHaveBeenCalledWith({
        userId: 'user-1',
        status: { $ne: 'archived' },
        hiddenFromHome: { $ne: true },
        debugOnly: { $ne: true },
        archived: { $ne: true }
      });
    });

    it('prefetches question-mentioned page titles outside the recent page scan', async () => {
      const recentPages = Array.from({ length: 3 }, (_, index) => ({
        _id: `recent-${index}`,
        title: `Recent Page ${index}`,
        plainText: 'Recently updated but not relevant.'
      }));
      const mentionedPages = [{
        _id: 'page-opp',
        title: 'Opportunity Cost',
        pageType: 'concept',
        plainText: 'Opportunity cost is the hidden next best alternative.'
      }];
      const queryChain = (rows) => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            select: jest.fn(() => ({
              lean: jest.fn().mockResolvedValue(rows)
            }))
          }))
        })),
        limit: jest.fn(() => ({
          select: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue(rows)
          }))
        }))
      });
      const find = jest.fn()
        .mockReturnValueOnce(queryChain(recentPages))
        .mockReturnValueOnce(queryChain(mentionedPages));

      const corpus = await loadWikiAskCorpus({
        page: { _id: 'page-loss', title: 'Loss Aversion' },
        question: 'How does Loss Aversion connect to Opportunity Cost?',
        userId: 'user-1',
        WikiPage: { find },
        TagMeta: null,
        findWikiBacklinks: null,
        pageScanLimit: 3,
        candidateLimit: 8
      });

      expect(find).toHaveBeenCalledTimes(2);
      expect(corpus.relatedPages.map(page => page.title)).toContain('Opportunity Cost');
    });

    it('loads revision rows for temporal questions on selected and mentioned pages', async () => {
      const recentPages = [{
        _id: 'page-opp',
        title: 'Opportunity Cost',
        pageType: 'concept',
        plainText: 'Opportunity cost is the hidden next best alternative.'
      }];
      const queryChain = (rows) => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            select: jest.fn(() => ({
              lean: jest.fn().mockResolvedValue(rows)
            }))
          }))
        })),
        limit: jest.fn(() => ({
          select: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue(rows)
          }))
        }))
      });
      const findPages = jest.fn()
        .mockReturnValueOnce(queryChain(recentPages))
        .mockReturnValueOnce(queryChain([]));
      const findRevisions = jest.fn(() => queryChain([{
        _id: 'rev-1',
        pageId: 'page-loss',
        summary: 'Added hidden-cost comparison.',
        before: {},
        after: { title: 'Loss Aversion' },
        createdAt: '2026-06-28T10:00:00.000Z'
      }]));

      const corpus = await loadWikiAskCorpus({
        page: { _id: 'page-loss', title: 'Loss Aversion' },
        question: 'What changed in my thinking about Opportunity Cost?',
        userId: 'user-1',
        WikiPage: { find: findPages },
        WikiRevision: { find: findRevisions },
        TagMeta: null,
        findWikiBacklinks: null,
        pageScanLimit: 3,
        candidateLimit: 8
      });

      expect(findRevisions).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        pageId: { $in: expect.arrayContaining(['page-loss', 'page-opp']) }
      }));
      expect(corpus.revisionRows).toHaveLength(1);
    });

    it('excludes malformed low-quality pages from related page retrieval', async () => {
      const recentPages = [
        {
          _id: 'page-good-machine',
          title: 'Complementary Machines and Human Capability',
          plainText: 'Machine assistance can extend human judgment when citations and review stay visible.'
        },
        {
          _id: 'page-junk-machine',
          title: 'Complementary Machine Thing',
          plainText: 'Machine assistance can extend human judgment when citations and review stay visible.'
        }
      ];
      const queryChain = (rows) => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            select: jest.fn(() => ({
              lean: jest.fn().mockResolvedValue(rows)
            }))
          }))
        })),
        limit: jest.fn(() => ({
          select: jest.fn(() => ({
            lean: jest.fn().mockResolvedValue(rows)
          }))
        }))
      });
      const find = jest.fn()
        .mockReturnValueOnce(queryChain(recentPages))
        .mockReturnValueOnce(queryChain([]));

      const corpus = await loadWikiAskCorpus({
        page: { _id: 'page-investing', title: 'Investing', plainText: 'Investing requires evidence and judgment.' },
        question: 'How does investing connect to machine assistance?',
        userId: 'user-1',
        WikiPage: { find },
        TagMeta: null,
        findWikiBacklinks: null,
        pageScanLimit: 10,
        candidateLimit: 8
      });

      expect(corpus.relatedPages.map(page => page.title)).toContain('Complementary Machines and Human Capability');
      expect(corpus.relatedPages.map(page => page.title)).not.toContain('Complementary Machine Thing');
    });

    it('summarizes graph-expanded provenance by object type for the UI', () => {
      const page = { _id: 'page-loss', title: 'Loss Aversion' };
      const provenance = provenanceFromContext({
        page,
        sources: [{ index: 1, type: 'highlight' }, { index: 2, type: 'highlight' }, { index: 3, type: 'article' }],
        relatedPageContexts: [{ id: 'page-opp', title: 'Opportunity Cost', pageType: 'concept' }],
        highlightContexts: [{ id: 'hl-2', title: 'Thaler', snippet: 'Hidden costs feel weaker.' }],
        conceptContexts: [{ id: 'concept-1', name: 'Opportunity Cost', description: 'Hidden alternative cost.' }],
        bridgeInsight: 'Loss aversion makes visible losses feel stronger than hidden opportunity costs.'
      });
      expect(provenance.mode).toBe('graph_expanded');
      expect(provenance.summary).toBe('Used 2 wiki pages · 3 highlights · 1 concept · 1 source');
      expect(provenance.bridgeInsight).toMatch(/visible losses/);
      expect(provenance.wikiPages.map(pageRef => pageRef.title)).toEqual(['Loss Aversion', 'Opportunity Cost']);
    });

    it('builds an evidence-based bridge fallback across related pages', () => {
      const out = buildGraphFallbackAnswer({
        page: {
          title: 'Loss Aversion',
          body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Losses feel larger than equivalent gains.' }] }] }
        },
        sources: [],
        relatedPageContexts: [{
          title: 'Opportunity Cost',
          plainText: 'Opportunity cost is the hidden cost of the next best alternative.'
        }],
        question: 'How does Loss Aversion connect to Opportunity Cost?'
      });
      expect(out.bridgeInsight).toMatch(/Loss Aversion and Opportunity Cost connect because/);
      expect(out.paragraphs[0].text).toMatch(/Opportunity Cost/);
    });
  });

  describe('askWikiPage (orchestration)', () => {
    it('returns the empty-question failure status when question is blank', async () => {
      const out = await askWikiPage({
        page: buildPage(),
        question: '   ',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => true }
      });
      expect(out.status).toBe('failed');
      expect(out.errorMessage).toBe('Question is empty.');
    });

    it('uses the deterministic fallback when the HF client is not configured', async () => {
      const out = await askWikiPage({
        page: buildPage(),
        question: 'How does compounding work?',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => false }
      });
      expect(out.status).toBe('answered');
      expect(out.model).toBe('stub');
      expect(out.answer.type).toBe('doc');
      expect(out.citationIndexesUsed).toEqual([2]);
      const marks = findClaimMarks(out.answer);
      expect(marks.length).toBeGreaterThan(0);
    });

    it('answers temporal questions from revision history before falling back to generic source-change prose', async () => {
      const chatComplete = jest.fn();
      const out = await askWikiPage({
        page: buildPage({
          _id: 'page-loss',
          title: 'Loss Aversion',
          sourceRefs: [{ _id: 'src-1', type: 'article', title: 'New study', snippet: 'Recent evidence changed the page.' }]
        }),
        revisionRows: [{
          _id: 'rev-1',
          pageId: 'page-loss',
          reason: 'agent_maintenance',
          summary: 'Added a source-backed comparison to opportunity cost.',
          before: { title: 'Loss Aversion', sourceRefs: [], claims: [] },
          after: {
            title: 'Loss Aversion',
            sourceRefs: [{ _id: 'src-1' }],
            claims: [{ text: 'Visible losses can overpower hidden opportunity costs.' }]
          },
          createdAt: '2026-06-28T10:00:00.000Z'
        }],
        question: 'What changed after the new source?',
        aiClient: { chatComplete, isTextGenerationConfigured: () => true }
      });
      expect(chatComplete).not.toHaveBeenCalled();
      expect(out.model).toBe('deterministic');
      expect(out.provenance.temporalChangeCount).toBe(1);
      const marks = findClaimMarks(out.answer);
      expect(marks[0].text).toMatch(/2026-06-28/);
      expect(marks[0].text).toMatch(/opportunity cost/);
    });

    it('answers contradiction questions from conflicted claim context', async () => {
      const out = await askWikiPage({
        page: buildPage({
          _id: 'page-loss',
          title: 'Loss Aversion',
          sourceRefs: [{ _id: 'src-counter', type: 'article', title: 'Replication limits', snippet: 'Context changes the effect.' }],
          claims: [{
            _id: 'claim-1',
            text: 'Loss aversion is stable in every decision context.',
            support: 'conflicted',
            contradictedByCitationIds: ['src-counter']
          }]
        }),
        question: 'Where does this contradict the evidence?',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => false }
      });
      expect(out.model).toBe('deterministic');
      expect(out.provenance.contradictionCount).toBe(1);
      const marks = findClaimMarks(out.answer);
      expect(marks[0].text).toMatch(/stable in every decision context/);
      expect(marks[0].text).toMatch(/Replication limits/);
    });

    it('expands page-first answers across named related wiki pages when the model is unavailable', async () => {
      const out = await askWikiPage({
        page: buildPage({
          _id: 'page-loss',
          title: 'Loss Aversion',
          body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loss aversion makes visible losses feel more urgent than equivalent gains.' }] }] }
        }),
        relatedPages: [
          { _id: 'page-opp', title: 'Opportunity Cost', pageType: 'concept', plainText: 'Opportunity cost is the hidden cost of the next best alternative.' }
        ],
        question: 'How does Loss Aversion connect to Opportunity Cost?',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => false }
      });
      expect(out.status).toBe('answered');
      expect(out.provenance.mode).toBe('graph_expanded');
      expect(out.provenance.summary).toContain('2 wiki pages');
      expect(out.provenance.bridgeInsight).toMatch(/Loss Aversion and Opportunity Cost connect because/);
      const marks = findClaimMarks(out.answer);
      expect(marks[0].text).toMatch(/Opportunity Cost/);
    });

    it('does not expand graph context for selected-page-only questions', async () => {
      const out = await askWikiPage({
        page: buildPage({
          _id: 'page-loss',
          title: 'Loss Aversion',
          body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loss aversion makes visible losses feel more urgent than equivalent gains.' }] }] }
        }),
        relatedPages: [
          { _id: 'page-opp', title: 'Opportunity Cost', pageType: 'concept', plainText: 'Opportunity cost is the hidden cost of the next best alternative.' }
        ],
        question: 'On this page only, what is the main claim?',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => false }
      });
      expect(out.provenance.mode).toBe('page_only');
      expect(out.provenance.summary).not.toContain('2 wiki pages');
    });

    it('does expand graph context when the user explicitly says not just this page', async () => {
      expect(isSelectedPageOnlyQuestion('Answer from the graph, not just this page.')).toBe(false);
      const out = await askWikiPage({
        page: buildPage({
          _id: 'page-loss',
          title: 'Loss Aversion',
          body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loss aversion makes visible losses feel more urgent than equivalent gains.' }] }] }
        }),
        relatedPages: [
          { _id: 'page-first', title: 'First Principles Thinking', pageType: 'topic', plainText: 'First principles thinking strips a decision down to the underlying causal facts.' }
        ],
        question: 'How does Loss Aversion connect to First Principles Thinking? Answer from the graph, not just this page.',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => false }
      });
      expect(out.provenance.mode).toBe('graph_expanded');
      expect(out.provenance.summary).toContain('2 wiki pages');
      const marks = findClaimMarks(out.answer);
      expect(marks[0].text).toMatch(/First Principles Thinking/);
    });

    it('answers summary prompts from the selected page even when related pages are available', async () => {
      const chatComplete = jest.fn();
      const out = await askWikiPage({
        page: {
          _id: 'page-investing',
          title: 'Investing',
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Investing allocates capital by weighing expected cash flows against price.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Risk Limits' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Risk limits keep concentration from becoming fragility.' }] }
            ]
          }
        },
        relatedPages: [
          { _id: 'page-opp', title: 'Opportunity Cost', pageType: 'concept', plainText: 'Opportunity cost is the hidden cost of the next best alternative.' }
        ],
        question: 'Summarize this page in one sentence.',
        aiClient: { chatComplete, isTextGenerationConfigured: () => true }
      });
      expect(chatComplete).not.toHaveBeenCalled();
      expect(out.model).toBe('deterministic');
      expect(out.provenance.mode).toBe('page_only');
      const marks = findClaimMarks(out.answer);
      expect(marks[0].text).toMatch(/weighing expected cash flows against price/);
      expect(marks[0].text).toMatch(/Risk Limits/);
      expect(marks[0].text).not.toMatch(/Opportunity cost/);
    });

    it('answers bullet overview prompts with section-specific bullets', async () => {
      const out = await askWikiPage({
        page: {
          _id: 'page-loss',
          title: 'Loss Aversion',
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Loss aversion makes losses feel larger than equivalent gains.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'The page distinguishes loss aversion from ordinary risk aversion.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Converging Evidence' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Behavioural studies repeatedly find stronger reactions to losses than gains.' }] },
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Diverging Evidence' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'The effect changes across contexts and individual subjects.' }] }
            ]
          }
        },
        question: 'Give me a 3-bullet overview.',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => true }
      });
      expect(out.model).toBe('deterministic');
      const marks = findClaimMarks(out.answer);
      expect(marks).toHaveLength(3);
      expect(marks.map(mark => mark.text).join('\n')).toContain('• Loss Aversion:');
      expect(marks.map(mark => mark.text).join('\n')).toContain('• Overview: The page distinguishes loss aversion from ordinary risk aversion.');
      expect(marks.map(mark => mark.text).join('\n')).toContain('• Converging Evidence: Behavioural studies repeatedly find stronger reactions to losses than gains.');
      expect(marks.map(mark => mark.text).join('\n')).not.toMatch(/Covers overview/);
    });

    it('uses multiple corpus objects for cross-page prompts with highlights and concepts', async () => {
      const graph = buildAskGraphContext({
        page: {
          _id: 'page-loss',
          title: 'Loss Aversion',
          plainText: 'Loss aversion makes visible losses feel more urgent than equivalent gains.',
          sourceRefs: [{ _id: 'hl-1', type: 'highlight', title: 'Kahneman', snippet: 'Losses loom larger than gains.' }]
        },
        relatedPages: [
          {
            _id: 'page-opp',
            title: 'Opportunity Cost',
            pageType: 'concept',
            plainText: 'Opportunity cost is the hidden cost of the next best alternative.',
            sourceRefs: [{ _id: 'hl-2', type: 'highlight', title: 'Thaler', snippet: 'Hidden opportunity costs feel weaker than visible losses.' }]
          }
        ],
        conceptRecords: [{ _id: 'concept-1', name: 'Opportunity Cost', description: 'The hidden cost of the next best alternative.' }],
        question: 'How does Loss Aversion connect to Opportunity Cost?'
      });
      expect(graph.relatedPageContexts).toHaveLength(1);
      expect(graph.highlightContexts.length).toBeGreaterThanOrEqual(2);
      expect(graph.conceptContexts).toHaveLength(1);

      const out = await askWikiPage({
        page: {
          _id: 'page-loss',
          title: 'Loss Aversion',
          body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Loss aversion makes visible losses feel more urgent than equivalent gains.' }] }] },
          sourceRefs: [{ _id: 'hl-1', type: 'highlight', title: 'Kahneman', snippet: 'Losses loom larger than gains.' }]
        },
        relatedPages: [
          {
            _id: 'page-opp',
            title: 'Opportunity Cost',
            pageType: 'concept',
            plainText: 'Opportunity cost is the hidden cost of the next best alternative.',
            sourceRefs: [{ _id: 'hl-2', type: 'highlight', title: 'Thaler', snippet: 'Hidden opportunity costs feel weaker than visible losses.' }]
          }
        ],
        conceptRecords: [{ _id: 'concept-1', name: 'Opportunity Cost', description: 'The hidden cost of the next best alternative.' }],
        question: 'How does Loss Aversion connect to Opportunity Cost?',
        aiClient: { chatComplete: jest.fn(), isTextGenerationConfigured: () => false }
      });
      expect(out.provenance.mode).toBe('graph_expanded');
      expect(out.provenance.summary).toMatch(/2 wiki pages/);
      expect(out.provenance.summary).toMatch(/highlight/);
      expect(out.provenance.summary).toMatch(/concept/);
    });

    it('parses a JSON answer from the chat client and emits claim marks', async () => {
      const chatComplete = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          paragraphs: [
            { text: 'Compounding rewards holding.', citationIndexes: [1] },
            { text: 'But disruption can shorten the runway.', citationIndexes: [2] }
          ],
          citationIndexesUsed: [1, 2]
        }),
        model: 'gpt-test'
      });
      const out = await askWikiPage({
        page: buildPage(),
        question: 'Strengths and risks?',
        aiClient: { chatComplete, isTextGenerationConfigured: () => true }
      });
      expect(chatComplete).toHaveBeenCalledTimes(1);
      expect(out.status).toBe('answered');
      expect(out.model).toBe('gpt-test');
      expect(out.citationIndexesUsed).toEqual([1, 2]);
      const marks = findClaimMarks(out.answer);
      expect(marks).toHaveLength(2);
      expect(marks[0].attrs.support).toBe('partial');
      expect(marks[0].attrs.citationIndexes).toEqual([1]);
    });

    it('answers exact quote requests with one verbatim page sentence before model paraphrase can leak in', async () => {
      const page = buildPage({
        title: 'Mr. Market',
        body: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: [
                'Investors should distinguish price from value.',
                'The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.',
                'That discipline matters most when markets are loud.'
              ].join(' ')
            }]
          }]
        }
      });
      const chatComplete = jest.fn().mockResolvedValue({
        text: JSON.stringify({
          paragraphs: [
            { text: 'Mr. Market is about sentiment swings and patient investing.', citationIndexes: [] }
          ],
          citationIndexesUsed: []
        }),
        model: 'gpt-test'
      });
      const out = await askWikiPage({
        page,
        question: 'Quote the exact sentence about Mr. Market from this page.',
        aiClient: { chatComplete, isTextGenerationConfigured: () => true }
      });
      const marks = findClaimMarks(out.answer);
      expect(chatComplete).not.toHaveBeenCalled();
      expect(marks).toHaveLength(1);
      expect(marks[0].text).toBe('The Mr. Market metaphor says prices swing between pessimism and optimism, creating opportunities for patient investors.');
      expect(out.citationIndexesUsed).toEqual([]);
    });

    it('falls back gracefully when the chat client throws', async () => {
      const chatComplete = jest.fn().mockRejectedValue(new Error('HF timeout'));
      const out = await askWikiPage({
        page: buildPage(),
        question: 'why?',
        aiClient: { chatComplete, isTextGenerationConfigured: () => true }
      });
      expect(out.status).toBe('failed');
      expect(out.errorMessage).toBe('HF timeout');
      expect(out.model).toBe('fallback');
      expect(out.answer.type).toBe('doc');
    });
  });
});
