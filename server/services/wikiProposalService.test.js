const assert = require('assert');
const {
  buildArchiveSignals,
  buildProposalCandidates,
  createDraftPageFromProposal,
  normalizeKey
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
    const existingPages = [
      { _id: 'page-1', title: 'Personal Agents', plainText: 'Agents can adapt to users over time.' },
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
    assert.strictEqual(page.pageType, 'synthesis');
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
