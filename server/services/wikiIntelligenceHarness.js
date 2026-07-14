const mongoose = require('mongoose');

const { chatComplete, isTextGenerationConfigured } = require('../ai/hfTextClient');
const { WikiPage } = require('../models');
const { maintainWikiPage, __testables } = require('./wikiMaintenanceService');
const { processWikiSourceEvent } = require('./wikiMaintenanceOrchestrator');
const {
  drainWikiSourceEventQueue,
  processPendingWikiSourceEvents: processPendingWikiSourceEventsFromWorker
} = require('./wikiSourceEventWorker');
const { createConnectorWikiSourceEvent } = require('./wikiSourceEventService');
const {
  buildArchiveSignals,
  buildProposalCandidates,
  createDraftPageFromProposal,
  shapeWikiProposalCandidates
} = require('./wikiProposalService');
const { buildWikiPageGraphRows } = require('./wikiGraphConnectionService');

const { toPlainText } = __testables;

const requiredHeadings = ['Core Idea', 'How It Works', 'Evidence', 'Tensions', 'Open Questions'];
const complementaryMachineUserId = new mongoose.Types.ObjectId();
const complementaryMachineSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const investingUserId = new mongoose.Types.ObjectId();
const investingSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const staleUpdateUserId = new mongoose.Types.ObjectId();
const staleSourceId = new mongoose.Types.ObjectId();
const freshUpdateSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const mutationUserId = new mongoose.Types.ObjectId();
const mutationSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const judgeUserId = new mongoose.Types.ObjectId();
const judgeSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const parentingUserId = new mongoose.Types.ObjectId();
const parentingSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const strategyUserId = new mongoose.Types.ObjectId();
const strategySourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const connectorUserId = new mongoose.Types.ObjectId();
const connectorPageId = new mongoose.Types.ObjectId();
const connectorSourceId = new mongoose.Types.ObjectId();
const connectorSourceIds = [
  connectorSourceId,
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const readwiseUserId = new mongoose.Types.ObjectId();
const readwisePageId = new mongoose.Types.ObjectId();
const readwiseSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const evernoteUserId = new mongoose.Types.ObjectId();
const evernotePageId = new mongoose.Types.ObjectId();
const evernoteSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const multiPageUserId = new mongoose.Types.ObjectId();
const multiPageSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const multiPageIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const queueUserId = new mongoose.Types.ObjectId();
const queuePageId = new mongoose.Types.ObjectId();
const queueSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const drainUserIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const drainPageIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
const drainSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const retryUserId = new mongoose.Types.ObjectId();
const retryPageId = new mongoose.Types.ObjectId();
const retrySourceId = new mongoose.Types.ObjectId();
const connectorIngestionUserId = new mongoose.Types.ObjectId();
const connectorIngestionPageIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];
const connectorIngestionSourceIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
];

const JUDGE_MIN_OVERALL = 0.82;
const JUDGE_MIN_DIMENSION = 0.75;

