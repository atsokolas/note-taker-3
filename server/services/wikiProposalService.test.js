const assert = require('assert');
const {
  buildArchiveSignals,
  buildProposalCandidates,
  createDraftPageFromProposal,
  activeProposalsNeedClusteringRefresh,
  autoMergeProposalCandidates,
  normalizeKey,
  retireStaleActiveProposals,
  shapeWikiProposalCandidates
} = require('./wikiProposalService');

const run = async () => {
  assert.strictEqual(normalizeKey('AI Tutors & Motivation'), 'tutors motivation');

  {
    const signals = buildArchiveSignals({
      articles: [
        {
          _id: 'article-1',
          title: 'AI tutors and motivation',
          content: 'AI tutors may improve motivation through feedback loops.',
          highlights: [
            { _id: 'h1', text: 'AI tutors change student motivation.', note: 'Motivation is the core issue.', tags: ['AI tutors'] }
          ]
        },
        {
          _id: 'article-2',
          title: 'Motivation in adaptive learning',
          content: 'Adaptive learning systems personalize practice.',
          highlights: [
            { _id: 'h2', text: 'Adaptive tutors can increase motivation.', note: '', tags: ['adaptive learning'] }
          ]
        }
      ],
      notebooks: [
        { _id: 'note-1', title: 'Tutor notes', content: 'AI tutors and motivation keep recurring.' }
      ],
      concepts: [],
      pages: [],
      questions: []
    });

    const proposals = buildProposalCandidates({ signals, existingPages: [] });
    assert.ok(proposals.some(item => item.proposalType === 'repeated_theme'));
    assert.ok(proposals[0].sourceRefs.length >= 2);
  }

  {
    const signals = buildArchiveSignals({
      articles: [
        {
          _id: 'article-1',
          title: '<p>Berkshire Hathaway</p>',
          content: '<p>Owner earnings matter for Berkshire Hathaway investors.</p>',
          highlights: [
            {
              _id: 'h1',
              text: '<p>Name: To the Shareholders of Berkshire Hathaway Inc</p><p>Owner earnings should be calculated carefully.</p>',
              tags: ['Berkshire Hathaway']
            }
          ]
        },
        {
          _id: 'article-2',
          title: '<p>Berkshire Hathaway letters</p>',
          content: '<p>Berkshire Hathaway annual letters return to owner earnings.</p>',
          highlights: [
            {
              _id: 'h2',
              text: '<p>Owner earnings are a recurring investing lens.</p>',
              tags: ['Berkshire Hathaway']
            }
          ]
        }
      ],
      notebooks: [
        { _id: 'note-1', title: '<p>Berkshire Hathaway notes</p>', content: '<p>Owner earnings and Berkshire Hathaway.</p>' }
      ],
      concepts: [],
      pages: [],
      questions: []
    });
    const proposals = buildProposalCandidates({ signals, existingPages: [] });
    const serialized = JSON.stringify(proposals);
    assert.ok(proposals.length > 0);
    assert.ok(!serialized.includes('<p>'));
    assert.ok(serialized.includes('Berkshire Hathaway'));
  }

  {
    const letters = [1992, 1993, 1994, 1995, 1996, 1997].map((year, index) => ({
      _id: `berkshire-${year}`,
      title: 'Name: To the Shareholders of Berkshire Hathaway Inc.: by berkshirehathaway.com',
      url: `https://www.berkshirehathaway.com/letters/${year}.html`,
      content: `Berkshire Hathaway owner earnings and capital allocation letter ${year}.`,
      highlights: [{
        _id: `berkshire-highlight-${index}`,
        text: `Name: To the Shareholders of Berkshire Hathaway Inc. Owner earnings and Berkshire Hathaway investing lessons from ${year}.`,
        tags: ['Berkshire Hathaway']
      }]
    }));
    const proposals = buildProposalCandidates({
      signals: buildArchiveSignals({ articles: letters }),
      existingPages: []
    });
    const visible = proposals.filter(item => item.status === 'pending');
    assert.deepStrictEqual(visible.map(item => item.title), ['Berkshire Hathaway']);
    assert.strictEqual(visible[0].sourceRefs.length, 6);
    assert.strictEqual(proposals.some(item => item.title === 'Owner Earning' && item.status === 'pending'), false);
  }

  {
    const letters = [1992, 1993, 1994].map((year, index) => ({
      _id: `berkshire-existing-${year}`,
      title: 'To the Shareholders of Berkshire Hathaway Inc.',
      url: `https://www.berkshirehathaway.com/letters/${year}.html`,
      highlights: [{
        _id: `berkshire-existing-highlight-${index}`,
        text: 'Berkshire Hathaway shareholder letters repeat owner earnings themes.',
        tags: ['Berkshire Hathaway']
      }]
    }));
    const proposals = buildProposalCandidates({
      signals: buildArchiveSignals({ articles: letters }),
      existingPages: [{ _id: 'page-berkshire', title: 'Berkshire Hathaway', plainText: 'Existing page.' }]
    });
    assert.strictEqual(proposals.some(item => /berkshire/i.test(item.title) && item.status === 'pending'), false);
    assert.ok(proposals.some(item => /berkshire/i.test(item.title) && item.status === 'merged'));
  }

  {
    const proposals = buildProposalCandidates({
      signals: [
        {
          type: 'highlight',
          key: 'complementary machine thing',
          label: 'Complementary Machine Thing',
          title: 'Complementary Machine Thing',
          snippet: 'Complementary machine thing appears in a rough source cluster.',
          sourceType: 'article',
          sourceObjectId: 'article-bad-1',
          sourceFamily: 'article:bad-1',
          weight: 1
        },
        {
          type: 'highlight',
          key: 'complementary machine thing',
          label: 'Complementary Machine Thing',
          title: 'Complementary Machine Thing',
          snippet: 'Another source repeats the malformed cluster label.',
          sourceType: 'article',
          sourceObjectId: 'article-bad-2',
          sourceFamily: 'article:bad-2',
          weight: 1
        },
        {
          type: 'note',
          key: 'complementary machine thing',
          label: 'Complementary Machine Thing',
          title: 'Complementary Machine Thing',
          snippet: 'A third signal should not promote a known malformed title.',
          sourceType: 'notebook',
          sourceObjectId: 'note-bad-3',
          sourceFamily: 'notebook:bad-3',
          weight: 1
        }
      ],
      existingPages: []
    });
    assert.strictEqual(proposals.some(item => item.title === 'Complementary Machine Thing' && item.status === 'pending'), false);
    assert.ok(proposals.some(item => item.title === 'Complementary Machine Thing' && item.status === 'dismissed'));
  }

  {
    const existingPages = [
      { _id: 'page-1', title: 'Personal Agents', plainText: 'Adaptive learning agents can adapt to users over time.' },
      { _id: 'page-2', title: 'Education Software', plainText: 'Learning interfaces need adaptive feedback.' }
    ];
    const signals = buildArchiveSignals({
      articles: [
        {
          _id: 'article-1',
          title: 'Adaptive learning interfaces',
          content: 'Adaptive learning interfaces connect agents and education software.',
          highlights: [{ _id: 'h1', text: 'Adaptive learning interfaces connect personal agents to education.', tags: [] }]
        }
      ],
      notebooks: [],
      concepts: [{ _id: 'concept-1', name: 'Adaptive Learning' }],
      pages: existingPages,
      questions: []
    });

    const proposals = buildProposalCandidates({ signals, existingPages });
    assert.ok(proposals.some(item => item.proposalType === 'bridge_idea'));
  }

  {
    const docs = [
      {
        userId: 'user-1',
        status: 'pending',
        title: 'Hathaway Inc Berkshirehathaway',
        clusterKey: 'theme:hathaway inc berkshirehathaway',
        saveCalls: 0,
        async save() {
          this.saveCalls += 1;
          return this;
        }
      },
      {
        userId: 'user-1',
        status: 'pending',
        title: 'Berkshire Hathaway',
        clusterKey: 'theme:berkshire hathaway',
        saveCalls: 0,
        async save() {
          this.saveCalls += 1;
          return this;
        }
      },
      {
        userId: 'user-1',
        status: 'pending',
        title: 'AI Tutors and Motivation',
        clusterKey: 'theme:tutors motivation',
        saveCalls: 0,
        async save() {
          this.saveCalls += 1;
          return this;
        }
      }
    ];
    const WikiProposal = {
      find: async () => docs
    };
    const retired = await retireStaleActiveProposals({
      WikiProposal,
      userId: 'user-1',
      candidates: [{ title: 'Berkshire Hathaway', clusterKey: 'theme:berkshire hathaway' }]
    });
    assert.strictEqual(retired, 1);
    assert.strictEqual(docs[0].status, 'dismissed');
    assert.strictEqual(docs[1].status, 'pending');
    assert.strictEqual(docs[2].status, 'pending');
  }

  {
    assert.strictEqual(activeProposalsNeedClusteringRefresh([
      { status: 'pending', title: 'Inc Berkshirehathaway', clusterKey: 'theme:inc berkshirehathaway' },
      { status: 'pending', title: 'Hathaway Inc Berkshirehathaway', clusterKey: 'theme:hathaway inc berkshirehathaway' }
    ]), true);
    assert.strictEqual(activeProposalsNeedClusteringRefresh([
      { status: 'pending', title: 'AI Tutors and Motivation', clusterKey: 'theme:tutors motivation' },
      { status: 'pending', title: 'Long-Term Writing Habits', clusterKey: 'theme:long term writing habits' }
    ]), false);
  }

  {
    const page = {
      _id: 'page-berkshire',
      userId: 'user-1',
      title: 'Berkshire Hathaway',
      sourceRefs: [],
      saveCalls: 0,
      async save() {
        this.saveCalls += 1;
        return this;
      }
    };
    const WikiPage = {
      findOne: async () => page
    };
    const result = await autoMergeProposalCandidates({
      WikiPage,
      userId: 'user-1',
      candidates: [{
        title: 'Berkshire Hathaway',
        sourceRefs: [
          { type: 'article', objectId: 'article-1', title: 'Berkshire letter', snippet: 'Owner earnings.', url: 'https://www.berkshirehathaway.com/letters/1992.html' }
        ],
        proposalDecision: {
          action: 'merge_into_existing',
          mergeTarget: { pageId: 'page-berkshire', title: 'Berkshire Hathaway', score: 1 }
        }
      }]
    });
    assert.strictEqual(result.merged, 1);
    assert.strictEqual(page.sourceRefs.length, 1);
    assert.strictEqual(page.freshness.status, 'needs_review');
    assert.strictEqual(page.saveCalls, 1);
  }

  {
    const proposals = buildProposalCandidates({
      signals: buildArchiveSignals({
        articles: [
          {
            _id: 'article-agent-1',
            title: 'AI tutors and motivation',
            url: 'https://learning.example.com/ai-tutors',
            highlights: [{ _id: 'agent-h1', text: 'AI tutors may improve motivation through adaptive feedback.' }]
          },
          {
            _id: 'article-agent-2',
            title: 'Motivation in adaptive learning',
            url: 'https://education.example.org/motivation',
            highlights: [{ _id: 'agent-h2', text: 'Adaptive tutors can improve motivation and practice consistency.' }]
          }
        ]
      }),
      existingPages: []
    });
    const shaped = await shapeWikiProposalCandidates({
      candidates: proposals,
      existingPages: [],
      isConfigured: () => true,
      chat: async (request) => {
        assert.strictEqual(request.route, 'critique');
        assert.deepStrictEqual(request.responseFormat, { type: 'json_object' });
        return {
          model: 'stub',
          text: JSON.stringify({
            action: 'reject',
            canonicalTitle: 'Tutor Motivation',
            qualityScore: 0.2,
            rationale: 'This is a claim fragment, not a page.',
            rejectionReason: 'Too narrow.'
          })
        };
      }
    });
    assert.strictEqual(shaped[0].status, 'dismissed');
    assert.strictEqual(shaped[0].proposalDecision.shapedBy, 'agent');
    assert.strictEqual(shaped[0].dismissedReason, 'Too narrow.');
    assert.strictEqual(shaped[0].generation.source, 'ai_shaped');
  }

  {
    const dismissed = {
      title: 'Owner Earning',
      slugCandidate: 'owner-earning',
      clusterKey: 'theme:owner earning',
      status: 'dismissed',
      confidence: 0.65,
      sourceRefs: [],
      proposalDecision: {
        action: 'reject',
        qualityScore: 0.65,
        canonicalTitle: 'Owner Earning',
        rationale: 'Signal is a claim cluster.',
        sourceDiversity: { distinctSources: 2, distinctHosts: 1 },
        mergeTarget: null,
        rejectionReason: 'Signal is a claim cluster.'
      }
    };
    const shaped = await shapeWikiProposalCandidates({
      candidates: [dismissed],
      existingPages: [],
      isConfigured: () => true,
      chat: async () => ({
        text: JSON.stringify({
          action: 'create_page',
          canonicalTitle: dismissed.title,
          qualityScore: 0.99,
          rationale: 'Create it anyway.'
        })
      })
    });
    assert.strictEqual(shaped[0].status, 'dismissed');
    assert.notStrictEqual(shaped[0].proposalDecision?.shapedBy, 'agent');
  }

  {
    const proposals = buildProposalCandidates({
      signals: buildArchiveSignals({
        articles: [
          {
            _id: 'article-agent-fallback-1',
            title: 'Long-term writing habits',
            url: 'https://writing.example.com/habits',
            highlights: [{ _id: 'fallback-h1', text: 'Writing habits compound when notes are reviewed weekly.' }]
          },
          {
            _id: 'article-agent-fallback-2',
            title: 'Writing systems',
            url: 'https://writing.example.com/systems',
            highlights: [{ _id: 'fallback-h2', text: 'Long-term writing habits depend on repeated capture and review.' }]
          }
        ]
      }),
      existingPages: []
    });
    const shaped = await shapeWikiProposalCandidates({
      candidates: proposals,
      existingPages: [],
      isConfigured: () => true,
      chat: async () => ({ text: 'not json' })
    });
    assert.deepStrictEqual(shaped, proposals);
  }

  {
    const existingPages = [{ _id: 'page-1', title: 'AI Tutors', plainText: 'Existing page.' }];
    const signals = buildArchiveSignals({
      articles: [
        { _id: 'article-1', title: 'AI Tutors', content: 'AI Tutors', highlights: [{ _id: 'h1', text: 'AI Tutors', tags: [] }] }
      ],
      notebooks: [{ _id: 'note-1', title: 'AI Tutors', content: 'AI Tutors' }],
      concepts: [],
      pages: existingPages,
      questions: []
    });
    const proposals = buildProposalCandidates({ signals, existingPages });
    assert.strictEqual(proposals.find(item => item.slugCandidate === 'tutors'), undefined);
  }

  {
    const savedPages = [];
    const WikiPage = function WikiPage(payload) {
      Object.assign(this, payload);
      this._id = 'created-page';
      this.save = async () => {
        savedPages.push(this);
        return this;
      };
    };
    const proposal = {
      _id: 'proposal-1',
      userId: 'user-1',
      proposalType: 'bridge_idea',
      title: 'AI Tutors and Motivation',
      thesis: 'Your archive suggests motivation is the central question for AI tutors.',
      whyNow: 'Found across 3 sources.',
      sourceRefs: [{ type: 'article', objectId: 'article-1', title: 'AI tutors' }],
      connectedPageRefs: [{ type: 'wiki_page', objectId: 'page-1', title: 'Personal Agents' }],
      connectedConceptRefs: [{ type: 'concept', objectId: 'concept-1', title: 'Education Software' }],
      starterClaims: ['AI tutors may improve motivation through adaptive feedback.'],
      openQuestions: ['Does motivation translate to learning outcomes?'],
      saveCalls: 0,
      save: async function save() {
        this.saveCalls += 1;
        return this;
      }
    };

    const page = await createDraftPageFromProposal({
      proposal,
      WikiPage,
      buildUniqueSlug: async () => 'ai-tutors-and-motivation'
    });

    assert.strictEqual(page.title, 'AI Tutors and Motivation');
    assert.strictEqual(page.status, 'draft');
    assert.strictEqual(page.pageType, 'overview');
    assert.strictEqual(page.createdFrom.type, 'sources');
    assert.strictEqual(page.aiState.draftStatus, 'maintaining');
    assert.ok(page.plainText.includes('Current Understanding'));
    assert.ok(page.plainText.includes('Open Questions'));
    assert.strictEqual(page.sourceRefs.length, 3);
    assert.strictEqual(proposal.status, 'accepted');
    assert.strictEqual(proposal.createdPageId, 'created-page');
    assert.strictEqual(proposal.saveCalls, 1);
    assert.strictEqual(savedPages.length, 1);
  }
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
