const { askWikiPage, __testables } = require('./wikiAskService');

const {
  buildSourceList,
  buildSystemPrompt,
  normalizeAnswerSchema,
  buildFallbackAnswer,
  docFromAnswer,
  buildPageContext,
  truncateAtSentenceBoundary
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
      const out = buildFallbackAnswer({ page: buildPage(), sources, question: 'why?' });
      expect(out.citationIndexesUsed).toEqual([1, 2]);
      expect(out.paragraphs.length).toBeGreaterThanOrEqual(2);
    });

    it('returns no citation indexes when no sources are attached', () => {
      const out = buildFallbackAnswer({ page: { title: 'X', body: {} }, sources: [], question: 'why?' });
      expect(out.citationIndexesUsed).toEqual([]);
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
      expect(out.citationIndexesUsed).toEqual([1, 2]);
      const marks = findClaimMarks(out.answer);
      expect(marks.length).toBeGreaterThan(0);
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
