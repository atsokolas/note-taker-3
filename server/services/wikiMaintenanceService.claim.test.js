const { __testables } = require('./wikiMaintenanceService');

const {
  attachClaimCitationIds,
  buildSectionMaintenancePlan,
  buildPrompt,
  collectClaimsFromDoc,
  deriveClaimsFromDoc,
  docFromArticle,
  evaluateWikiArticleQuality,
  inferMaintainedPageType,
  normalizeSourceIndexesUsed,
  formatKnownWikiPages,
  resolveClaimCitationIds
} = __testables;

const findClaimMarks = (doc) => {
  const marks = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks
        .filter(mark => mark?.type === 'claim')
        .forEach(mark => marks.push({ text: node.text, attrs: mark.attrs }));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return marks;
};

const headings = (doc) => {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (node.type === 'heading') {
      out.push((node.content || []).map(child => child.text || '').join(''));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return out;
};

const findWikiLinkMarks = (doc) => {
  const marks = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks
        .filter(mark => mark?.type === 'wikiLink')
        .forEach(mark => marks.push({ text: node.text, attrs: mark.attrs }));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return marks;
};

const fakeFindModel = (records = []) => ({
  find: () => ({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(records)
      })
    })
  })
});

describe('wikiMaintenanceService — claim marks in docFromArticle', () => {
  it('appends the wiki schema conventions to maintenance prompts', () => {
    const prompt = buildPrompt({
      page: { title: 'AI Memory', pageType: 'topic', body: {}, sourceRefs: [] },
      candidates: [],
      wikiSchemaContent: '## Ingest workflow\n- Update related pages first.',
      knownWikiPages: [{ _id: 'page-related', title: 'Compounding Interest', pageType: 'concept' }]
    });
    expect(prompt).toContain('User wiki schema conventions');
    expect(prompt).toContain('Update related pages first.');
    expect(prompt).toContain('mention existing related wiki pages by their exact titles');
    expect(prompt).toContain('Compounding Interest');
  });

  it('formats known pages for prompt-time wiki references', () => {
    expect(formatKnownWikiPages([
      { id: 'page-1', title: 'Cash Flow Valuation', pageType: 'concept', summary: 'Valuing assets from owner cash flows.' }
    ])).toContain('Cash Flow Valuation (concept) — Valuing assets from owner cash flows.');
  });

  it('wraps article summary text in a claim mark with citation indexes', () => {
    const doc = docFromArticle({
      title: 'Compounding interest',
      article: {
        summary: { text: 'Compounders need patience.', citationIndexes: [1, 2] },
        sections: []
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks).toHaveLength(1);
    expect(marks[0].text).toBe('Compounders need patience.');
    expect(marks[0].attrs.citationIndexes).toEqual([1, 2]);
    expect(marks[0].attrs.support).toBe('supported');
    expect(marks[0].attrs.claimId).toMatch(/^claim-/);
  });

  it('infers "partial" support when only one citation is attached', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A claim with one source.', citationIndexes: [1] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs.support).toBe('partial');
  });

  it('infers "unsupported" when no citations are attached', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A bare claim.', citationIndexes: [] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs.support).toBe('unsupported');
  });

  it('emits claim marks for each section paragraph', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              { text: 'First claim.', citationIndexes: [1] },
              { text: 'Second claim.', citationIndexes: [2, 3] }
            ]
          }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks).toHaveLength(2);
    expect(marks[0].text).toBe('First claim.');
    expect(marks[0].attrs.support).toBe('partial');
    expect(marks[1].text).toBe('Second claim.');
    expect(marks[1].attrs.support).toBe('supported');
  });

  it('emits claim marks for bullet items with their own citation indexes', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        sections: [
          {
            heading: 'Signals',
            paragraphs: [],
            bullets: [
              { text: 'A bullet point.', citationIndexes: [1] }
            ]
          }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks.find(m => m.text === 'A bullet point.')?.attrs.citationIndexes).toEqual([1]);
  });

  it('emits contradiction indexes on conflicted claim marks without putting them in prose', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: {
          text: 'A claim with mixed evidence.',
          citationIndexes: [1],
          contradictionIndexes: [2],
          support: 'conflicted'
        }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs).toMatchObject({
      citationIndexes: [1],
      contradictionIndexes: [2],
      support: 'conflicted'
    });
    expect(marks[0].text).not.toMatch(/\[2\]/);
  });

  it('does not append the legacy "[1, 2]" suffix into the claim text', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Clean claim text.', citationIndexes: [1, 2] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].text).not.toMatch(/\[/);
  });

  it('gives each emitted claim a unique claimId', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A.', citationIndexes: [1] },
        sections: [
          { heading: 'Section', paragraphs: [{ text: 'B.', citationIndexes: [1] }] }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    const ids = marks.map(m => m.attrs.claimId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills canonical question sections before rendering', () => {
    const { alignArticleToPageStructure } = require('./wikiPageStructureService');
    const article = alignArticleToPageStructure({
      pageType: 'question',
      article: {
        summary: { text: 'Short answer text.', citationIndexes: [1] },
        sections: [{ heading: 'Evidence', paragraphs: [{ text: 'Evidence text.', citationIndexes: [1] }] }]
      }
    });
    const doc = docFromArticle({ title: 'Why compound?', article });
    expect(headings(doc).slice(0, 5)).toEqual([
      'Short Answer',
      'Why It Matters',
      'Evidence',
      'What Would Change This',
      'Open Questions'
    ]);
  });

  it('extracts citation indexes from claim marks before persistence', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Claim with two sources.', citationIndexes: [1, 2] }
      }
    });
    const claims = collectClaimsFromDoc(doc);
    expect(claims[0].citationIndexes).toEqual([1, 2]);
  });

  it('extracts contradiction indexes from claim marks before persistence', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: {
          text: 'Claim with a counter-source.',
          citationIndexes: [1],
          contradictionIndexes: [2],
          support: 'conflicted'
        }
      }
    });
    const claims = collectClaimsFromDoc(doc);
    expect(claims[0].citationIndexes).toEqual([1]);
    expect(claims[0].contradictionIndexes).toEqual([2]);
    expect(claims[0].support).toBe('conflicted');
  });

  it('maps claim citation indexes to persisted citation ids', () => {
    const citationIds = resolveClaimCitationIds({
      citationIndexes: [2, 1, 2, 99],
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [
        { _id: 'source-a' },
        { _id: 'source-b' }
      ]
    });
    expect(citationIds).toEqual(['citation-b', 'citation-a']);
  });

  it('ignores invalid and out-of-range citation indexes', () => {
    const citationIds = resolveClaimCitationIds({
      citationIndexes: [0, -1, 'bad', 2, 9],
      citations: [{ _id: 'citation-a' }, { _id: 'citation-b' }],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }]
    });
    expect(citationIds).toEqual(['citation-b']);
  });

  it('attaches citation ids and removes transient citation indexes from claims', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A claim.',
        support: 'supported',
        citationIndexes: [1]
      }],
      citations: [{ _id: 'citation-a', sourceRefId: 'source-a' }],
      sourceRefs: [{ _id: 'source-a' }]
    });
    expect(claims[0].citationIds).toEqual(['citation-a']);
    expect(claims[0].sourceRefIds).toEqual(['source-a']);
    expect(claims[0].confidence).toBeGreaterThan(0.45);
    expect(claims[0].citationIndexes).toBeUndefined();
  });

  it('normalizes frontend contradicted support to backend conflicted support', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A disputed claim.',
        support: 'contradicted',
        citationIndexes: []
      }]
    });
    expect(claims[0].support).toBe('conflicted');
  });

  it('maps contradiction indexes separately from supporting citation ids', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A mixed evidence claim.',
        support: 'conflicted',
        citationIndexes: [1],
        contradictionIndexes: [2]
      }],
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }]
    });
    expect(claims[0].citationIds).toEqual(['citation-a']);
    expect(claims[0].sourceRefIds).toEqual(['source-a']);
    expect(claims[0].contradictedByCitationIds).toEqual(['citation-b']);
  });

  it('keeps legacy conflicted claims as contradictory when no contradiction indexes exist', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-legacy',
        text: 'Legacy conflicted claim.',
        support: 'conflicted',
        citationIndexes: [1]
      }],
      citations: [{ _id: 'citation-a', sourceRefId: 'source-a' }],
      sourceRefs: [{ _id: 'source-a' }]
    });
    expect(claims[0].contradictedByCitationIds).toEqual(['citation-a']);
  });

  it('derives ledger claims with confidence, verification time, and source refs', () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A well sourced claim.', citationIndexes: [1, 2] }
      }
    });
    const claims = deriveClaimsFromDoc({
      body: doc,
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }],
      now
    });

    expect(claims[0]).toMatchObject({
      text: 'A well sourced claim.',
      support: 'supported',
      citationIds: ['citation-a', 'citation-b'],
      sourceRefIds: ['source-a', 'source-b']
    });
    expect(claims[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(claims[0].lastReviewedAt).toEqual(now);
    expect(claims[0].lastVerifiedAt).toEqual(now);
    expect(claims[0].history[0].event).toBe('created');
  });

  it('derives mixed support and contradiction evidence into the claim ledger', () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: {
          text: 'A mixed evidence claim.',
          citationIndexes: [1],
          contradictionIndexes: [2],
          support: 'conflicted'
        }
      }
    });
    const claims = deriveClaimsFromDoc({
      body: doc,
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }],
      now
    });
    expect(claims[0]).toMatchObject({
      support: 'conflicted',
      citationIds: ['citation-a'],
      sourceRefIds: ['source-a'],
      contradictedByCitationIds: ['citation-b']
    });
  });

  it('counts contradiction-only sources as used source indexes', () => {
    const used = normalizeSourceIndexesUsed({
      rawIndexes: [],
      article: {
        summary: { text: 'Summary', citationIndexes: [], contradictionIndexes: [2] },
        sections: [{
          heading: 'Evidence',
          paragraphs: [{ text: 'Paragraph', citationIndexes: [1], contradictionIndexes: [3] }],
          bullets: []
        }]
      },
      candidates: [{ index: 1 }, { index: 2 }, { index: 3 }]
    });
    expect(used).toEqual([2, 1, 3]);
  });

  it('preserves claim history across regenerated claim ids by matching claim text', () => {
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    const now = new Date('2026-05-09T12:00:00.000Z');
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Durable claim text.', citationIndexes: [1, 2] }
      }
    });
    const previousClaims = [{
      claimId: 'old-claim-id',
      text: 'Durable claim text.',
      section: 'X',
      support: 'partial',
      citationIds: ['citation-a'],
      sourceRefIds: ['source-a'],
      confidence: 0.54,
      createdAt,
      history: [{
        at: createdAt,
        event: 'created',
        support: 'partial',
        text: 'Durable claim text.',
        section: 'X',
        citationIds: ['citation-a'],
        sourceRefIds: ['source-a'],
        summary: 'Original claim.'
      }]
    }];

    const claims = deriveClaimsFromDoc({
      body: doc,
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }],
      previousClaims,
      now
    });

    expect(claims[0].claimId).not.toBe('old-claim-id');
    expect(claims[0].createdAt).toEqual(createdAt);
    expect(claims[0].history.map(entry => entry.event)).toEqual(['created', 'updated']);
    expect(claims[0].history[1].support).toBe('supported');
  });

  it('builds section-level maintenance state from the claim ledger and health signals', () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const plan = buildSectionMaintenancePlan({
      now,
      claims: [
        { section: 'Core Idea', support: 'supported', confidence: 0.9, lastReviewedAt: now },
        { section: 'Core Idea', support: 'unsupported', confidence: 0.1, lastReviewedAt: now },
        { section: 'Evidence', support: 'conflicted', confidence: 0.3, lastReviewedAt: now }
      ],
      health: {
        missingCitations: [{ text: 'Needs a citation.', section: 'Core Idea' }],
        contradictions: [{ text: 'Source disagrees.', section: 'Evidence' }]
      },
      changeLog: [{ type: 'flagged_gap', target: 'Core Idea', summary: 'Marked a gap.' }]
    });

    expect(plan.updatedAt).toEqual(now);
    expect(plan.sections[0]).toMatchObject({
      section: 'Evidence',
      totalClaims: 1,
      conflictedClaims: 1
    });
    const core = plan.sections.find(section => section.section === 'Core Idea');
    expect(core).toMatchObject({
      totalClaims: 2,
      supportedClaims: 1,
      unsupportedClaims: 1,
      averageConfidence: 0.5
    });
    expect(core.actions.map(action => action.type)).toContain('missingCitations');
  });

  it('fails scaffold-like, thin articles so they can be rebuilt', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Investing' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'The page should explain investing.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Evidence still needs source-backed development.' }] }
      ]
    };

    const quality = evaluateWikiArticleQuality({
      page: { title: 'Investing' },
      body,
      claims: [
        { support: 'unsupported', citationIds: [] },
        { support: 'partial', citationIds: [] },
        { support: 'unsupported', citationIds: [] },
        { support: 'partial', citationIds: [] },
        { support: 'unsupported', citationIds: [] },
        { support: 'partial', citationIds: [] }
      ],
      sourceRefs: Array.from({ length: 8 }, (_, index) => ({ _id: `source-${index}` }))
    });

    expect(quality.ok).toBe(false);
    expect(quality.status).toBe('needs_rebuild');
    expect(quality.failures.join(' ')).toMatch(/scaffold|too thin|weak/i);
  });

  it('migrates broad legacy topic pages to overview during maintenance', () => {
    expect(inferMaintainedPageType({
      page: { pageType: 'topic', title: 'Investing - Concepts, Ideas, and Strategies' },
      candidates: Array.from({ length: 6 }, (_, index) => ({ index }))
    })).toBe('overview');
    expect(inferMaintainedPageType({
      page: { pageType: 'topic', title: 'Feedback Loops' },
      candidates: []
    })).toBe('concept');
    expect(inferMaintainedPageType({
      page: { pageType: 'topic', title: 'Imported memo', createdFrom: { type: 'article' } },
      candidates: []
    })).toBe('source');
  });

  it('resolves known page title occurrences into wikiLink marks after maintenance drafts the body', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investment Notes',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn().mockResolvedValue({
      model: 'test-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Investment Notes',
        article: {
          summary: {
            text: 'Compounding interest rewards patience over long horizons.',
            citationIndexes: [1]
          },
          sections: []
        },
        maintenance: {
          summary: 'Drafted page.',
          changelog: [],
          health: {}
        },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Evidence', content: 'Evidence about investing.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([
          { _id: 'page-main', title: 'Investment Notes', status: 'draft' },
          { _id: 'page-target', title: 'Compounding interest', status: 'draft' }
        ])
      }
    });

    const links = findWikiLinkMarks(page.body);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      text: 'Compounding interest',
      attrs: {
        pageId: 'page-target',
        title: 'Compounding interest'
      }
    });
  });

  it('resolves conservative near-title variants into wikiLink marks after maintenance drafts the body', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investment Notes',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn().mockResolvedValue({
      model: 'test-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Investment Notes',
        article: {
          summary: {
            text: 'Cash-flow valuations make growth assumptions explicit.',
            citationIndexes: [1]
          },
          sections: []
        },
        maintenance: {
          summary: 'Drafted page.',
          changelog: [],
          health: {}
        },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Evidence', content: 'Evidence about investing.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([
          { _id: 'page-main', title: 'Investment Notes', status: 'draft' },
          { _id: 'page-target', title: 'Cash Flow Valuation', status: 'draft' }
        ])
      }
    });

    const links = findWikiLinkMarks(page.body);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      text: 'Cash-flow valuations',
      attrs: {
        pageId: 'page-target',
        title: 'Cash Flow Valuation'
      }
    });
  });

  it('automatically rebuilds once when the first maintenance draft fails quality gates', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investment Process',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn()
      .mockResolvedValueOnce({
        model: 'test-model',
        provider: 'test-provider',
        text: JSON.stringify({
          title: 'Investment Process',
          article: {
            summary: {
              text: 'The page should explain investing process.',
              citationIndexes: [1]
            },
            sections: []
          },
          maintenance: { summary: 'Drafted weak page.', changelog: [], health: {} },
          sourceIndexesUsed: [1]
        })
      })
      .mockResolvedValueOnce({
        model: 'test-model',
        provider: 'test-provider',
        text: JSON.stringify({
          title: 'Investment Process',
          article: {
            summary: {
              text: 'Investment process matters because rules preserve judgment when markets make patience emotionally expensive.',
              citationIndexes: [1]
            },
            sections: [{
              heading: 'Core Idea',
              paragraphs: [{
                text: 'A useful process narrows attention to business quality, valuation discipline, and the conditions that would prove the thesis wrong.',
                citationIndexes: [1]
              }],
              bullets: []
            }]
          },
          maintenance: { summary: 'Rebuilt into a stronger page.', changelog: [], health: {} },
          sourceIndexesUsed: [1]
        })
      });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Process evidence', content: 'Rules preserve judgment when markets make patience emotionally expensive.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([])
      }
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(page.plainText).toContain('Investment process matters');
    expect(page.plainText).not.toContain('should explain');
    expect(page.aiState.quality.rebuiltAutomatically).toBe(true);
    expect(page.aiState.quality.previousFailures.join(' ')).toMatch(/scaffold/i);
  });
});