const forbiddenPatterns = [
  { label: 'raw HTML tag', pattern: /<\/?(?:p|div|span|br|section|article|a)\b/i },
  { label: 'raw URL', pattern: /https?:\/\//i },
  { label: 'starter scaffold heading', pattern: /\bCurrent Understanding\b/i },
  { label: 'starter scaffold heading', pattern: /\bWhy This Page Exists\b/i },
  { label: 'starter scaffold heading', pattern: /\bSource-Backed Claims\b/i },
  { label: 'starter scaffold heading', pattern: /\bNext Investigation\b/i },
  { label: 'generic evidence stitching', pattern: /contributes evidence for this page/i },
  { label: 'maintenance report prose', pattern: /this page has been rebuilt/i },
  { label: 'source index prose', pattern: /\bsource indexes?\b/i },
  { label: 'scraped metadata label', pattern: /\b(?:Name|URL|Title|Author|Source):\s/i },
  { label: 'support label leak', pattern: /\((?:supported|partial|unsupported|conflicted)\)/i }
];

const fixtures = [
  {
    type: 'parity',
    name: 'proposal_create_matches_maintained_article_quality',
    proposal: {
      _id: new mongoose.Types.ObjectId(),
      userId: complementaryMachineUserId,
      status: 'pending',
      proposalType: 'repeated_theme',
      title: 'Complementary Machines and Human Capability',
      thesis: 'World models may enable complementary machines that work alongside people on tasks humans cannot or do not want to do.',
      whyNow: 'Multiple sources discuss world models, complementary agents, and deployment limits.',
      sourceRefs: [
        {
          type: 'article',
          objectId: complementaryMachineSourceIds[0],
          title: 'World Models: Computing the Uncomputable',
          snippet: 'World-model agents can predict future states and support action choices under uncertainty.'
        },
        {
          type: 'article',
          objectId: complementaryMachineSourceIds[1],
          title: 'Complementary Machines and Human Capability',
          snippet: 'Complementary machines handle tasks that are dangerous, tedious, or undesirable for people.'
        },
        {
          type: 'article',
          objectId: complementaryMachineSourceIds[2],
          title: 'Limits of Autonomous Agents',
          snippet: 'Reliable deployment still depends on alignment, governance, and robust evaluation.'
        }
      ],
      starterClaims: [
        'Starter claim should not survive as the final article.',
        '<p>Name: scraped source metadata should not leak</p>'
      ],
      openQuestions: [
        'Starter question should be replaced by maintained open questions.'
      ]
    },
    library: {
      articles: [
        {
          _id: complementaryMachineSourceIds[0],
          title: 'World Models: Computing the Uncomputable',
          url: 'https://example.test/world-models',
          content: '<p>Name: World Models: Computing the Uncomputable</p><p>World-model agents learn predictive representations of an environment so they can anticipate future states before acting. This can let agents plan useful interventions rather than merely classify the present.</p>',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: complementaryMachineSourceIds[1],
          title: 'Complementary Machines and Human Capability',
          url: 'https://example.test/complementary-machines',
          content: 'A complementary machine extends human capability by taking on work that is dangerous, tedious, or difficult for people while keeping the human goal in view.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: complementaryMachineSourceIds[2],
          title: 'Limits of Autonomous Agents',
          url: 'https://example.test/agent-limits',
          content: 'Current autonomous systems can fail when goals are underspecified, environments shift, or evaluation is weak. Governance and alignment constraints remain necessary.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Complementary Machines and Human Capability',
      article: {
        summary: {
          text: 'A complementary machine is an AI system designed to extend human capability by taking on work that people find dangerous, tedious, or difficult while preserving human goals.',
          citationIndexes: [1, 2],
          contradictionIndexes: [],
          support: 'supported'
        },
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              {
                text: 'The concept is not just automation. It describes machines that complement human judgment by handling work where prediction, simulation, or tireless execution gives the system an advantage.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'How It Works',
            paragraphs: [
              {
                text: 'World models are one route to this behavior: the system learns a representation of future environment states, evaluates possible actions, and chooses interventions that support a human objective.',
                citationIndexes: [1],
                contradictionIndexes: [],
                support: 'partial'
              }
            ],
            bullets: []
          },
          {
            heading: 'Evidence',
            paragraphs: [
              {
                text: 'The source set supports a pattern in which predictive models and complementary deployment roles reinforce each other: better anticipation makes machines more useful on tasks where human execution is constrained.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'Tensions',
            paragraphs: [
              {
                text: 'The strongest unresolved tension is reliability. A machine can be complementary in intent while still failing when goals are underspecified, environments shift, or evaluation is too weak.',
                citationIndexes: [1, 2],
                contradictionIndexes: [3],
                support: 'conflicted'
              }
            ],
            bullets: []
          },
          {
            heading: 'Open Questions',
            paragraphs: [
              {
                text: 'The page still needs sharper evidence on which tasks should be delegated to complementary machines and which require human control despite predictive capability.',
                citationIndexes: [],
                contradictionIndexes: [],
                support: 'unsupported'
              }
            ],
            bullets: []
          }
        ]
      },
      maintenance: {
        summary: 'Rewrote the proposal scaffold into a sourced wiki article with risks and open questions.',
        changelog: [
          {
            type: 'merged_new_evidence',
            target: 'Core Idea',
            summary: 'Integrated world-model and complementary-machine sources into a maintained article.',
            sourceIndexes: [1, 2, 3]
          }
        ],
        health: {
          newItems: [],
          unsupportedClaims: [
            {
              text: 'Task boundaries for complementary machines need more evidence.',
              section: 'Open Questions'
            }
          ],
          missingCitations: [],
          staleSections: [],
          contradictions: [
            {
              text: 'Reliability and alignment constraints limit deployment.',
              sourceTitle: 'Limits of Autonomous Agents',
              sourceIndexes: [3],
              section: 'Tensions'
            }
          ],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    }
  },
  {
    type: 'parity',
    name: 'same_domain_investing_sources_remain_distinct',
    proposal: {
      _id: new mongoose.Types.ObjectId(),
      userId: investingUserId,
      status: 'pending',
      proposalType: 'repeated_theme',
      title: 'Value Investing',
      thesis: 'Value investing is a discipline for estimating business value and buying with a margin of safety.',
      whyNow: 'Multiple distinct investing essays from the same domain point at valuation, margin of safety, and behavioral risk.',
      sourceRefs: [
        {
          type: 'article',
          objectId: investingSourceIds[0],
          title: 'Investing: The Rules of the Road',
          url: 'https://fs.blog/investing-rules/',
          snippet: 'Good investing starts with process discipline and avoiding avoidable errors.'
        },
        {
          type: 'article',
          objectId: investingSourceIds[1],
          title: 'The Practice of Value Investing',
          url: 'https://fs.blog/value-investing/',
          snippet: 'Value investors estimate intrinsic value and demand a margin of safety.'
        },
        {
          type: 'article',
          objectId: investingSourceIds[2],
          title: 'The Folly of Certainty',
          url: 'https://fs.blog/folly-of-certainty/',
          snippet: 'Investor certainty can become a source of error when evidence is ambiguous.'
        }
      ],
      starterClaims: ['Do not merely list the Farnam Street source titles.'],
      openQuestions: ['Which investing claims are source-backed versus speculative?']
    },
    library: {
      articles: [
        {
          _id: investingSourceIds[0],
          title: 'Investing: The Rules of the Road',
          url: 'https://fs.blog/investing-rules/',
          content: 'Investing process matters because the future is uncertain. Rules reduce avoidable mistakes, force patience, and keep the investor focused on business quality rather than market noise.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: investingSourceIds[1],
          title: 'The Practice of Value Investing',
          url: 'https://fs.blog/value-investing/',
          content: 'Value investing asks the investor to estimate intrinsic value, compare it with price, and require a margin of safety before acting.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: investingSourceIds[2],
          title: 'The Folly of Certainty',
          url: 'https://fs.blog/folly-of-certainty/',
          content: 'Certainty is dangerous in investing because evidence is incomplete and human judgment is fallible. A strong process should leave room for error and disconfirmation.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Value Investing',
      article: {
        summary: {
          text: 'Value investing is a discipline for estimating business value, comparing that value with price, and acting only when the gap is large enough to absorb error.',
          citationIndexes: [1, 2],
          contradictionIndexes: [],
          support: 'supported'
        },
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              {
                text: 'The central move is to treat a stock as a fractional interest in a business rather than as a price chart. The investor forms a value estimate and uses margin of safety to protect against imperfect judgment.',
                citationIndexes: [2],
                contradictionIndexes: [],
                support: 'partial'
              }
            ],
            bullets: []
          },
          {
            heading: 'How It Works',
            paragraphs: [
              {
                text: 'A value process combines business analysis, price discipline, patience, and rules that reduce avoidable behavioral errors when markets are noisy.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'Evidence',
            paragraphs: [
              {
                text: 'The distinct investing sources converge on process discipline: valuation provides the target, rules shape behavior, and humility keeps the investor from overclaiming certainty.',
                citationIndexes: [1, 2, 3],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'Tensions',
            paragraphs: [
              {
                text: 'The tension is that value investing requires conviction while also warning against certainty. The process must allow action without pretending the estimate is exact.',
                citationIndexes: [1, 2],
                contradictionIndexes: [3],
                support: 'conflicted'
              }
            ],
            bullets: []
          },
          {
            heading: 'Open Questions',
            paragraphs: [
              {
                text: 'This page still needs examples showing when a margin of safety is large enough to justify action and when uncertainty should keep the investor out.',
                citationIndexes: [],
                contradictionIndexes: [],
                support: 'unsupported'
              }
            ],
            bullets: []
          }
        ]
      },
      maintenance: {
        summary: 'Synthesized distinct same-domain investing sources without collapsing them into one source.',
        changelog: [
          {
            type: 'merged_new_evidence',
            target: 'Evidence',
            summary: 'Integrated valuation, process discipline, and uncertainty sources.',
            sourceIndexes: [1, 2, 3]
          }
        ],
        health: {
          newItems: [],
          unsupportedClaims: [{ text: 'Concrete margin-of-safety thresholds need examples.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Conviction must coexist with uncertainty.', sourceTitle: 'The Folly of Certainty', sourceIndexes: [3], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: investingSourceIds.map(String)
    }
  },
  {
    type: 'maintenance_quality',
    name: 'stale_page_updates_from_fresh_sources',
    page: {
      _id: new mongoose.Types.ObjectId(),
      userId: staleUpdateUserId,
      title: 'Capital Allocation',
      slug: 'capital-allocation',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old capital allocation note that overstates buybacks.' }] }] },
      plainText: 'Old capital allocation note that overstates buybacks.',
      sourceRefs: [{
        _id: new mongoose.Types.ObjectId(),
        type: 'article',
        objectId: staleSourceId,
        title: 'Old buyback memo',
        snippet: 'Buybacks are always the best use of capital.',
        addedBy: 'ai'
      }],
      claims: [],
      citations: [],
      aiState: {}
    },
    library: {
      articles: [
        {
          _id: freshUpdateSourceIds[0],
          title: 'Reinvestment returns and capital allocation',
          content: 'Capital allocation should compare reinvestment returns against alternatives such as dividends, repurchases, and acquisitions.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: freshUpdateSourceIds[1],
          title: 'Buyback discipline',
          content: 'Buybacks create value when shares trade below intrinsic value, but destroy value when management repurchases overvalued shares.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: freshUpdateSourceIds[2],
          title: 'Dividend counterpoint',
          content: 'Returning cash through dividends can be superior when reinvestment opportunities are weak or management lacks a clear edge.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Capital Allocation',
      article: {
        summary: {
          text: 'Capital allocation is the discipline of choosing among reinvestment, buybacks, dividends, acquisitions, and balance-sheet strength based on expected returns and opportunity cost.',
          citationIndexes: [1],
          contradictionIndexes: [],
          support: 'partial'
        },
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              {
                text: 'The core question is not which tool is fashionable, but which use of cash is likely to increase per-share value after considering alternatives.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'How It Works',
            paragraphs: [
              {
                text: 'Management compares incremental reinvestment returns with the value created by repurchases, dividends, acquisitions, or debt reduction.',
                citationIndexes: [1],
                contradictionIndexes: [],
                support: 'partial'
              }
            ],
            bullets: []
          },
          {
            heading: 'Evidence',
            paragraphs: [
              {
                text: 'The fresh sources support a contingent view: buybacks can be valuable below intrinsic value, while dividends can be better when reinvestment opportunities weaken.',
                citationIndexes: [1, 2, 3],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'Tensions',
            paragraphs: [
              {
                text: 'The stale claim that buybacks are always best is too broad. Repurchases depend on price and opportunity cost, and dividends may dominate in weaker reinvestment regimes.',
                citationIndexes: [2],
                contradictionIndexes: [3],
                support: 'conflicted'
              }
            ],
            bullets: []
          },
          {
            heading: 'Open Questions',
            paragraphs: [
              {
                text: 'The page still needs company-specific examples that show how managers should rank competing uses of cash under uncertainty.',
                citationIndexes: [],
                contradictionIndexes: [],
                support: 'unsupported'
              }
            ],
            bullets: []
          }
        ]
      },
      maintenance: {
        summary: 'Replaced stale buyback absolutism with a contingent capital allocation frame.',
        changelog: [
          {
            type: 'merged_new_evidence',
            target: 'Tensions',
            summary: 'Added fresh evidence that buybacks depend on valuation and alternatives.',
            sourceIndexes: [1, 2, 3]
          }
        ],
        health: {
          newItems: [{ title: 'Dividend counterpoint', sourceIndexes: [3], section: 'Tensions' }],
          unsupportedClaims: [{ text: 'Company-specific ranking rules need examples.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [{ section: 'Core Idea', reason: 'Old note overstated buybacks.' }],
          contradictions: [{ text: 'Buybacks are not always best.', sourceTitle: 'Dividend counterpoint', sourceIndexes: [3], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      expectedFirstSourceObjectId: String(freshUpdateSourceIds[0]),
      forbiddenClaimCitationObjectIds: [String(staleSourceId)]
    }
  },
  {
    type: 'proposal_decision',
    name: 'berkshire_letters_collapse_to_single_proposal',
    library: {
      articles: [1992, 1993, 1994, 1995, 1996, 1997].map((year, index) => ({
        _id: `berkshire-intel-${year}`,
        title: 'Name: To the Shareholders of Berkshire Hathaway Inc.: by berkshirehathaway.com',
        url: `https://www.berkshirehathaway.com/letters/${year}.html`,
        content: `Berkshire Hathaway owner earnings and capital allocation letter ${year}.`,
        highlights: [{
          _id: `berkshire-intel-highlight-${index}`,
          text: `Name: To the Shareholders of Berkshire Hathaway Inc. Owner earnings and Berkshire Hathaway investing lessons from ${year}.`,
          tags: ['Berkshire Hathaway']
        }]
      }))
    },
    expectations: {
      visibleTitles: ['Berkshire Hathaway'],
      maxVisible: 1,
      forbiddenVisibleTitlePatterns: [/berkshirehathaway/i, /owner earning/i, /shareholders/i]
    }
  },
  {
    type: 'proposal_decision',
    name: 'weak_mixed_noise_does_not_create_wiki',
    library: {
      articles: [
        {
          _id: 'noise-water',
          title: '5 Things You Should Know About California Water Crisis',
          url: 'https://news.example.test/water',
          content: 'California snowpack and water supply are affected by drought conditions.'
        },
        {
          _id: 'noise-travel',
          title: 'A travel profile about bicycle touring',
          url: 'https://travel.example.test/bicycle',
          content: 'A rider crossed the United States in his twenties and wrote about creativity and travel.'
        },
        {
          _id: 'noise-ai',
          title: 'Machine learning launch notes',
          url: 'https://ai.example.test/launch',
          content: 'A product update mentions AI, religion, creativity, and tools in passing without a shared thesis.'
        }
      ]
    },
    expectations: {
      maxVisible: 0,
      forbiddenVisibleTitlePatterns: [/.+/]
    }
  },
  {
    type: 'proposal_decision',
    name: 'existing_ai_tutor_page_forces_merge_not_create',
    library: {
      articles: [
        {
          _id: 'ai-tutor-source-1',
          title: 'AI tutors and adaptive feedback',
          url: 'https://learning.example.test/ai-tutors',
          content: 'AI tutors can adapt feedback, practice timing, and hints to the learner.',
          highlights: [{ _id: 'ai-tutor-h1', text: 'AI tutors improve practice when feedback is adaptive.', tags: ['AI Tutors'] }]
        },
        {
          _id: 'ai-tutor-source-2',
          title: 'Adaptive tutors and student motivation',
          url: 'https://learning.example.test/adaptive-tutors',
          content: 'Adaptive tutoring systems affect motivation when they keep challenge calibrated.',
          highlights: [{ _id: 'ai-tutor-h2', text: 'Adaptive tutors can keep motivation high by calibrating difficulty.', tags: ['AI Tutors'] }]
        },
        {
          _id: 'ai-tutor-source-3',
          title: 'Tutor feedback loops',
          url: 'https://learning.example.test/feedback-loops',
          content: 'Tutor feedback loops help students notice errors and correct the next attempt.',
          highlights: [{ _id: 'ai-tutor-h3', text: 'AI tutors depend on feedback loops.', tags: ['AI Tutors'] }]
        }
      ]
    },
    existingPages: [
      {
        _id: 'page-ai-tutors-existing',
        title: 'AI Tutors',
        plainText: 'AI tutors use adaptive feedback, calibrated difficulty, and feedback loops to guide practice.'
      }
    ],
    expectations: {
      maxVisible: 0,
      expectedDecisionActions: [{ pattern: /tutor/i, action: 'merge_into_existing', status: 'merged' }]
    }
  },
  {
    type: 'proposal_decision',
    name: 'single_source_weak_signal_rejected',
    library: {
      articles: [
        {
          _id: 'single-weak-source',
          title: 'Interesting quote about solitude',
          url: 'https://quotes.example.test/solitude',
          content: 'A single article mentions solitude, writing, and focus once without a repeated archive pattern.'
        }
      ]
    },
    expectations: {
      maxVisible: 0,
      forbiddenVisibleTitlePatterns: [/.+/]
    }
  },
  {
    type: 'maintenance_quality',
    name: 'parenting_mental_models_page_has_real_synthesis',
    page: {
      _id: new mongoose.Types.ObjectId(),
      userId: parentingUserId,
      title: 'Parenting Mental Models',
      slug: 'parenting-mental-models',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      plainText: '',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    library: {
      articles: [
        {
          _id: parentingSourceIds[0],
          title: 'Parenting mental models',
          content: 'Parenting mental models help parents choose responses under uncertainty rather than relying on reactive emotion.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: parentingSourceIds[1],
          title: 'Natural consequences and boundaries',
          content: 'Natural consequences work when the child can safely experience feedback, but boundaries are needed when the cost is too high.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: parentingSourceIds[2],
          title: 'Attachment and autonomy tension',
          content: 'Children need secure attachment and growing autonomy. Over-control can reduce agency while under-support can leave the child without scaffolding.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Parenting Mental Models',
      article: {
        summary: {
          text: 'Parenting mental models are reusable ways to choose responses when a child needs both support and room to learn. They help a parent avoid reacting only to the immediate behavior and instead reason about feedback, boundaries, attachment, and autonomy.',
          citationIndexes: [1, 2, 3],
          contradictionIndexes: [],
          support: 'supported'
        },
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              { text: 'The central use of a mental model is to slow down the parent response. Instead of asking only how to stop a behavior, the parent asks what kind of feedback or scaffolding would help the child learn safely.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }
            ],
            bullets: []
          },
          {
            heading: 'How It Works',
            paragraphs: [
              { text: 'Natural consequences are useful when the feedback is safe and legible. Boundaries become necessary when the consequence is too delayed, too dangerous, or too confusing for the child to learn from directly.', citationIndexes: [2], contradictionIndexes: [], support: 'partial' },
              { text: 'Attachment and autonomy form a second lens: the child needs enough connection to feel secure and enough responsibility to practice agency.', citationIndexes: [3], contradictionIndexes: [], support: 'partial' }
            ],
            bullets: []
          },
          {
            heading: 'Evidence',
            paragraphs: [
              { text: 'The sources converge on a practical frame: good parenting decisions balance immediate safety with longer-term learning. The parent maintains the environment so feedback is usable rather than merely punitive.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }
            ],
            bullets: []
          },
          {
            heading: 'Tensions',
            paragraphs: [
              { text: 'The main tension is that protection and agency can point in opposite directions. Too much intervention can weaken autonomy, while too little support can turn natural feedback into avoidable harm.', citationIndexes: [2], contradictionIndexes: [3], support: 'conflicted' }
            ],
            bullets: []
          },
          {
            heading: 'Open Questions',
            paragraphs: [
              { text: 'The page still needs concrete examples that identify when a natural consequence is safe enough and when a boundary should override it.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }
            ],
            bullets: []
          }
        ]
      },
      maintenance: {
        summary: 'Synthesized parenting models around safe feedback, boundaries, attachment, and autonomy.',
        changelog: [{ type: 'merged_new_evidence', target: 'Core Idea', summary: 'Integrated mental-model sources into a practical parenting frame.', sourceIndexes: [1, 2, 3] }],
        health: {
          newItems: [],
          unsupportedClaims: [{ text: 'Boundary examples need more evidence.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Protection and agency can conflict.', sourceTitle: 'Attachment and autonomy tension', sourceIndexes: [3], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: parentingSourceIds.map(String)
    }
  },
  {
    type: 'maintenance_quality',
    name: 'strategy_positioning_page_has_mechanism_and_tensions',
    page: {
      _id: new mongoose.Types.ObjectId(),
      userId: strategyUserId,
      title: 'Strategy Positioning',
      slug: 'strategy-positioning',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      plainText: '',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    library: {
      articles: [
        {
          _id: strategySourceIds[0],
          title: 'Strategy is choosing what not to do',
          content: 'A strategy creates advantage by making choices and tradeoffs. Refusing attractive but incoherent work protects the system.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: strategySourceIds[1],
          title: 'Positioning and fit',
          content: 'Positioning works when activities reinforce one another, making the whole system harder to copy than any single feature.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: strategySourceIds[2],
          title: 'Operational effectiveness trap',
          content: 'Operational improvements can raise performance but do not by themselves create a durable position if competitors can copy them.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Strategy Positioning',
      article: {
        summary: {
          text: 'Strategy positioning is the design of a distinct activity system: a company chooses where it will compete, what it will refuse, and how its choices reinforce one another in ways that are hard to copy.',
          citationIndexes: [1, 2],
          contradictionIndexes: [],
          support: 'supported'
        },
        sections: [
          { heading: 'Core Idea', paragraphs: [{ text: 'The core of positioning is tradeoff. A position becomes strategic when saying yes to one customer, channel, or workflow also requires saying no to incompatible work.', citationIndexes: [1], contradictionIndexes: [], support: 'partial' }], bullets: [] },
          { heading: 'How It Works', paragraphs: [{ text: 'Activities create fit when they reinforce each other. The advantage comes less from one brilliant feature and more from the way the whole operating model makes imitation costly.', citationIndexes: [2], contradictionIndexes: [], support: 'partial' }], bullets: [] },
          { heading: 'Evidence', paragraphs: [{ text: 'The source set supports a distinction between operational improvement and strategic position. Improving execution matters, but without tradeoffs and fit it is more likely to be copied away.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Tensions', paragraphs: [{ text: 'The tension is that operational effectiveness feels productive and measurable, while positioning requires refusing plausible opportunities. Teams can drift toward copyable improvements because tradeoffs are painful.', citationIndexes: [1, 2], contradictionIndexes: [3], support: 'conflicted' }], bullets: [] },
          { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples showing how to detect whether a product decision strengthens fit or merely adds another copyable feature.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
        ]
      },
      maintenance: {
        summary: 'Built a strategy page around tradeoffs, fit, operational effectiveness, and refusal.',
        changelog: [{ type: 'merged_new_evidence', target: 'Tensions', summary: 'Separated copyable operational improvement from durable positioning.', sourceIndexes: [1, 2, 3] }],
        health: {
          newItems: [],
          unsupportedClaims: [{ text: 'Fit diagnostics need examples.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Operational improvement is not the same as strategy.', sourceTitle: 'Operational effectiveness trap', sourceIndexes: [3], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: strategySourceIds.map(String)
    }
  },
  {
    type: 'source_event_update',
    name: 'notion_source_event_directly_updates_matching_wiki',
    page: {
      _id: connectorPageId,
      userId: connectorUserId,
      title: 'Research Taste',
      slug: 'research-taste',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note about research taste.' }] }] },
      plainText: 'Old note about research taste. Notion source should update this wiki.',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    sourceEvent: {
      _id: new mongoose.Types.ObjectId(),
      userId: connectorUserId,
      sourceType: 'notebook',
      sourceObjectId: connectorSourceId,
      provider: 'notion',
      externalId: 'notion-page-research-taste',
      eventType: 'updated',
      title: 'Research Taste',
      summary: 'A Notion page updated with notes on research taste, anomaly detection, and source triage.',
      text: 'Research taste improves when the researcher notices anomalies, distinguishes signal from volume, and keeps track of unresolved questions.',
      metadata: { connector: 'notion', allowPageCreation: false },
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      status: 'pending'
    },
    library: {
      notebooks: [
        {
          _id: connectorSourceIds[0],
          title: 'Research Taste',
          content: 'Research taste improves when the researcher notices anomalies, distinguishes signal from volume, and keeps track of unresolved questions.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: connectorSourceIds[1],
          title: 'Anomaly notebook',
          content: 'Useful research often starts when an anomaly violates the expected pattern and forces a better question.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: connectorSourceIds[2],
          title: 'Source triage notebook',
          content: 'Source triage separates high-signal evidence from high-volume but repetitive material.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Research Taste',
      article: {
        summary: { text: 'Research taste is the ability to notice which anomalies, sources, and unresolved questions are worth sustained attention.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
        sections: [
          { heading: 'Core Idea', paragraphs: [{ text: 'The core skill is judgment under information overload: noticing when a small anomaly matters more than a large pile of ordinary material.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'How It Works', paragraphs: [{ text: 'A researcher builds taste by comparing source quality, tracking unresolved questions, and returning to anomalies that change the frame of the problem.', citationIndexes: [1, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Evidence', paragraphs: [{ text: 'The Notion update and related notebooks converge on one mechanism: taste is less about consuming more sources and more about triaging which signals deserve another pass.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Tensions', paragraphs: [{ text: 'The tension is that volume can imitate depth. A large archive may feel productive while making it harder to see the anomaly that should redirect the work.', citationIndexes: [1], contradictionIndexes: [3], support: 'conflicted' }], bullets: [] },
          { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples of research decisions where one anomaly outweighed many weaker sources.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
        ]
      },
      maintenance: {
        summary: 'Updated from a Notion source event and synthesized anomaly detection with source triage.',
        changelog: [{ type: 'merged_new_evidence', target: 'Evidence', summary: 'Merged Notion research-taste update into the wiki page.', sourceIndexes: [1, 2, 3] }],
        health: {
          newItems: [{ title: 'Research Taste', sourceIndexes: [1], section: 'Core Idea' }],
          unsupportedClaims: [{ text: 'Anomaly-over-volume examples are still needed.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Volume can imitate depth.', sourceTitle: 'Source triage notebook', sourceIndexes: [3], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: connectorSourceIds.map(String),
      minClaims: 6,
      minCitedClaims: 5
    }
  },
  {
    type: 'source_event_update',
    name: 'readwise_source_event_updates_investing_wiki',
    page: {
      _id: readwisePageId,
      userId: readwiseUserId,
      title: 'Margin of Safety',
      slug: 'margin-of-safety',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note about margin of safety.' }] }] },
      plainText: 'Old note about margin of safety. Readwise highlight should update this wiki.',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    sourceEvent: {
      _id: new mongoose.Types.ObjectId(),
      userId: readwiseUserId,
      sourceType: 'article',
      sourceObjectId: readwiseSourceIds[0],
      provider: 'readwise',
      externalId: 'readwise-book-margin-of-safety',
      eventType: 'synced',
      title: 'Margin of Safety',
      summary: 'Readwise synced highlights about intrinsic value, downside protection, and behavioral patience.',
      text: 'Margin of safety protects the investor from valuation error, uncertainty, and emotional pressure.',
      metadata: { connector: 'readwise', allowPageCreation: false },
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      status: 'pending'
    },
    library: {
      articles: [
        { _id: readwiseSourceIds[0], title: 'Margin of Safety highlights', content: 'Margin of safety protects an investor from valuation error by requiring price to sit meaningfully below estimated value.', updatedAt: new Date('2026-05-09T12:00:00.000Z') },
        { _id: readwiseSourceIds[1], title: 'Intrinsic value uncertainty', content: 'Intrinsic value is an estimate, not a fact, so investors need room for uncertainty and changing evidence.', updatedAt: new Date('2026-05-08T12:00:00.000Z') },
        { _id: readwiseSourceIds[2], title: 'Behavioral patience in investing', content: 'A margin of safety also creates behavioral patience because the investor is less dependent on perfect timing.', updatedAt: new Date('2026-05-07T12:00:00.000Z') }
      ]
    },
    modelResult: {
      title: 'Margin of Safety',
      article: {
        summary: { text: 'Margin of safety is the discipline of buying only when price is meaningfully below estimated value, so the investor has protection against valuation error, uncertainty, and emotional pressure.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
        sections: [
          { heading: 'Core Idea', paragraphs: [{ text: 'The concept turns uncertainty into a required discount. Because intrinsic value is an estimate, the investor demands a gap large enough to survive being partly wrong.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'How It Works', paragraphs: [{ text: 'A margin of safety works by comparing conservative value estimates with market price, then refusing investments where the gap is too narrow to absorb error.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Evidence', paragraphs: [{ text: 'The Readwise highlights and related sources converge on two roles: valuation protection and behavioral protection. The discount reduces both analytical fragility and pressure to time the market perfectly.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Tensions', paragraphs: [{ text: 'The tension is that a large discount can protect against error while also causing missed opportunities if the estimate is too conservative or the market never offers the desired price.', citationIndexes: [1], contradictionIndexes: [2], support: 'conflicted' }], bullets: [] },
          { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples showing how large the discount should be under different levels of business quality and uncertainty.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
        ]
      },
      maintenance: {
        summary: 'Updated from Readwise highlights into a maintained margin-of-safety wiki page.',
        changelog: [{ type: 'merged_new_evidence', target: 'Evidence', summary: 'Merged valuation and behavioral support from Readwise highlights.', sourceIndexes: [1, 2, 3] }],
        health: {
          newItems: [{ title: 'Margin of Safety highlights', sourceIndexes: [1], section: 'Evidence' }],
          unsupportedClaims: [{ text: 'Discount sizing examples are still needed.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Conservatism may cause missed opportunities.', sourceTitle: 'Intrinsic value uncertainty', sourceIndexes: [2], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: readwiseSourceIds.map(String),
      minClaims: 6,
      minCitedClaims: 5
    }
  },
  {
    type: 'source_event_update',
    name: 'evernote_source_event_updates_project_wiki',
    page: {
      _id: evernotePageId,
      userId: evernoteUserId,
      title: 'Research Inbox',
      slug: 'research-inbox',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old inbox note.' }] }] },
      plainText: 'Old research inbox note. Evernote import should update this wiki.',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    sourceEvent: {
      _id: new mongoose.Types.ObjectId(),
      userId: evernoteUserId,
      sourceType: 'notebook',
      sourceObjectId: evernoteSourceIds[0],
      provider: 'evernote',
      externalId: 'evernote-research-inbox',
      eventType: 'imported',
      title: 'Research Inbox',
      summary: 'Evernote import added notes about source triage, capture discipline, and weekly review.',
      text: 'A research inbox works only if capture, triage, and review remain separate steps.',
      metadata: { connector: 'evernote', allowPageCreation: false },
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      status: 'pending'
    },
    library: {
      notebooks: [
        { _id: evernoteSourceIds[0], title: 'Research Inbox', content: 'A research inbox works when capture is fast, triage is deliberate, and weekly review decides what deserves synthesis.', updatedAt: new Date('2026-05-09T12:00:00.000Z') },
        { _id: evernoteSourceIds[1], title: 'Capture discipline', content: 'Capture should preserve the raw thought without forcing premature categorization.', updatedAt: new Date('2026-05-08T12:00:00.000Z') },
        { _id: evernoteSourceIds[2], title: 'Review cadence', content: 'Review cadence prevents the inbox from becoming storage instead of a decision point.', updatedAt: new Date('2026-05-07T12:00:00.000Z') }
      ]
    },
    modelResult: {
      title: 'Research Inbox',
      article: {
        summary: { text: 'A research inbox is a staging system for raw material: it captures quickly, triages deliberately, and converts selected items into synthesis through review.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
        sections: [
          { heading: 'Core Idea', paragraphs: [{ text: 'The inbox should not try to be the final knowledge base. Its job is to hold material long enough for the user to decide whether it deserves synthesis, action, or deletion.', citationIndexes: [1], contradictionIndexes: [], support: 'partial' }], bullets: [] },
          { heading: 'How It Works', paragraphs: [{ text: 'The system separates three moves: fast capture, slower triage, and periodic review. Mixing those moves creates friction at capture time and clutter at review time.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Evidence', paragraphs: [{ text: 'The Evernote import supports the operating model: capture discipline preserves raw thoughts, while review cadence prevents the archive from becoming passive storage.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Tensions', paragraphs: [{ text: 'The tension is that fast capture increases volume, while synthesis requires selectivity. Without review, a good inbox becomes another pile of unsorted material.', citationIndexes: [2], contradictionIndexes: [3], support: 'conflicted' }], bullets: [] },
          { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs criteria for when an inbox item should become a wiki page, a task, or an archived source.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
        ]
      },
      maintenance: {
        summary: 'Updated from Evernote import into a maintained research-inbox wiki page.',
        changelog: [{ type: 'merged_new_evidence', target: 'How It Works', summary: 'Integrated capture, triage, and review cadence notes.', sourceIndexes: [1, 2, 3] }],
        health: {
          newItems: [{ title: 'Research Inbox', sourceIndexes: [1], section: 'Core Idea' }],
          unsupportedClaims: [{ text: 'Promotion criteria still need examples.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Volume can overpower synthesis.', sourceTitle: 'Review cadence', sourceIndexes: [3], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: evernoteSourceIds.map(String),
      minClaims: 6,
      minCitedClaims: 5
    }
  },
  {
    type: 'source_event_update',
    name: 'one_source_event_updates_multiple_relevant_wikis',
    pages: [
      {
        _id: multiPageIds[0],
        userId: multiPageUserId,
        title: 'Research Taste',
        slug: 'research-taste-multi',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old research taste note.' }] }] },
        plainText: 'Research taste depends on anomaly detection and source triage.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      },
      {
        _id: multiPageIds[1],
        userId: multiPageUserId,
        title: 'Source Triage',
        slug: 'source-triage',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old source triage note.' }] }] },
        plainText: 'Source triage helps choose which material is worth synthesizing.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      }
    ],
    sourceEvent: {
      _id: new mongoose.Types.ObjectId(),
      userId: multiPageUserId,
      sourceType: 'notebook',
      sourceObjectId: multiPageSourceIds[0],
      provider: 'notion',
      externalId: 'notion-shared-source-triage',
      eventType: 'updated',
      title: 'Source Triage and Research Taste',
      summary: 'A shared note connects anomaly detection, research taste, and source triage.',
      text: 'One note should update both the research taste and source triage wiki pages.',
      metadata: { connector: 'notion', allowPageCreation: false },
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      status: 'pending'
    },
    library: {
      notebooks: [
        { _id: multiPageSourceIds[0], title: 'Source Triage and Research Taste', content: 'Research taste improves when source triage identifies anomalies that deserve synthesis instead of simply collecting more material.', updatedAt: new Date('2026-05-09T12:00:00.000Z') },
        { _id: multiPageSourceIds[1], title: 'Anomaly detection note', content: 'Anomaly detection redirects attention toward evidence that changes the frame of a question.', updatedAt: new Date('2026-05-08T12:00:00.000Z') },
        { _id: multiPageSourceIds[2], title: 'Archive volume note', content: 'Archive volume can hide signal when the system rewards accumulation over synthesis.', updatedAt: new Date('2026-05-07T12:00:00.000Z') }
      ]
    },
    modelResults: [
      {
        title: 'Research Taste',
        article: {
          summary: { text: 'Research taste is the judgment that separates frame-changing anomalies from ordinary archive volume.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'Taste shows up when a researcher notices that one anomalous source changes the question more than many routine sources. It is a judgment about which piece of evidence should redirect attention, not a preference for novelty by itself.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'The researcher uses triage to compare signals, then returns to sources that change the frame rather than sources that merely repeat the current view. This keeps the wiki from becoming a storage system and turns the archive into a queue of possible synthesis moves.', citationIndexes: [1], contradictionIndexes: [], support: 'partial' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The shared source ties research taste to triage: useful taste depends on choosing which evidence deserves synthesis, not on maximizing capture volume. The anomaly note explains why a small source can matter, while the archive-volume note explains why more material can make that signal harder to see.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'The tension is that a large archive can look like progress while hiding the anomaly that should redirect attention.', citationIndexes: [1], contradictionIndexes: [3], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples of anomalies that changed a research direction.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated research taste from a shared source-event note.', changelog: [{ type: 'merged_new_evidence', target: 'Evidence', summary: 'Merged shared anomaly and triage evidence.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'Examples of direction-changing anomalies needed.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Volume can hide signal.', sourceTitle: 'Archive volume note', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      },
      {
        title: 'Source Triage',
        article: {
          summary: { text: 'Source triage is the practice of deciding which captured material deserves synthesis, follow-up, or dismissal.', citationIndexes: [1, 3], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'The core idea is that the archive is not equally valuable. Triage assigns attention to sources that change the frame, supply evidence, or expose gaps.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'A triage pass compares novelty, evidence quality, and relation to active questions before promoting a source into the wiki.', citationIndexes: [1], contradictionIndexes: [], support: 'partial' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The shared note and archive-volume source support a rule: synthesis improves when the system rewards source quality and anomaly value instead of raw accumulation.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'The tension is that aggressive triage may discard weak signals too early, while loose triage turns the archive into a pile of repetitive material.', citationIndexes: [1], contradictionIndexes: [3], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs a scoring rule for deciding when a source is strong enough to promote.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated source triage from a shared source-event note.', changelog: [{ type: 'merged_new_evidence', target: 'Core Idea', summary: 'Merged shared note into source triage page.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'Promotion scoring needs examples.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Loose triage creates archive bloat.', sourceTitle: 'Archive volume note', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      }
    ],
    expectations: {
      pages: [
        { requiredSourceObjectIds: multiPageSourceIds.map(String), minClaims: 6, minCitedClaims: 5 },
        { requiredSourceObjectIds: multiPageSourceIds.map(String), minClaims: 6, minCitedClaims: 5 }
      ]
    }
  },
  {
    type: 'source_event_queue',
    name: 'pending_source_event_queue_updates_wiki_once_claimed',
    page: {
      _id: queuePageId,
      userId: queueUserId,
      title: 'Question Refinement',
      slug: 'question-refinement',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note about question refinement.' }] }] },
      plainText: 'Question refinement improves research direction.',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    sourceEvent: {
      _id: new mongoose.Types.ObjectId(),
      userId: queueUserId,
      sourceType: 'notebook',
      sourceObjectId: queueSourceIds[0],
      provider: 'notion',
      externalId: 'notion-question-refinement',
      eventType: 'updated',
      title: 'Question Refinement',
      summary: 'A queued Notion event added material on sharpening questions before collecting more sources.',
      text: 'Question refinement improves research by turning vague curiosity into discriminating tests.',
      metadata: { connector: 'notion', allowPageCreation: false },
      createdAt: new Date('2026-05-09T12:00:00.000Z'),
      status: 'pending',
      attemptCount: 0
    },
    library: {
      notebooks: [
        { _id: queueSourceIds[0], title: 'Question Refinement', content: 'Question refinement turns vague curiosity into discriminating tests that decide what evidence would matter.', updatedAt: new Date('2026-05-09T12:00:00.000Z') },
        { _id: queueSourceIds[1], title: 'Bad questions collect noise', content: 'Weak questions produce noisy source collection because almost any evidence can seem relevant.', updatedAt: new Date('2026-05-08T12:00:00.000Z') },
        { _id: queueSourceIds[2], title: 'Research tests', content: 'A good research question names what would change the answer and what would falsify the current frame.', updatedAt: new Date('2026-05-07T12:00:00.000Z') }
      ]
    },
    modelResult: {
      title: 'Question Refinement',
      article: {
        summary: { text: 'Question refinement is the practice of turning a vague curiosity into a testable frame that determines what evidence would actually change the answer.', citationIndexes: [1, 3], contradictionIndexes: [], support: 'supported' },
        sections: [
          { heading: 'Core Idea', paragraphs: [{ text: 'The point is to make the question discriminating before collecting more sources. A refined question says what would count as evidence and what would merely add noise.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'How It Works', paragraphs: [{ text: 'The researcher names the current frame, identifies what could change it, and uses that test to decide what to read or ignore next.', citationIndexes: [1, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Evidence', paragraphs: [{ text: 'The queued Notion update and supporting notes converge on a practical mechanism: better questions filter sources before the archive fills with material that only seems relevant.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
          { heading: 'Tensions', paragraphs: [{ text: 'The tension is that narrowing a question too early can miss surprising evidence, while leaving it vague can turn research into undirected accumulation.', citationIndexes: [1], contradictionIndexes: [2], support: 'conflicted' }], bullets: [] },
          { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples of question rewrites that changed the source search strategy.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
        ]
      },
      maintenance: {
        summary: 'Processed queued Notion update into a maintained question-refinement wiki page.',
        changelog: [{ type: 'merged_new_evidence', target: 'Core Idea', summary: 'Merged queued question-refinement source event.', sourceIndexes: [1, 2, 3] }],
        health: {
          newItems: [{ title: 'Question Refinement', sourceIndexes: [1], section: 'Core Idea' }],
          unsupportedClaims: [{ text: 'Question rewrite examples are still needed.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Narrowing too early can miss surprising evidence.', sourceTitle: 'Bad questions collect noise', sourceIndexes: [2], section: 'Tensions' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      requiredSourceObjectIds: queueSourceIds.map(String),
      minClaims: 6,
      minCitedClaims: 5
    }
  },
  {
    type: 'source_event_queue_drain',
    name: 'drain_source_event_queue_processes_due_events_across_users',
    pages: [
      {
        _id: drainPageIds[0],
        userId: drainUserIds[0],
        title: 'Research Taste',
        slug: 'research-taste',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old research taste note.' }] }] },
        plainText: 'Research taste helps decide what deserves attention.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      },
      {
        _id: drainPageIds[1],
        userId: drainUserIds[1],
        title: 'Evidence Triage',
        slug: 'evidence-triage',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old evidence triage note.' }] }] },
        plainText: 'Evidence triage decides which sources should shape a page.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      }
    ],
    sourceEvents: [
      {
        _id: new mongoose.Types.ObjectId(),
        userId: drainUserIds[0],
        sourceType: 'notebook',
        sourceObjectId: drainSourceIds[0],
        provider: 'notion',
        externalId: 'notion-research-taste-drain',
        eventType: 'updated',
        title: 'Research Taste',
        summary: 'A queued source clarified that research taste means identifying the rare source that should change the frame.',
        text: 'Research taste is the judgment that separates frame-changing anomalies from ordinary archive volume.',
        metadata: { connector: 'notion', allowPageCreation: false },
        affectedPageIds: [drainPageIds[0]],
        createdAt: new Date('2026-05-09T12:01:00.000Z'),
        status: 'pending',
        attemptCount: 0
      },
      {
        _id: new mongoose.Types.ObjectId(),
        userId: drainUserIds[1],
        sourceType: 'notebook',
        sourceObjectId: drainSourceIds[3],
        provider: 'readwise',
        externalId: 'readwise-evidence-triage-drain',
        eventType: 'updated',
        title: 'Evidence Triage',
        summary: 'A queued Reader highlight clarified that evidence triage ranks source quality, novelty, and relation to active claims.',
        text: 'Evidence triage prevents a wiki from treating every captured source as equally important.',
        metadata: { connector: 'readwise', allowPageCreation: false },
        affectedPageIds: [drainPageIds[1]],
        createdAt: new Date('2026-05-09T12:02:00.000Z'),
        status: 'pending',
        attemptCount: 0
      }
    ],
    library: {
      notebooks: [
        { _id: drainSourceIds[0], userId: drainUserIds[0], title: 'Research taste source', content: 'Research taste notices frame-changing anomalies instead of merely counting more captured sources.', updatedAt: new Date('2026-05-09T12:01:00.000Z') },
        { _id: drainSourceIds[1], userId: drainUserIds[0], title: 'Anomaly note', content: 'A small anomalous source can redirect a research question when it changes what evidence matters.', updatedAt: new Date('2026-05-08T12:00:00.000Z') },
        { _id: drainSourceIds[2], userId: drainUserIds[0], title: 'Archive volume note', content: 'High archive volume can hide important anomalies if the system rewards capture over synthesis.', updatedAt: new Date('2026-05-07T12:00:00.000Z') },
        { _id: drainSourceIds[3], userId: drainUserIds[1], title: 'Evidence triage source', content: 'Evidence triage ranks source quality, novelty, and relation to active claims before updating a wiki.', updatedAt: new Date('2026-05-09T12:02:00.000Z') },
        { _id: drainSourceIds[4], userId: drainUserIds[1], title: 'Evidence quality note', content: 'A source is stronger when it directly supports or challenges a claim instead of repeating a topic label.', updatedAt: new Date('2026-05-08T12:00:00.000Z') },
        { _id: drainSourceIds[5], userId: drainUserIds[1], title: 'Triage failure note', content: 'Loose evidence triage turns a page into a source dump because every captured item appears relevant.', updatedAt: new Date('2026-05-07T12:00:00.000Z') }
      ]
    },
    modelResults: [
      {
        title: 'Research Taste',
        article: {
          summary: { text: 'Research taste is the judgment that identifies which sources should change the frame of inquiry instead of merely enlarging the archive.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'Research taste is a selection judgment. It distinguishes the source that changes the active question from ordinary material that only repeats the topic.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'The researcher compares each new source against the current frame, then promotes material that changes what evidence would matter next.', citationIndexes: [1], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The queued source, anomaly note, and archive-volume note converge on the same rule: synthesis improves when anomalies can outrank volume.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'The tension is that a large archive can feel productive while making the frame-changing source harder to notice.', citationIndexes: [3], contradictionIndexes: [2], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples of specific sources that redirected a research program.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated research taste from a queued source event.', changelog: [{ type: 'merged_new_evidence', target: 'Core Idea', summary: 'Merged queued research-taste source.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'Examples of redirected research programs are still needed.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Archive volume can hide anomaly value.', sourceTitle: 'Archive volume note', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      },
      {
        title: 'Evidence Triage',
        article: {
          summary: { text: 'Evidence triage is the practice of ranking captured sources by their ability to support, challenge, or reshape active wiki claims.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'Evidence triage prevents a wiki from treating every source as equally meaningful. It gives priority to sources that change claims or expose gaps.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'A triage pass compares source quality, novelty, and relationship to active claims before deciding whether to update, defer, or ignore the item.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The queued Reader source and quality note support a claim-level rule: the system should reward sources that directly support or challenge claims.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'Loose triage creates source dumps, while overly strict triage can delay weak signals that later become important.', citationIndexes: [3], contradictionIndexes: [1], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs a practical scoring rule for source strength.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated evidence triage from a queued source event.', changelog: [{ type: 'merged_new_evidence', target: 'How It Works', summary: 'Merged queued evidence-triage source.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'A practical source-strength score is still needed.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Loose triage creates source dumps.', sourceTitle: 'Triage failure note', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      }
    ],
    expectations: {
      pages: [
        { requiredSourceObjectIds: drainSourceIds.slice(0, 3).map(String), minClaims: 6, minCitedClaims: 5 },
        { requiredSourceObjectIds: drainSourceIds.slice(3, 6).map(String), minClaims: 6, minCitedClaims: 5 }
      ]
    }
  },
  {
    type: 'source_event_queue_failure',
    name: 'failed_source_event_retries_and_reschedules_on_error',
    page: {
      _id: retryPageId,
      userId: retryUserId,
      title: 'Retryable Wiki Maintenance',
      slug: 'retryable-wiki-maintenance',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old retry note.' }] }] },
      plainText: 'Retryable maintenance should preserve work when an agent call fails.',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    sourceEvent: {
      _id: new mongoose.Types.ObjectId(),
      userId: retryUserId,
      sourceType: 'notebook',
      sourceObjectId: retrySourceId,
      provider: 'notion',
      externalId: 'notion-retryable-maintenance',
      eventType: 'updated',
      title: 'Retryable Wiki Maintenance',
      summary: 'A failed event should be claimed again only when due and should be rescheduled if the agent fails again.',
      text: 'Retryable maintenance needs durable status transitions so failed source events do not disappear.',
      metadata: { connector: 'notion', allowPageCreation: false },
      affectedPageIds: [retryPageId],
      createdAt: new Date('2026-05-09T12:03:00.000Z'),
      status: 'failed',
      attemptCount: 1,
      nextAttemptAt: new Date('2026-05-09T12:04:00.000Z')
    },
    maintenanceErrorMessage: 'fixture maintenance agent unavailable',
    library: {
      notebooks: [
        { _id: retrySourceId, title: 'Retryable maintenance source', content: 'Failed wiki source events need durable retry scheduling and visible error state.', updatedAt: new Date('2026-05-09T12:03:00.000Z') }
      ]
    },
    expectations: {
      expectedError: /fixture maintenance agent unavailable/i
    }
  },
  {
    type: 'connector_ingestion_queue',
    name: 'connector_payloads_create_queue_events_and_update_wikis',
    pages: [
      {
        _id: connectorIngestionPageIds[0],
        userId: connectorIngestionUserId,
        title: 'Notion Research Operating System',
        slug: 'notion-research-operating-system',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note about Notion research systems.' }] }] },
        plainText: 'Notion research systems need page updates.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      },
      {
        _id: connectorIngestionPageIds[1],
        userId: connectorIngestionUserId,
        title: 'Readwise Evidence Capture',
        slug: 'readwise-evidence-capture',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note about Readwise evidence.' }] }] },
        plainText: 'Readwise capture needs claim-level triage.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      },
      {
        _id: connectorIngestionPageIds[2],
        userId: connectorIngestionUserId,
        title: 'Evernote Migration Memory',
        slug: 'evernote-migration-memory',
        pageType: 'topic',
        status: 'draft',
        visibility: 'private',
        sourceScope: 'entire_library',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note about Evernote migration.' }] }] },
        plainText: 'Evernote migrations should preserve memory.',
        sourceRefs: [],
        claims: [],
        citations: [],
        aiState: {}
      }
    ],
    connectorPayloads: [
      {
        provider: 'notion',
        sourceObjectId: connectorIngestionSourceIds[0],
        affectedPageIds: [connectorIngestionPageIds[0]],
        payload: {
          id: 'notion-research-os-page',
          title: 'Notion Research Operating System',
          content: 'A Notion research operating system turns captured pages into maintained wiki claims rather than a passive project archive.',
          url: 'https://www.notion.so/notion-research-os-page',
          last_edited_time: '2026-05-09T13:01:00.000Z',
          eventType: 'updated',
          sourceType: 'page'
        }
      },
      {
        provider: 'readwise',
        sourceObjectId: connectorIngestionSourceIds[3],
        parentObjectId: connectorIngestionSourceIds[4],
        affectedPageIds: [connectorIngestionPageIds[1]],
        payload: {
          highlightId: 'rw-highlight-claim-triage',
          highlight: {
            text: 'Evidence capture is only useful when each highlight is attached to a claim it supports or challenges.',
            note: 'Use this for the Readwise evidence page.'
          },
          title: 'Readwise Evidence Capture',
          url: 'https://readwise.io/bookreview/claim-triage',
          highlighted_at: '2026-05-09T13:02:00.000Z'
        }
      },
      {
        provider: 'evernote',
        sourceObjectId: connectorIngestionSourceIds[6],
        affectedPageIds: [connectorIngestionPageIds[2]],
        payload: {
          guid: 'evernote-migration-memory-note',
          title: 'Evernote Migration Memory',
          content: 'Evernote migration should preserve source context, folder provenance, and decisions that still affect the maintained wiki.',
          updatedAt: '2026-05-09T13:03:00.000Z',
          sourceType: 'note'
        }
      }
    ],
    library: {
      notebooks: [
        { _id: connectorIngestionSourceIds[0], userId: connectorIngestionUserId, title: 'Notion Research Operating System', content: 'A Notion research operating system turns captured pages into maintained wiki claims rather than a passive project archive.', updatedAt: new Date('2026-05-09T13:01:00.000Z') },
        { _id: connectorIngestionSourceIds[1], userId: connectorIngestionUserId, title: 'Notion source status', content: 'Notion pages should update the wiki directly when they change and keep provenance attached.', updatedAt: new Date('2026-05-08T13:01:00.000Z') },
        { _id: connectorIngestionSourceIds[2], userId: connectorIngestionUserId, title: 'Notion archive risk', content: 'A Notion workspace can become a passive archive if captured pages never revise active claims.', updatedAt: new Date('2026-05-07T13:01:00.000Z') },
        { _id: connectorIngestionSourceIds[6], userId: connectorIngestionUserId, title: 'Evernote Migration Memory', content: 'Evernote migration should preserve source context, folder provenance, and decisions that still affect the maintained wiki.', updatedAt: new Date('2026-05-09T13:03:00.000Z') },
        { _id: connectorIngestionSourceIds[7], userId: connectorIngestionUserId, title: 'Evernote provenance', content: 'Migrated notes need folder path and note context so the agent can explain why the memory matters.', updatedAt: new Date('2026-05-08T13:03:00.000Z') },
        { _id: connectorIngestionSourceIds[8], userId: connectorIngestionUserId, title: 'Evernote migration decay', content: 'Evernote migration memory loses value when imported Evernote notes become unlinked historical scraps instead of active page evidence.', updatedAt: new Date('2026-05-07T13:03:00.000Z') }
      ],
      articles: [
        { _id: connectorIngestionSourceIds[4], userId: connectorIngestionUserId, title: 'Readwise Evidence Capture', url: 'https://readwise.io/bookreview/claim-triage', content: 'Readwise evidence capture works when highlights are attached to claims they support or challenge.', highlights: [{ _id: connectorIngestionSourceIds[3], text: 'Evidence capture is only useful when each highlight is attached to a claim it supports or challenges.', note: 'Use this for the Readwise evidence page.', createdAt: new Date('2026-05-09T13:02:00.000Z') }], updatedAt: new Date('2026-05-09T13:02:00.000Z') },
        { _id: connectorIngestionSourceIds[5], userId: connectorIngestionUserId, title: 'Readwise capture failure', url: 'https://readwise.io/bookreview/capture-failure', content: 'Highlight capture fails when the system preserves excerpts but never decides which claim changed.', updatedAt: new Date('2026-05-08T13:02:00.000Z') }
      ]
    },
    modelResults: [
      {
        title: 'Notion Research Operating System',
        article: {
          summary: { text: 'A Notion research operating system keeps workspace pages connected to maintained wiki claims instead of leaving them as passive project notes.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'The system treats edited Notion pages as source events. When a page changes, the wiki should update the relevant claims and preserve where the new evidence came from.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'The connector converts page edits into queued source events, attaches provenance, and lets maintenance rewrite the matching wiki page.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The Notion update, source-status note, and archive-risk note all support the same operating rule: capture matters only when it revises active claims.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'The tension is that Notion is excellent for capture, but that strength can hide stale thinking when page edits do not flow back into the wiki.', citationIndexes: [3], contradictionIndexes: [1], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs rules for which Notion edits deserve automatic maintenance.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated Notion research operating system from connector payload.', changelog: [{ type: 'merged_new_evidence', target: 'Core Idea', summary: 'Merged Notion connector event into the page.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'Automatic maintenance thresholds still need examples.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Passive archive risk remains.', sourceTitle: 'Notion archive risk', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      },
      {
        title: 'Readwise Evidence Capture',
        article: {
          summary: { text: 'Readwise evidence capture becomes useful when highlights are promoted into claim-level support or contradiction instead of stored as loose excerpts.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'The important unit is not the highlight by itself but the relationship between the highlight and a wiki claim.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'A Readwise sync should emit highlight events with parent article context, then maintenance should decide whether each highlight supports, challenges, or leaves a claim unchanged.', citationIndexes: [1], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The highlight and article both say capture works only when excerpts attach to claims; the failure source explains why excerpt storage alone is not enough.', citationIndexes: [1, 2, 3], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'Readwise makes capture easy, but easy capture can increase review debt when the wiki cannot tell which claim changed.', citationIndexes: [3], contradictionIndexes: [1], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs a rule for grouping multiple highlights from the same source.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated Readwise evidence capture from connector payload.', changelog: [{ type: 'merged_new_evidence', target: 'Evidence', summary: 'Merged Readwise highlight and parent article.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'Highlight grouping rule still needed.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Capture can increase review debt.', sourceTitle: 'Readwise capture failure', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      },
      {
        title: 'Evernote Migration Memory',
        article: {
          summary: { text: 'Evernote migration memory preserves context, provenance, and still-relevant decisions so imported notes can become maintained wiki evidence.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' },
          sections: [
            { heading: 'Core Idea', paragraphs: [{ text: 'Migration is valuable when imported Evernote notes keep enough context to update active wiki pages, not merely recreate old folders.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'How It Works', paragraphs: [{ text: 'The connector should emit note-level source events with folder provenance, source context, and the text needed for maintenance to revise claims.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Evidence', paragraphs: [{ text: 'The migrated note and provenance note support a preservation rule: imported memory should explain why the source matters and where it came from.', citationIndexes: [1, 2], contradictionIndexes: [], support: 'supported' }], bullets: [] },
            { heading: 'Tensions', paragraphs: [{ text: 'The risk is migration decay, where old notes survive technically but lose value because they are not linked to current wiki claims.', citationIndexes: [3], contradictionIndexes: [1], support: 'conflicted' }], bullets: [] },
            { heading: 'Open Questions', paragraphs: [{ text: 'The page still needs examples of which migrated notes should trigger immediate wiki maintenance.', citationIndexes: [], contradictionIndexes: [], support: 'unsupported' }], bullets: [] }
          ]
        },
        maintenance: { summary: 'Updated Evernote migration memory from connector payload.', changelog: [{ type: 'merged_new_evidence', target: 'How It Works', summary: 'Merged Evernote connector event into migration-memory page.', sourceIndexes: [1, 2, 3] }], health: { newItems: [], unsupportedClaims: [{ text: 'Immediate maintenance examples still needed.', section: 'Open Questions' }], missingCitations: [], staleSections: [], contradictions: [{ text: 'Imported notes can decay into unlinked scraps.', sourceTitle: 'Migration decay', sourceIndexes: [3], section: 'Tensions' }], relatedPages: [] } },
        sourceIndexesUsed: [1, 2, 3]
      }
    ],
    expectations: {
      pages: [
        { requiredSourceObjectIds: connectorIngestionSourceIds.slice(0, 3).map(String), minClaims: 6, minCitedClaims: 5 },
        { requiredSourceObjectIds: [connectorIngestionSourceIds[3], connectorIngestionSourceIds[4], connectorIngestionSourceIds[5]].map(String), minClaims: 6, minCitedClaims: 5 },
        { requiredSourceObjectIds: connectorIngestionSourceIds.slice(6, 9).map(String), minClaims: 6, minCitedClaims: 5 }
      ],
      expectedProviders: ['notion', 'readwise', 'evernote'],
      expectedSourceTypes: ['notebook', 'highlight', 'notebook']
    }
  },
  {
    type: 'agent_proposal_mutation',
    name: 'bad_agent_cannot_force_create_for_existing_page_merge',
    library: {
      articles: [
        {
          _id: 'agent-tutor-source-1',
          title: 'AI tutors and adaptive feedback',
          url: 'https://learning.example.test/agent-ai-tutors',
          content: 'AI tutors can adapt feedback and hints to a learner.',
          highlights: [{ _id: 'agent-tutor-h1', text: 'AI tutors improve practice when feedback is adaptive.', tags: ['AI Tutors'] }]
        },
        {
          _id: 'agent-tutor-source-2',
          title: 'Tutor motivation and difficulty',
          url: 'https://learning.example.test/agent-tutor-motivation',
          content: 'Tutor motivation improves when challenge is calibrated.',
          highlights: [{ _id: 'agent-tutor-h2', text: 'AI tutors calibrate difficulty to preserve motivation.', tags: ['AI Tutors'] }]
        },
        {
          _id: 'agent-tutor-source-3',
          title: 'Feedback loops in tutoring',
          url: 'https://learning.example.test/agent-feedback-loops',
          content: 'Feedback loops help students correct the next attempt.',
          highlights: [{ _id: 'agent-tutor-h3', text: 'AI tutors depend on feedback loops.', tags: ['AI Tutors'] }]
        }
      ]
    },
    existingPages: [
      {
        _id: 'agent-existing-ai-tutors',
        title: 'AI Tutors',
        plainText: 'AI tutors use adaptive feedback, calibrated challenge, and feedback loops.'
      }
    ],
    agentDecision: {
      action: 'create_page',
      canonicalTitle: 'AI Tutor Growth Engine',
      qualityScore: 0.99,
      rationale: 'Bad agent tries to create a duplicate instead of merging.'
    },
    expectations: {
      expectedDecisionActions: [{ pattern: /tutor/i, action: 'merge_into_existing', status: 'merged' }],
      forbiddenActions: ['create_page']
    }
  },
  {
    type: 'negative_maintenance_quality',
    name: 'generic_source_dump_fails_quality_gate',
    page: {
      _id: new mongoose.Types.ObjectId(),
      userId: mutationUserId,
      title: 'Adaptive Learning',
      slug: 'adaptive-learning',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      plainText: '',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    library: {
      articles: [
        {
          _id: mutationSourceIds[0],
          title: 'Adaptive practice loops',
          content: 'Adaptive learning systems adjust practice based on learner performance and feedback timing.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: mutationSourceIds[1],
          title: 'Tutor motivation study',
          content: 'Student motivation can improve when tutoring systems give targeted feedback and maintain challenge at the right level.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: mutationSourceIds[2],
          title: 'Limits of personalization',
          content: 'Personalized learning can fail when the model optimizes engagement without checking durable understanding.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Adaptive Learning',
      article: {
        summary: {
          text: 'Adaptive Learning is important. These sources talk about adaptive learning. Adaptive Learning has many things to consider.',
          citationIndexes: [1],
          contradictionIndexes: [],
          support: 'partial'
        },
        sections: [
          {
            heading: 'Current Understanding',
            paragraphs: [
              {
                text: 'Adaptive practice loops contributes evidence for this page. (supported)',
                citationIndexes: [1],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'Why This Page Exists',
            paragraphs: [
              {
                text: 'Name: Tutor motivation study URL: https://example.test/tutor This page has been rebuilt from sources.',
                citationIndexes: [2],
                contradictionIndexes: [],
                support: 'partial'
              }
            ],
            bullets: []
          }
        ]
      },
      maintenance: {
        summary: 'Generic bad output fixture.',
        changelog: [{ type: 'merged_new_evidence', target: 'Page', summary: 'Bad generic source dump.', sourceIndexes: [1, 2] }],
        health: {
          newItems: [],
          unsupportedClaims: [],
          missingCitations: [],
          staleSections: [],
          contradictions: [],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2]
    }
  },
  {
    type: 'maintenance_quality',
    name: 'rich_learning_loop_page_passes_live_judge',
    page: {
      _id: new mongoose.Types.ObjectId(),
      userId: judgeUserId,
      title: 'Learning Loops',
      slug: 'learning-loops',
      pageType: 'topic',
      status: 'draft',
      visibility: 'private',
      sourceScope: 'entire_library',
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      plainText: '',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    },
    library: {
      articles: [
        {
          _id: judgeSourceIds[0],
          title: 'Feedback timing in adaptive practice',
          content: 'Learning loops improve when feedback arrives soon enough to change the next attempt. The learner needs a visible gap between current performance and the target behavior.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          _id: judgeSourceIds[1],
          title: 'Desirable difficulty and retention',
          content: 'Practice should be difficult enough to require retrieval and adjustment, but not so difficult that the learner cannot form a useful correction.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          _id: judgeSourceIds[2],
          title: 'Engagement metrics can mislead tutors',
          content: 'Optimizing a tutor for time on task or short-term engagement can produce shallow activity without durable understanding.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    },
    modelResult: {
      title: 'Learning Loops',
      article: {
        summary: {
          text: 'A learning loop is a repeated cycle in which a learner attempts a task, receives feedback, adjusts strategy, and tries again with a clearer target. The loop becomes useful when feedback is timely, the challenge level exposes a real gap, and the next attempt tests whether the correction changed performance.',
          citationIndexes: [1, 2],
          contradictionIndexes: [],
          support: 'supported'
        },
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              {
                text: 'The unit of progress is not exposure to content; it is the completed correction cycle. A learner has to see what went wrong, understand the target behavior, and make another attempt while the feedback is still actionable.',
                citationIndexes: [1],
                contradictionIndexes: [],
                support: 'partial'
              },
              {
                text: 'This makes learning loops especially useful for tutors and practice systems because the system can maintain the gap between current performance and the next reachable improvement.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'How It Works',
            paragraphs: [
              {
                text: 'A strong loop has four parts: an attempt that reveals the learner model, feedback that identifies the important gap, a revised strategy, and a follow-up attempt that checks whether the adjustment worked.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              },
              {
                text: 'The difficulty setting matters. If the task is too easy, the loop produces fluency without learning; if it is too hard, feedback cannot be converted into a usable next move.',
                citationIndexes: [2],
                contradictionIndexes: [],
                support: 'partial'
              }
            ],
            bullets: []
          },
          {
            heading: 'Evidence',
            paragraphs: [
              {
                text: 'The source set converges on a practical design rule: feedback timing and desirable difficulty work together. Timely feedback shows the error while the learner still remembers the attempt, and difficulty makes the correction meaningful instead of cosmetic.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              },
              {
                text: 'This is a stronger claim than saying practice helps. The evidence points to the structure of the practice cycle as the thing that determines whether repeated attempts become durable learning.',
                citationIndexes: [1, 2],
                contradictionIndexes: [],
                support: 'supported'
              }
            ],
            bullets: []
          },
          {
            heading: 'Tensions',
            paragraphs: [
              {
                text: 'The major tension is measurement. Engagement can make a loop look healthy even when the learner is only staying busy, so a tutor optimized for activity may weaken the correction cycle it is supposed to strengthen.',
                citationIndexes: [1, 2],
                contradictionIndexes: [3],
                support: 'conflicted'
              },
              {
                text: 'A useful wiki page should therefore separate learning evidence from engagement evidence. Time on task can support the loop only when it is tied to better follow-up attempts or retention.',
                citationIndexes: [2],
                contradictionIndexes: [3],
                support: 'conflicted'
              }
            ],
            bullets: []
          },
          {
            heading: 'Open Questions',
            paragraphs: [
              {
                text: 'The page still needs examples that distinguish healthy friction from discouraging difficulty, especially in domains where feedback is delayed or performance is hard to observe.',
                citationIndexes: [],
                contradictionIndexes: [],
                support: 'unsupported'
              },
              {
                text: 'It also needs a better test for when personalization improves the learning loop versus when it merely increases engagement with shallow tasks.',
                citationIndexes: [],
                contradictionIndexes: [],
                support: 'unsupported'
              }
            ],
            bullets: []
          }
        ]
      },
      maintenance: {
        summary: 'Built a synthesized wiki page that distinguishes learning loops from generic practice and flags engagement as a measurement tension.',
        changelog: [
          {
            type: 'merged_new_evidence',
            target: 'Evidence',
            summary: 'Integrated feedback timing, desirable difficulty, and engagement-metric caveats.',
            sourceIndexes: [1, 2, 3]
          }
        ],
        health: {
          newItems: [],
          unsupportedClaims: [
            { text: 'Healthy friction needs domain-specific examples.', section: 'Open Questions' },
            { text: 'Personalization needs tests beyond engagement.', section: 'Open Questions' }
          ],
          missingCitations: [],
          staleSections: [],
          contradictions: [
            { text: 'Engagement can misrepresent learning quality.', sourceTitle: 'Engagement metrics can mislead tutors', sourceIndexes: [3], section: 'Tensions' }
          ],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      judge: true,
      minWords: 220,
      minClaims: 10,
      minSupportedClaims: 8,
      minCitedClaims: 8,
      minGraphRows: 30
    }
  }
];

const createModel = (docs = []) => ({
  find: (query = {}) => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => docs.filter((doc) => {
      if (query.userId && doc.userId && normalizeId(doc.userId) !== normalizeId(query.userId)) return false;
      return true;
    })
  })
});

const makeHarnessWikiPageModel = () => {
  function HarnessWikiPage(payload = {}) {
    const page = new WikiPage(payload);
    page.save = async () => page;
    return page;
  }
  return HarnessWikiPage;
};

const makeProposal = (payload = {}) => {
  const proposal = {
    ...payload,
    save: async () => proposal
  };
  return proposal;
};

class HarnessQuery {
  constructor(value) {
    this.value = value;
  }

  sort() {
    return this;
  }

  limit() {
    return this;
  }

  lean() {
    return Promise.resolve(Array.isArray(this.value) ? this.value : this.value ? [this.value] : []);
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const attachHarnessSave = (doc) => {
  doc.save = async () => doc;
  return doc;
};

const normalizeId = (value) => String(value || '');

const matchesHarnessQuery = (record, query = {}) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(condition => matchesHarnessQuery(record, condition));
  if (value && typeof value === 'object' && value.$ne !== undefined) {
    const actual = record[key];
    if (Array.isArray(value.$ne) && Array.isArray(actual)) {
      return JSON.stringify(actual) !== JSON.stringify(value.$ne);
    }
    return actual !== value.$ne;
  }
  if (value && typeof value === 'object' && Array.isArray(value.$in)) {
    return value.$in.map(normalizeId).includes(normalizeId(record[key]));
  }
  if (value && typeof value === 'object' && value.$exists !== undefined) {
    const exists = record[key] !== undefined;
    return Boolean(value.$exists) === exists;
  }
  if (value && typeof value === 'object' && value.$lte !== undefined) {
    if (record[key] === undefined || record[key] === null) return false;
    return new Date(record[key]).getTime() <= new Date(value.$lte).getTime();
  }
  if (value instanceof RegExp) return value.test(String(record[key] || ''));
  return normalizeId(record[key]) === normalizeId(value);
});

const makePageModel = (pages = []) => {
  function HarnessPage(payload = {}) {
    const next = new WikiPage(payload);
    return attachHarnessSave(next);
  }
  HarnessPage.find = (query = {}) => new HarnessQuery(pages.filter(page => matchesHarnessQuery(page, query)));
  HarnessPage.findOne = async (query = {}) => pages.find(page => matchesHarnessQuery(page, query)) || null;
  return HarnessPage;
};

const makeEventModel = (event) => ({
  findOne: async (query = {}) => (event && matchesHarnessQuery(event, query) ? event : null),
  findOneAndUpdate: async (query = {}, updates = {}) => {
    if (!event || !matchesHarnessQuery(event, query)) return null;
    Object.assign(event, updates.$set || {});
    Object.entries(updates.$inc || {}).forEach(([key, amount]) => {
      event[key] = Number(event[key] || 0) + Number(amount || 0);
    });
    return event;
  }
});

const makeEventQueueModel = (events = []) => {
  function HarnessEvent(payload = {}) {
    const event = attachHarnessSave({
      _id: payload._id || new mongoose.Types.ObjectId(),
      status: 'pending',
      attemptCount: 0,
      createdAt: payload.createdAt || new Date('2026-05-09T12:00:00.000Z'),
      ...payload
    });
    const originalSave = event.save;
    event.save = async () => {
      if (!events.some(item => normalizeId(item._id) === normalizeId(event._id))) events.push(event);
      return originalSave();
    };
    return event;
  }
  HarnessEvent.events = events;
  HarnessEvent.findOne = async (query = {}) => events.find(event => matchesHarnessQuery(event, query)) || null;
  HarnessEvent.findOneAndUpdate = async (query = {}, updates = {}, options = {}) => {
    const at = new Date(updates.$set?.lockedAt || Date.now());
    const staleBefore = new Date(at.getTime() - 30 * 60 * 1000);
    const clockProviders = ['sec-edgar', 'fmp-transcripts'];
    const eligible = events
      .filter((item) => {
        if (!matchesHarnessQuery(item, query)) return false;
        if (['pending', 'failed'].includes(item.status)) {
          if (item.nextAttemptAt && new Date(item.nextAttemptAt) > at) return false;
          return true;
        }
        if (item.status === 'processing' && item.lockedAt) {
          return new Date(item.lockedAt).getTime() <= staleBefore.getTime();
        }
        return false;
      })
      .sort((a, b) => {
        const aClock = clockProviders.includes(a.provider) && Array.isArray(a.affectedPageIds) && a.affectedPageIds.length ? 0 : 1;
        const bClock = clockProviders.includes(b.provider) && Array.isArray(b.affectedPageIds) && b.affectedPageIds.length ? 0 : 1;
        if (aClock !== bClock) return aClock - bClock;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });
    const event = eligible[0] || null;
    if (!event) return null;
    Object.assign(event, updates.$set || {});
    if (updates.$inc) {
      Object.entries(updates.$inc).forEach(([key, value]) => {
        event[key] = Number(event[key] || 0) + Number(value || 0);
      });
    }
    return event;
  };
  HarnessEvent.distinct = async (field, query = {}) => [...new Set(events
    .filter(event => matchesHarnessQuery(event, query))
    .map(event => normalizeId(event[field]))
    .filter(Boolean))];
  return HarnessEvent;
};

const makeRevisionModel = () => function HarnessRevision(payload = {}) {
  return attachHarnessSave({ _id: new mongoose.Types.ObjectId(), ...payload });
};

const makeMaintenanceRunModel = () => function HarnessMaintenanceRun(payload = {}) {
  return attachHarnessSave({ _id: new mongoose.Types.ObjectId(), ...payload });
};

const makeConnectionModel = () => ({
  records: [],
  deleteMany: async () => ({ deletedCount: 0 }),
  findOneAndUpdate: async function findOneAndUpdate(query = {}, updates = {}) {
    const record = { ...(updates.$setOnInsert || {}), ...(updates.$set || {}), ...query };
    this.records.push(record);
    return record;
  }
});

const extractHeadings = (node) => {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(extractHeadings);
  if (typeof node !== 'object') return [];
  const own = node.type === 'heading' ? [toPlainText(node)] : [];
  return [...own, ...extractHeadings(node.content)].filter(Boolean);
};

const normalizeHeadingSignature = (headings = []) => headings
  .map(heading => String(heading || '').trim())
  .filter(Boolean)
  .join(' > ');

const extractJsonObject = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch (__error) {
        return null;
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (__error) {
        return null;
      }
    }
  }
  return null;
};

const clampScore = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
};

const normalizeJudgeResult = (raw = {}) => {
  const scores = raw && typeof raw.scores === 'object' && !Array.isArray(raw.scores)
    ? raw.scores
    : {};
  const normalizedScores = {
    relevance: clampScore(scores.relevance),
    synthesis: clampScore(scores.synthesis),
    sourceUse: clampScore(scores.sourceUse),
    structure: clampScore(scores.structure),
    claims: clampScore(scores.claims),
    usefulness: clampScore(scores.usefulness)
  };
  const overall = clampScore(raw.overall || (
    Object.values(normalizedScores).reduce((sum, score) => sum + score, 0) / Object.keys(normalizedScores).length
  ));
  return {
    overall,
    scores: normalizedScores,
    verdict: String(raw.verdict || '').toLowerCase() === 'pass' ? 'pass' : 'fail',
    failures: Array.isArray(raw.failures)
      ? raw.failures.map(failure => String(failure || '').trim()).filter(Boolean).slice(0, 8)
      : []
  };
};

const sourceBriefForJudge = (page = {}) => (page.sourceRefs || [])
  .slice(0, 8)
  .map((source, index) => `${index + 1}. ${source.title || 'Untitled source'} - ${source.snippet || source.url || source.type || 'No snippet'}`)
  .join('\n');

const claimBriefForJudge = (page = {}) => (page.claims || [])
  .slice(0, 12)
  .map((claim, index) => {
    const citationCount = (claim.citationIds || []).length + (claim.sourceRefIds || []).length;
    const contradictionCount = (claim.contradictedByCitationIds || []).length;
    return `${index + 1}. [${claim.section || 'Unknown'}] ${claim.support || 'unknown'} citations=${citationCount} contradictions=${contradictionCount}: ${claim.text || ''}`;
  })
  .join('\n');

const buildJudgePrompt = ({ page, quality }) => `Grade this generated personal wiki page as a strict editor.

Fail mediocre pages. The page must synthesize sources into a useful maintained wiki article, not merely be valid prose.
This editor stores citations in structured claim metadata, so the page prose may not display bracketed citations. Use the source refs and claim metadata below when grading source use.

Rubric dimensions, each 0..1:
- relevance: stays on the actual concept
- synthesis: combines sources into insight instead of pasted fragments
- sourceUse: source-backed without dumping titles, URLs, or metadata
- structure: durable wiki sections with definition, mechanism, evidence, tensions, and open questions
- claims: specific, checkable claims rather than generic filler
- usefulness: helps the user understand or maintain the concept

Return strict JSON only:
{
  "overall": 0.0,
  "scores": {
    "relevance": 0.0,
    "synthesis": 0.0,
    "sourceUse": 0.0,
    "structure": 0.0,
    "claims": 0.0,
    "usefulness": 0.0
  },
  "verdict": "pass|fail",
  "failures": ["short reason"]
}

Page title: ${page.title}
Sections: ${quality.headingSignature}
Claim count: ${quality.claimCount}
Cited claim count: ${quality.citedClaimCount}
Source count: ${quality.sourceRefCount}
Sources:
${sourceBriefForJudge(page) || 'No sources'}

Claims:
${claimBriefForJudge(page) || 'No claims'}

Page text:
${quality.plainText.slice(0, 5000)}`;

const judgePageQuality = async ({
  page,
  quality,
  label,
  chat = chatComplete,
  isConfigured = isTextGenerationConfigured,
  requireJudge = false
} = {}) => {
  if (!isConfigured || !isConfigured()) {
    return {
      skipped: true,
      ok: !requireJudge,
      failures: requireJudge ? [`${label}: HF judge requested but HF_TOKEN is not configured.`] : []
    };
  }
  try {
    const completion = await chat({
      route: 'critique',
      maxTokens: 650,
      temperature: 0.1,
      reasoningEffort: 'low',
      responseFormat: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a strict wiki quality evaluator. Return valid JSON only. Fail mediocre pages.'
        },
        {
          role: 'user',
          content: buildJudgePrompt({ page, quality })
        }
      ]
    });
    const parsed = extractJsonObject(completion?.text || completion || '');
    if (!parsed) {
      return { ok: false, failures: [`${label}: judge returned non-JSON output.`] };
    }
    const normalized = normalizeJudgeResult(parsed);
    const failures = [];
    if (normalized.verdict !== 'pass') failures.push(`${label}: judge verdict was fail.`);
    if (normalized.overall < JUDGE_MIN_OVERALL) {
      failures.push(`${label}: judge overall ${normalized.overall.toFixed(2)} below ${JUDGE_MIN_OVERALL}.`);
    }
    Object.entries(normalized.scores).forEach(([dimension, score]) => {
      if (score < JUDGE_MIN_DIMENSION) failures.push(`${label}: judge ${dimension} ${score.toFixed(2)} below ${JUDGE_MIN_DIMENSION}.`);
    });
    normalized.failures.forEach(reason => failures.push(`${label}: judge reason: ${reason}`));
    return {
      ...normalized,
      ok: failures.length === 0,
      failures,
      model: completion?.provider ? `${completion.model}:${completion.provider}` : completion?.model || ''
    };
  } catch (error) {
    return {
      ok: false,
      failures: [`${label}: judge failed: ${error.message || error}`]
    };
  }
};

const evaluatePageQuality = ({ page, label, expectations = {} }) => {
  const failures = [];
  const plainText = toPlainText(page.body || page.plainText || '');
  const headings = extractHeadings(page.body);
  const bodyTextWithoutHeading = plainText.replace(new RegExp(`^${page.title}\\s*`, 'i'), '').trim();
  const claims = Array.isArray(page.claims) ? page.claims : [];
  const supportedClaims = claims.filter(claim => ['supported', 'partial', 'conflicted'].includes(claim.support));
  const citedClaims = claims.filter(claim => (claim.citationIds || []).length || (claim.sourceRefIds || []).length);
  const graphRows = buildWikiPageGraphRows({ page, userId: page.userId || 'user-1' });
  const sourceRefs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  const citations = Array.isArray(page.citations) ? page.citations : [];
  const citationById = new Map(citations.map(citation => [String(citation._id || citation.id || citation.sourceRefId || ''), citation]));
  const claimCitationObjectIds = claims
    .flatMap(claim => [...(claim.citationIds || []), ...(claim.contradictedByCitationIds || [])])
    .map(id => citationById.get(String(id))?.sourceObjectId)
    .filter(Boolean)
    .map(String);

  const minWords = Number(expectations.minWords || 120);
  const minSourceRefs = Number(expectations.minSourceRefs || 3);
  const minCitations = Number(expectations.minCitations || 3);
  const minClaims = Number(expectations.minClaims || 6);
  const minSupportedClaims = Number(expectations.minSupportedClaims || 4);
  const minCitedClaims = Number(expectations.minCitedClaims || 4);
  const minGraphRows = Number(expectations.minGraphRows || 15);

  if (bodyTextWithoutHeading.split(/\s+/).filter(Boolean).length < minWords) {
    failures.push(`${label}: expected article body to contain at least ${minWords} words.`);
  }
  (expectations.requiredHeadings || requiredHeadings).forEach((heading) => {
    if (!headings.includes(heading)) failures.push(`${label}: missing required heading "${heading}".`);
  });
  forbiddenPatterns.forEach(({ label: patternLabel, pattern }) => {
    if (pattern.test(plainText)) failures.push(`${label}: leaked ${patternLabel}.`);
  });
  if (plainText.includes('Starter claim should not survive') || plainText.includes('Starter question should be replaced')) {
    failures.push(`${label}: proposal starter scaffold survived maintenance.`);
  }
  if (sourceRefs.length < minSourceRefs) {
    failures.push(`${label}: expected at least ${minSourceRefs} maintained source refs, got ${sourceRefs.length}.`);
  }
  if (citations.length < minCitations) {
    failures.push(`${label}: expected at least ${minCitations} citations, got ${citations.length}.`);
  }
  if (claims.length < minClaims) {
    failures.push(`${label}: expected at least ${minClaims} claims, got ${claims.length}.`);
  }
  if (supportedClaims.length < minSupportedClaims) {
    failures.push(`${label}: expected at least ${minSupportedClaims} supported/partial/conflicted claims, got ${supportedClaims.length}.`);
  }
  if (citedClaims.length < minCitedClaims) {
    failures.push(`${label}: expected at least ${minCitedClaims} claims with durable citation/source ids, got ${citedClaims.length}.`);
  }
  if (!claims.some(claim => claim.section === 'Tensions' && claim.support === 'conflicted' && (claim.contradictedByCitationIds || []).length)) {
    failures.push(`${label}: expected a conflicted Tensions claim with contradiction evidence.`);
  }
  if (!claims.some(claim => claim.section === 'Open Questions' && claim.support === 'unsupported')) {
    failures.push(`${label}: expected an unsupported Open Questions claim instead of pretending every gap is solved.`);
  }
  if (!page.aiState?.maintenanceSummary) {
    failures.push(`${label}: expected maintenance summary.`);
  }
  if (!Array.isArray(page.aiState?.changeLog) || page.aiState.changeLog.length < 1) {
    failures.push(`${label}: expected at least one changelog entry.`);
  }
  if (graphRows.length < minGraphRows) {
    failures.push(`${label}: expected at least ${minGraphRows} graph evidence rows, got ${graphRows.length}.`);
  }
  (expectations.requiredSourceObjectIds || []).forEach((objectId) => {
    if (!sourceRefs.some(source => String(source.objectId || '') === String(objectId))) {
      failures.push(`${label}: missing required source object ${objectId}.`);
    }
  });
  if (expectations.expectedFirstSourceObjectId && String(sourceRefs[0]?.objectId || '') !== String(expectations.expectedFirstSourceObjectId)) {
    failures.push(`${label}: expected first source object ${expectations.expectedFirstSourceObjectId}, got ${sourceRefs[0]?.objectId || 'none'}.`);
  }
  (expectations.forbiddenClaimCitationObjectIds || []).forEach((objectId) => {
    if (claimCitationObjectIds.includes(String(objectId))) {
      failures.push(`${label}: stale source object ${objectId} is still attached to a claim citation.`);
    }
  });

  return {
    ok: failures.length === 0,
    failures,
    plainText,
    headings,
    headingSignature: normalizeHeadingSignature(headings),
    claimCount: claims.length,
    citedClaimCount: citedClaims.length,
    sourceRefCount: (page.sourceRefs || []).length,
    citationCount: (page.citations || []).length,
    graphRowCount: graphRows.length,
    sourceObjectIds: sourceRefs.map(source => String(source.objectId || '')).filter(Boolean)
  };
};

const buildModels = (fixture) => ({
  Article: createModel(fixture.library?.articles || []),
  NotebookEntry: createModel(fixture.library?.notebooks || []),
  TagMeta: createModel(fixture.library?.concepts || []),
  Question: createModel(fixture.library?.questions || [])
});

const maintainWithFixtureModel = async ({ page, fixture }) => {
  await maintainWikiPage({
    page,
    userId: fixture.proposal?.userId || page.userId,
    models: {
      ...buildModels(fixture),
      // Keep direct fixture maintenance off the real Mongoose model. Source
      // event fixtures provide their own page model and must retain it.
      WikiPage: createModel([])
    },
    isConfigured: () => true,
    chat: async () => ({
      text: JSON.stringify(fixture.modelResult),
      model: 'fixture-wiki-intelligence',
      provider: 'deterministic'
    }),
    now: new Date('2026-05-09T12:00:00.000Z')
  });
  return page;
};

const maybeJudgeQuality = async ({ page, quality, label, fixture, options = {} }) => {
  if (!options.includeJudge) return null;
  if (!options.judgeAll && fixture?.expectations?.judge !== true) return null;
  const judge = await judgePageQuality({
    page,
    quality,
    label,
    requireJudge: options.requireJudge
  });
  quality.judge = judge;
  return judge;
};

const evaluateParityFixture = async (fixture, options = {}) => {
  const failures = [];
  const WikiPageModel = makeHarnessWikiPageModel();
  const proposal = makeProposal(fixture.proposal);
  const createdPage = await createDraftPageFromProposal({
    proposal,
    WikiPage: WikiPageModel,
    buildUniqueSlug: async () => 'complementary-machine-thing'
  });
  await maintainWithFixtureModel({ page: createdPage, fixture });

  const directPage = new WikiPage({
    userId: fixture.proposal.userId,
    title: fixture.proposal.title,
    slug: 'complementary-machine-thing-direct',
    pageType: 'topic',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'entire_library',
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    plainText: '',
    sourceRefs: [],
    claims: [],
    citations: [],
    aiState: {}
  });
  await maintainWithFixtureModel({ page: directPage, fixture });

  const createQuality = evaluatePageQuality({ page: createdPage, label: 'proposal create', expectations: fixture.expectations || {} });
  const maintainQuality = evaluatePageQuality({ page: directPage, label: 'direct maintain', expectations: fixture.expectations || {} });
  failures.push(...createQuality.failures, ...maintainQuality.failures);
  const createJudge = await maybeJudgeQuality({ page: createdPage, quality: createQuality, label: 'proposal create', fixture, options });
  const maintainJudge = await maybeJudgeQuality({ page: directPage, quality: maintainQuality, label: 'direct maintain', fixture, options });
  if (createJudge && !createJudge.ok) failures.push(...createJudge.failures);
  if (maintainJudge && !maintainJudge.ok) failures.push(...maintainJudge.failures);

  if (createQuality.headingSignature !== maintainQuality.headingSignature) {
    failures.push(`Create and Maintain section shapes diverged: "${createQuality.headingSignature}" vs "${maintainQuality.headingSignature}".`);
  }
  if (createQuality.claimCount < maintainQuality.claimCount) {
    failures.push(`Create produced fewer claims than Maintain: ${createQuality.claimCount} vs ${maintainQuality.claimCount}.`);
  }
  if (createQuality.citedClaimCount < maintainQuality.citedClaimCount) {
    failures.push(`Create produced fewer cited claims than Maintain: ${createQuality.citedClaimCount} vs ${maintainQuality.citedClaimCount}.`);
  }
  if (createQuality.graphRowCount < maintainQuality.graphRowCount) {
    failures.push(`Create produced fewer graph rows than Maintain: ${createQuality.graphRowCount} vs ${maintainQuality.graphRowCount}.`);
  }
  if (createQuality.sourceRefCount !== maintainQuality.sourceRefCount) {
    failures.push(`Create and Maintain source ref counts diverged: ${createQuality.sourceRefCount} vs ${maintainQuality.sourceRefCount}.`);
  }

  return {
    name: fixture.name,
    type: fixture.type || 'parity',
    ok: failures.length === 0,
    failures,
    create: createQuality,
    maintain: maintainQuality
  };
};

const evaluateMaintenanceQualityFixture = async (fixture, options = {}) => {
  const page = new WikiPage(JSON.parse(JSON.stringify(fixture.page)));
  await maintainWithFixtureModel({ page, fixture });
  const quality = evaluatePageQuality({ page, label: 'maintenance', expectations: fixture.expectations || {} });
  const judge = await maybeJudgeQuality({ page, quality, label: 'maintenance', fixture, options });
  const failures = [...quality.failures];
  if (judge && !judge.ok) failures.push(...judge.failures);
  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    maintain: quality
  };
};

const evaluateNegativeMaintenanceQualityFixture = async (fixture) => {
  const page = new WikiPage(JSON.parse(JSON.stringify(fixture.page)));
  await maintainWithFixtureModel({ page, fixture });
  const quality = evaluatePageQuality({ page, label: 'negative maintenance', expectations: fixture.expectations || {} });
  const expectedFailures = quality.failures;
  const failures = quality.ok
    ? ['Expected bad generic output to fail the wiki quality gate, but it passed.']
    : [];
  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    expectedFailures,
    maintain: quality
  };
};

const evaluateSourceEventUpdateFixture = async (fixture, options = {}) => {
  const rawPages = fixture.pages || [fixture.page];
  const pages = rawPages.map(page => attachHarnessSave(new WikiPage(JSON.parse(JSON.stringify(page)))));
  const [page] = pages;
  const event = attachHarnessSave({
    ...JSON.parse(JSON.stringify(fixture.sourceEvent)),
    affectedPageIds: pages.map(item => item._id)
  });
  const Connection = makeConnectionModel();
  let maintainCallIndex = 0;

  const result = await processWikiSourceEvent({
    sourceEvent: event,
    userId: event.userId,
    models: {
      WikiSourceEvent: makeEventModel(event),
      WikiPage: makePageModel(pages),
      WikiRevision: makeRevisionModel(),
      WikiMaintenanceRun: makeMaintenanceRunModel(),
      WikiProposal: null,
      Connection,
      ...buildModels(fixture)
    },
    maintainWikiPageFn: async ({ page: targetPage, userId, models, trigger }) => {
      const modelResult = Array.isArray(fixture.modelResults)
        ? fixture.modelResults[maintainCallIndex] || fixture.modelResults[fixture.modelResults.length - 1]
        : fixture.modelResult;
      maintainCallIndex += 1;
      await maintainWikiPage({
        page: targetPage,
        userId,
        models: { ...models, WikiPage: createModel([]) },
        trigger,
        isConfigured: () => true,
        chat: async () => ({
          text: JSON.stringify(modelResult),
          model: 'fixture-wiki-source-event',
          provider: 'deterministic'
        }),
        now: new Date('2026-05-09T12:00:00.000Z')
      });
    }
  });

  const qualities = pages.map((item, index) => evaluatePageQuality({
    page: item,
    label: pages.length > 1 ? `source event page ${index + 1}` : 'source event maintenance',
    expectations: Array.isArray(fixture.expectations?.pages)
      ? fixture.expectations.pages[index] || fixture.expectations
      : fixture.expectations || {}
  }));
  const failures = qualities.flatMap(quality => quality.failures);
  for (let index = 0; index < qualities.length; index += 1) {
    const quality = qualities[index];
    const judge = await maybeJudgeQuality({ page: pages[index], quality, label: `source event page ${index + 1}`, fixture, options });
    if (judge && !judge.ok) failures.push(...judge.failures);
  }
  if (result.event.status !== 'processed') failures.push(`Expected source event to be processed, got ${result.event.status}.`);
  pages.forEach((item, index) => {
    if (item.freshness?.status !== 'conflicted' && item.freshness?.status !== 'fresh') {
      failures.push(`Expected page ${index + 1} freshness to be fresh or conflicted, got ${item.freshness?.status || 'none'}.`);
    }
    if (!item.freshness?.lastMaintainedAt) failures.push(`Expected source event maintenance to stamp lastMaintainedAt for page ${index + 1}.`);
  });
  if (result.pages.length !== pages.length) failures.push(`Expected ${pages.length} updated page(s), got ${result.pages.length}.`);
  if (!Connection.records.length) failures.push('Expected source event maintenance to sync graph connections.');

  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    maintain: qualities[0],
    maintainedPages: qualities,
    sourceEvent: {
      status: result.event.status,
      provider: result.event.provider || '',
      pages: result.pages.length,
      graphRows: Connection.records.length
    }
  };
};

const runSourceEventMaintenance = async ({ fixture, pages, event, useQueue = false }) => {
  const Connection = makeConnectionModel();
  let maintainCallIndex = 0;
  const models = {
    WikiSourceEvent: useQueue ? makeEventQueueModel([event]) : makeEventModel(event),
    WikiPage: makePageModel(pages),
    WikiRevision: makeRevisionModel(),
    WikiMaintenanceRun: makeMaintenanceRunModel(),
    WikiProposal: null,
    Connection,
    ...buildModels(fixture)
  };
  const maintainWikiPageFn = async ({ page: targetPage, userId, models: maintenanceModels, trigger }) => {
    if (fixture.maintenanceErrorMessage) throw new Error(fixture.maintenanceErrorMessage);
    const modelResult = Array.isArray(fixture.modelResults)
      ? fixture.modelResults[maintainCallIndex] || fixture.modelResults[fixture.modelResults.length - 1]
      : fixture.modelResult;
    maintainCallIndex += 1;
    await maintainWikiPage({
      page: targetPage,
      userId,
      models: { ...maintenanceModels, WikiPage: createModel([]) },
      trigger,
      isConfigured: () => true,
      chat: async () => ({
        text: JSON.stringify(modelResult),
        model: useQueue ? 'fixture-wiki-source-event-queue' : 'fixture-wiki-source-event',
        provider: 'deterministic'
      }),
      now: new Date('2026-05-09T12:00:00.000Z')
    });
  };
  if (useQueue) {
    const results = await processPendingWikiSourceEventsFromWorker({
      userId: event.userId,
      models,
      limit: 5,
      processWikiSourceEventFn: args => processWikiSourceEvent({ ...args, maintainWikiPageFn })
    });
    return { result: results[0] || { event, pages: [] }, Connection, results };
  }
  const result = await processWikiSourceEvent({
    sourceEvent: event,
    userId: event.userId,
    models,
    maintainWikiPageFn
  });
  return { result, Connection, results: [result] };
};

const evaluateSourceEventQueueFixture = async (fixture, options = {}) => {
  const rawPages = fixture.pages || [fixture.page];
  const pages = rawPages.map(page => attachHarnessSave(new WikiPage(JSON.parse(JSON.stringify(page)))));
  const event = attachHarnessSave({
    ...JSON.parse(JSON.stringify(fixture.sourceEvent)),
    affectedPageIds: pages.map(item => item._id)
  });
  const { result, Connection, results } = await runSourceEventMaintenance({ fixture, pages, event, useQueue: true });
  const qualities = pages.map((item, index) => evaluatePageQuality({
    page: item,
    label: pages.length > 1 ? `queued source event page ${index + 1}` : 'queued source event maintenance',
    expectations: Array.isArray(fixture.expectations?.pages)
      ? fixture.expectations.pages[index] || fixture.expectations
      : fixture.expectations || {}
  }));
  const failures = qualities.flatMap(quality => quality.failures);
  for (let index = 0; index < qualities.length; index += 1) {
    const judge = await maybeJudgeQuality({ page: pages[index], quality: qualities[index], label: `queued source event page ${index + 1}`, fixture, options });
    if (judge && !judge.ok) failures.push(...judge.failures);
  }
  if (results.length !== 1) failures.push(`Expected queue to process 1 event, got ${results.length}.`);
  if (result.error) failures.push(`Expected queued source event to process without error, got ${result.error}.`);
  if (event.attemptCount !== 1) failures.push(`Expected queue claim to increment attemptCount to 1, got ${event.attemptCount || 0}.`);
  if (event.status !== 'processed') failures.push(`Expected queued event to be processed, got ${event.status}.`);
  if (result.pages?.length !== pages.length) failures.push(`Expected ${pages.length} updated page(s), got ${result.pages?.length || 0}.`);
  if (!Connection.records.length) failures.push('Expected queued source event maintenance to sync graph connections.');

  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    maintain: qualities[0],
    maintainedPages: qualities,
    sourceEvent: {
      status: event.status,
      provider: event.provider || '',
      pages: result.pages?.length || 0,
      graphRows: Connection.records.length
    }
  };
};

const evaluateSourceEventQueueDrainFixture = async (fixture, options = {}) => {
  const pages = (fixture.pages || []).map(page => attachHarnessSave(new WikiPage(JSON.parse(JSON.stringify(page)))));
  const pageById = new Map(pages.map(page => [normalizeId(page._id), page]));
  const events = (fixture.sourceEvents || []).map(event => attachHarnessSave({
    ...JSON.parse(JSON.stringify(event)),
    affectedPageIds: (event.affectedPageIds || []).map(id => normalizeId(id))
  }));
  const Connection = makeConnectionModel();
  let maintainCallIndex = 0;
  const models = {
    WikiSourceEvent: makeEventQueueModel(events),
    WikiPage: makePageModel(pages),
    WikiRevision: makeRevisionModel(),
    WikiMaintenanceRun: makeMaintenanceRunModel(),
    WikiProposal: null,
    Connection,
    ...buildModels(fixture)
  };
  const maintainWikiPageFn = async ({ page: targetPage, userId, models: maintenanceModels, trigger }) => {
    const titleIndex = pages.findIndex(page => normalizeId(page._id) === normalizeId(targetPage._id));
    const modelResult = fixture.modelResults?.[titleIndex >= 0 ? titleIndex : maintainCallIndex]
      || fixture.modelResults?.[maintainCallIndex]
      || fixture.modelResults?.[fixture.modelResults.length - 1];
    maintainCallIndex += 1;
    await maintainWikiPage({
      page: targetPage,
      userId,
      models: { ...maintenanceModels, WikiPage: createModel([]) },
      trigger,
      isConfigured: () => true,
      chat: async () => ({
        text: JSON.stringify(modelResult),
        model: 'fixture-wiki-source-event-drain',
        provider: 'deterministic'
      }),
      now: new Date('2026-05-09T12:00:00.000Z')
    });
  };

  const drain = await drainWikiSourceEventQueue({
    models,
    limit: events.length,
    perUserLimit: 1,
    processWikiSourceEventFn: args => processWikiSourceEvent({ ...args, maintainWikiPageFn })
  });
  const failures = [];
  if (drain.processed !== events.length) failures.push(`Expected drain to process ${events.length} events, got ${drain.processed}.`);
  if (drain.failed !== 0) failures.push(`Expected drain to have 0 failures, got ${drain.failed}.`);
  if (drain.results.length !== events.length) failures.push(`Expected drain to return ${events.length} results, got ${drain.results.length}.`);
  events.forEach((event, index) => {
    if (event.status !== 'processed') failures.push(`Expected drained event ${index + 1} to be processed, got ${event.status}.`);
    if (event.attemptCount !== 1) failures.push(`Expected drained event ${index + 1} attemptCount to be 1, got ${event.attemptCount || 0}.`);
    const affectedIds = (event.affectedPageIds || []).map(normalizeId);
    if (!affectedIds.some(id => pageById.has(id))) failures.push(`Expected drained event ${index + 1} to retain affected page ids.`);
  });

  const qualities = pages.map((item, index) => evaluatePageQuality({
    page: item,
    label: `drained source event page ${index + 1}`,
    expectations: Array.isArray(fixture.expectations?.pages)
      ? fixture.expectations.pages[index] || fixture.expectations
      : fixture.expectations || {}
  }));
  failures.push(...qualities.flatMap(quality => quality.failures));
  for (let index = 0; index < qualities.length; index += 1) {
    const judge = await maybeJudgeQuality({ page: pages[index], quality: qualities[index], label: `drained source event page ${index + 1}`, fixture, options });
    if (judge && !judge.ok) failures.push(...judge.failures);
  }
  pages.forEach((page, index) => {
    if (page.freshness?.status !== 'fresh' && page.freshness?.status !== 'conflicted') {
      failures.push(`Expected drained page ${index + 1} freshness to be fresh or conflicted, got ${page.freshness?.status || 'none'}.`);
    }
  });
  if (!Connection.records.length) failures.push('Expected drained source event maintenance to sync graph connections.');

  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    maintain: qualities[0],
    maintainedPages: qualities,
    sourceEvent: {
      status: 'drained',
      provider: 'queue',
      pages: pages.length,
      processed: drain.processed,
      failed: drain.failed,
      graphRows: Connection.records.length
    }
  };
};

const evaluateSourceEventQueueFailureFixture = async (fixture) => {
  const page = attachHarnessSave(new WikiPage(JSON.parse(JSON.stringify(fixture.page))));
  const event = attachHarnessSave({
    ...JSON.parse(JSON.stringify(fixture.sourceEvent)),
    affectedPageIds: [page._id]
  });
  const beforePlainText = page.plainText;
  const { result, Connection, results } = await runSourceEventMaintenance({
    fixture,
    pages: [page],
    event,
    useQueue: true
  });
  const failures = [];
  if (results.length !== 1) failures.push(`Expected retry queue to process 1 failed event, got ${results.length}.`);
  if (!result.error) failures.push('Expected retry queue processing to surface an error.');
  if (fixture.expectations?.expectedError && !fixture.expectations.expectedError.test(String(result.error || ''))) {
    failures.push(`Expected retry error to match ${fixture.expectations.expectedError}, got ${result.error || 'none'}.`);
  }
  if (event.status !== 'failed') failures.push(`Expected failed event to remain failed after maintenance error, got ${event.status}.`);
  if (event.attemptCount !== 2) failures.push(`Expected failed event attemptCount to increment to 2, got ${event.attemptCount || 0}.`);
  if (!event.nextAttemptAt) failures.push('Expected failed event to receive a nextAttemptAt retry time.');
  if (event.lockedAt !== null) failures.push('Expected failed event lock to be released.');
  if (page.plainText !== beforePlainText) failures.push('Expected failed maintenance not to rewrite the page.');
  if (Connection.records.length) failures.push('Expected failed maintenance not to sync graph connections.');

  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    sourceEvent: {
      status: event.status,
      provider: event.provider || 'queue',
      pages: 0,
      graphRows: Connection.records.length,
      attempts: event.attemptCount || 0,
      error: result.error || '',
      nextAttemptAt: event.nextAttemptAt || null
    }
  };
};

const evaluateConnectorIngestionQueueFixture = async (fixture, options = {}) => {
  const pages = (fixture.pages || []).map(page => attachHarnessSave(new WikiPage(JSON.parse(JSON.stringify(page)))));
  const events = [];
  const EventModel = makeEventQueueModel(events);
  const createdEvents = [];
  for (const item of fixture.connectorPayloads || []) {
    const event = await createConnectorWikiSourceEvent({
      WikiSourceEvent: EventModel,
      userId: connectorIngestionUserId,
      provider: item.provider,
      payload: item.payload,
      sourceObjectId: item.sourceObjectId,
      parentObjectId: item.parentObjectId,
      affectedPageIds: item.affectedPageIds,
      metadata: item.metadata || {}
    });
    if (event) createdEvents.push(event);
  }

  const Connection = makeConnectionModel();
  let maintainCallIndex = 0;
  const models = {
    WikiSourceEvent: EventModel,
    WikiPage: makePageModel(pages),
    WikiRevision: makeRevisionModel(),
    WikiMaintenanceRun: makeMaintenanceRunModel(),
    WikiProposal: null,
    Connection,
    ...buildModels(fixture)
  };
  const maintainWikiPageFn = async ({ page: targetPage, userId, models: maintenanceModels, trigger }) => {
    const pageIndex = pages.findIndex(page => normalizeId(page._id) === normalizeId(targetPage._id));
    const modelResult = fixture.modelResults?.[pageIndex >= 0 ? pageIndex : maintainCallIndex]
      || fixture.modelResults?.[maintainCallIndex]
      || fixture.modelResults?.[fixture.modelResults.length - 1];
    maintainCallIndex += 1;
    await maintainWikiPage({
      page: targetPage,
      userId,
      models: { ...maintenanceModels, WikiPage: createModel([]) },
      trigger,
      isConfigured: () => true,
      chat: async () => ({
        text: JSON.stringify(modelResult),
        model: 'fixture-connector-ingestion-queue',
        provider: 'deterministic'
      }),
      now: new Date('2026-05-09T13:00:00.000Z')
    });
  };

  const drain = await drainWikiSourceEventQueue({
    models,
    limit: createdEvents.length,
    perUserLimit: createdEvents.length,
    processWikiSourceEventFn: args => processWikiSourceEvent({ ...args, maintainWikiPageFn })
  });

  const failures = [];
  if (createdEvents.length !== (fixture.connectorPayloads || []).length) {
    failures.push(`Expected ${fixture.connectorPayloads.length} connector payloads to create queue events, got ${createdEvents.length}.`);
  }
  if (drain.processed !== createdEvents.length) failures.push(`Expected connector queue to process ${createdEvents.length} events, got ${drain.processed}.`);
  if (drain.failed !== 0) failures.push(`Expected connector queue to have 0 failures, got ${drain.failed}.`);
  (fixture.expectations?.expectedProviders || []).forEach((provider) => {
    if (!createdEvents.some(event => event.provider === provider)) failures.push(`Expected connector event provider ${provider}.`);
  });
  (fixture.expectations?.expectedSourceTypes || []).forEach((sourceType, index) => {
    if (createdEvents[index]?.sourceType !== sourceType) {
      failures.push(`Expected connector event ${index + 1} sourceType ${sourceType}, got ${createdEvents[index]?.sourceType || 'none'}.`);
    }
  });
  createdEvents.forEach((event, index) => {
    if (event.status !== 'processed') failures.push(`Expected connector event ${index + 1} to be processed, got ${event.status}.`);
    if (!event.externalId) failures.push(`Expected connector event ${index + 1} to preserve externalId.`);
    if (!event.text && !event.summary) failures.push(`Expected connector event ${index + 1} to preserve source text or summary.`);
    if (event.attemptCount !== 1) failures.push(`Expected connector event ${index + 1} attemptCount to be 1, got ${event.attemptCount || 0}.`);
  });

  const qualities = pages.map((item, index) => evaluatePageQuality({
    page: item,
    label: `connector ingestion page ${index + 1}`,
    expectations: Array.isArray(fixture.expectations?.pages)
      ? fixture.expectations.pages[index] || fixture.expectations
      : fixture.expectations || {}
  }));
  failures.push(...qualities.flatMap(quality => quality.failures));
  for (let index = 0; index < qualities.length; index += 1) {
    const judge = await maybeJudgeQuality({ page: pages[index], quality: qualities[index], label: `connector ingestion page ${index + 1}`, fixture, options });
    if (judge && !judge.ok) failures.push(...judge.failures);
  }
  if (!Connection.records.length) failures.push('Expected connector ingestion maintenance to sync graph connections.');

  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    maintain: qualities[0],
    maintainedPages: qualities,
    sourceEvent: {
      status: 'processed',
      provider: createdEvents.map(event => event.provider).join(','),
      pages: pages.length,
      graphRows: Connection.records.length
    }
  };
};

const visibleProposals = (proposals = []) => proposals.filter(proposal => ['pending', 'watched'].includes(String(proposal.status || 'pending')));

const evaluateProposalDecisionFixture = (fixture) => {
  const signals = buildArchiveSignals(fixture.library || {});
  const proposals = buildProposalCandidates({ signals, existingPages: fixture.existingPages || [] });
  const shown = visibleProposals(proposals);
  const titles = shown.map(proposal => proposal.title);
  const failures = [];

  (fixture.expectations?.visibleTitles || []).forEach((title) => {
    if (!titles.includes(title)) failures.push(`Expected visible proposal "${title}".`);
  });
  (fixture.expectations?.forbiddenVisibleTitlePatterns || []).forEach((pattern) => {
    if (shown.some(proposal => pattern.test(proposal.title))) {
      failures.push(`Expected no visible proposal title matching ${pattern}.`);
    }
  });
  if (Number.isFinite(Number(fixture.expectations?.maxVisible)) && shown.length > Number(fixture.expectations.maxVisible)) {
    failures.push(`Expected at most ${fixture.expectations.maxVisible} visible proposals, got ${shown.length}.`);
  }
  if (shown.some(proposal => /<[^>]+>/.test(proposal.title) || /https?:\/\//i.test(proposal.title))) {
    failures.push('Visible proposal title contains markup or URL text.');
  }
  (fixture.expectations?.expectedDecisionActions || []).forEach((expected) => {
    const found = proposals.find(proposal => (
      expected.pattern.test(proposal.title)
      && (!expected.action || proposal.proposalDecision?.action === expected.action)
      && (!expected.status || String(proposal.status || 'pending') === expected.status)
    ));
    if (!found) {
      failures.push(`Expected proposal matching ${expected.pattern} with action=${expected.action || '*'} status=${expected.status || '*'}.`);
    }
  });

  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    proposals: proposals.map(proposal => ({
      title: proposal.title,
      status: proposal.status || 'pending',
      action: proposal.proposalDecision?.action || 'unknown',
      score: proposal.proposalDecision?.qualityScore || 0
    }))
  };
};

const evaluateAgentProposalMutationFixture = async (fixture) => {
  const signals = buildArchiveSignals(fixture.library || {});
  const deterministic = buildProposalCandidates({ signals, existingPages: fixture.existingPages || [] });
  const shaped = await shapeWikiProposalCandidates({
    candidates: deterministic,
    existingPages: fixture.existingPages || [],
    isConfigured: () => true,
    chat: async () => ({
      text: JSON.stringify(fixture.agentDecision || {}),
      model: 'fixture-bad-proposal-agent',
      provider: 'deterministic'
    }),
    maxCandidates: deterministic.length
  });
  const failures = [];
  (fixture.expectations?.expectedDecisionActions || []).forEach((expected) => {
    const found = shaped.find(proposal => (
      expected.pattern.test(proposal.title)
      && (!expected.action || proposal.proposalDecision?.action === expected.action)
      && (!expected.status || String(proposal.status || 'pending') === expected.status)
    ));
    if (!found) failures.push(`Expected shaped proposal matching ${expected.pattern} with action=${expected.action || '*'} status=${expected.status || '*'}.`);
  });
  (fixture.expectations?.forbiddenActions || []).forEach((action) => {
    if (shaped.some(proposal => proposal.proposalDecision?.action === action)) {
      failures.push(`Expected agent-shaped proposals not to include action=${action}.`);
    }
  });
  return {
    name: fixture.name,
    type: fixture.type,
    ok: failures.length === 0,
    failures,
    proposals: shaped.map(proposal => ({
      title: proposal.title,
      status: proposal.status || 'pending',
      action: proposal.proposalDecision?.action || 'unknown',
      score: proposal.proposalDecision?.qualityScore || 0
    }))
  };
};

const evaluateFixture = async (fixture, options = {}) => {
  if (fixture.type === 'maintenance_quality') return evaluateMaintenanceQualityFixture(fixture, options);
  if (fixture.type === 'negative_maintenance_quality') return evaluateNegativeMaintenanceQualityFixture(fixture, options);
  if (fixture.type === 'source_event_update') return evaluateSourceEventUpdateFixture(fixture, options);
  if (fixture.type === 'source_event_queue') return evaluateSourceEventQueueFixture(fixture, options);
  if (fixture.type === 'source_event_queue_drain') return evaluateSourceEventQueueDrainFixture(fixture, options);
  if (fixture.type === 'source_event_queue_failure') return evaluateSourceEventQueueFailureFixture(fixture);
  if (fixture.type === 'connector_ingestion_queue') return evaluateConnectorIngestionQueueFixture(fixture, options);
  if (fixture.type === 'proposal_decision') return evaluateProposalDecisionFixture(fixture);
  if (fixture.type === 'agent_proposal_mutation') return evaluateAgentProposalMutationFixture(fixture);
  return evaluateParityFixture(fixture, options);
};

const runWikiIntelligenceHarness = async ({
  selectedFixtures = [],
  includeJudge = false,
  requireJudge = false,
  judgeAll = false
} = {}) => {
  const selected = selectedFixtures.length
    ? fixtures.filter(fixture => selectedFixtures.includes(fixture.name))
    : fixtures;
  const results = await Promise.all(selected.map(fixture => evaluateFixture(fixture, { includeJudge, requireJudge, judgeAll })));
  const failed = results.filter(result => !result.ok);
  return {
    ok: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results
  };
};

module.exports = {
  evaluateFixture,
  evaluateAgentProposalMutationFixture,
  evaluateConnectorIngestionQueueFixture,
  evaluateMaintenanceQualityFixture,
  evaluateNegativeMaintenanceQualityFixture,
  evaluatePageQuality,
  evaluateParityFixture,
  evaluateProposalDecisionFixture,
  evaluateSourceEventQueueDrainFixture,
  evaluateSourceEventQueueFailureFixture,
  evaluateSourceEventQueueFixture,
  evaluateSourceEventUpdateFixture,
  fixtures,
  judgePageQuality,
  runWikiIntelligenceHarness
};
