const assert = require('assert');
const mongoose = require('mongoose');

const { maintainWikiPage, __testables } = require('./wikiMaintenanceService');
const { isTextGenerationConfigured } = require('../ai/hfTextClient');
const { WIKI_CLAIM_ITEM_TYPE, buildWikiPageGraphRows } = require('./wikiGraphConnectionService');
const { normalizeSourceRef } = require('../routes/wikiRoutes');
const { WikiPage } = require('../models');

const {
  deriveClaimsFromDoc,
  docFromArticle,
  toPlainText
} = __testables;

const fixtures = [
  {
    name: 'article_output_preserves_support_and_contradiction_edges',
    type: 'article_to_graph',
    page: {
      _id: 'page-1',
      title: 'Capital Allocation',
      sourceRefs: [
        {
          _id: 'source-support',
          type: 'article',
          objectId: 'support-article',
          title: 'Long-term reinvestment'
        },
        {
          _id: 'source-conflict',
          type: 'highlight',
          objectId: 'conflict-highlight',
          title: 'Short-term distribution counterpoint'
        }
      ],
      citations: [
        {
          _id: 'citation-support',
          sourceRefId: 'source-support',
          sourceType: 'article',
          sourceObjectId: 'support-article'
        },
        {
          _id: 'citation-conflict',
          sourceRefId: 'source-conflict',
          sourceType: 'highlight',
          sourceObjectId: 'conflict-highlight'
        }
      ]
    },
    article: {
      summary: {
        text: 'Long-term compounding usually improves when capital can be reinvested at high rates, though some sources argue distributions can be superior when reinvestment opportunities fade.',
        citationIndexes: [1],
        contradictionIndexes: [2],
        support: 'conflicted'
      },
      sections: []
    },
    expectations: {
      supportCitationIds: ['citation-support'],
      contradictedByCitationIds: ['citation-conflict'],
      supportEdge: {
        fromType: 'article',
        fromId: 'support-article',
        relationType: 'supports'
      },
      contradictionEdge: {
        fromType: 'highlight',
        fromId: 'conflict-highlight',
        relationType: 'contradicts'
      }
    }
  },
  {
    name: 'stale_source_replacement_preserves_candidate_index_mapping',
    type: 'maintain_page',
    page: {
      _id: 'page-stale',
      title: 'Fresh Capital Allocation',
      pageType: 'topic',
      plainText: 'Old notes about a stale source.',
      sourceRefs: [{
        _id: 'stale-source-ref',
        type: 'article',
        objectId: 'stale-article',
        title: 'Old capital allocation memo',
        snippet: 'Stale material that should not occupy citation index 1.'
      }],
      citations: [],
      claims: [],
      aiState: {}
    },
    library: {
      articles: [{
        _id: 'fresh-article',
        title: 'Fresh capital allocation memo',
        content: 'Fresh Capital Allocation explains reinvestment discipline and updated evidence.',
        updatedAt: '2026-05-09T12:00:00.000Z'
      }]
    },
    modelResult: {
      title: 'Fresh Capital Allocation',
      article: {
        summary: {
          text: 'Fresh capital allocation depends on reinvestment discipline.',
          citationIndexes: [1],
          contradictionIndexes: [],
          support: 'partial'
        },
        sections: []
      },
      maintenance: {
        summary: 'Rebuilt from the fresh candidate source.',
        changelog: [],
        health: {
          newItems: [],
          unsupportedClaims: [],
          missingCitations: [],
          staleSections: [],
          contradictions: [],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1]
    },
    expectations: {
      firstSourceObjectId: 'fresh-article',
      firstCitationObjectId: 'fresh-article',
      firstClaimSupport: 'partial'
    }
  },
  {
    name: 'mongoose_page_maintenance_populates_claim_citation_ids',
    type: 'maintain_mongoose_page',
    title: 'Mongoose Citation Mapping',
    modelResult: {
      title: 'Mongoose Citation Mapping',
      article: {
        summary: {
          text: 'Mongoose-backed maintenance should attach durable citation ids.',
          citationIndexes: [1],
          contradictionIndexes: [],
          support: 'partial'
        },
        sections: []
      },
      maintenance: {
        summary: 'Rebuilt with a persisted source ref id.',
        changelog: [],
        health: {
          newItems: [],
          unsupportedClaims: [],
          missingCitations: [],
          staleSections: [],
          contradictions: [],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1]
    },
    expectations: {
      claimCitationCount: 1,
      claimSourceRefCount: 1
    }
  },
  {
    name: 'unsupported_bad_source_rejected_deterministically',
    type: 'source_ref_validation',
    payload: { type: 'bad-source' },
    expectations: {
      errorPattern: /type must be one of/i
    }
  },
  {
    name: 'multi_section_maintenance_emits_claim_graph_roles',
    type: 'maintain_mongoose_graph',
    title: 'Multi Section Moat',
    modelResult: {
      title: 'Multi Section Moat',
      article: {
        summary: {
          text: 'A durable moat depends on reinvestment discipline.',
          citationIndexes: [1],
          contradictionIndexes: [],
          support: 'partial'
        },
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              {
                text: 'Moats can compound when management reinvests cash at attractive rates.',
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
                text: 'Reinvestment works only when incremental returns stay attractive.',
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
                text: 'The evidence base ties capital allocation quality to reinvestment rates.',
                citationIndexes: [2],
                contradictionIndexes: [],
                support: 'partial'
              }
            ],
            bullets: []
          },
          {
            heading: 'Tensions',
            paragraphs: [
              {
                text: 'Returning capital is always inferior to reinvestment.',
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
                text: 'The threshold for reinvestment versus distribution still needs clearer evidence.',
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
        summary: 'Maintained multiple sections with support, contradiction, and gaps.',
        changelog: [
          { type: 'merged_new_evidence', target: 'Core Claims', summary: 'Integrated support and counter-evidence.', sourceIndexes: [1, 2, 3] }
        ],
        health: {
          newItems: [],
          unsupportedClaims: [{ text: 'Distribution threshold needs clearer evidence.', section: 'Open Questions' }],
          missingCitations: [],
          staleSections: [],
          contradictions: [{ text: 'Distribution superiority is disputed.', sourceTitle: 'Counter source', sourceIndexes: [3], section: 'Core Claims' }],
          relatedPages: []
        }
      },
      sourceIndexesUsed: [1, 2, 3]
    },
    expectations: {
      claimCount: 6,
      graphRowCount: 42,
      sections: ['Multi Section Moat', 'Core Idea', 'How It Works', 'Evidence', 'Tensions', 'Open Questions']
    }
  }
];

const liveFixtures = [
  {
    name: 'live_model_generates_clean_multi_section_wiki',
    title: 'Live Moat Maintenance',
    sourceArticles: [
      {
        title: 'Reinvestment and durable moats',
        content: 'Durable moats can widen when a business reinvests cash at high incremental returns. The useful test is whether reinvestment improves future earning power rather than merely increasing size.'
      },
      {
        title: 'Distribution discipline counterpoint',
        content: 'When reinvestment opportunities fade, returning cash can be better than forcing growth. A moat can erode if management reinvests below the cost of capital.'
      },
      {
        title: 'Evidence on capital allocation',
        content: 'Capital allocation quality depends on comparing reinvestment returns, buybacks, dividends, and opportunity cost. The same company can move between reinvestment and distribution regimes over time.'
      }
    ],
    expectations: {
      requiredHeadings: ['Core Idea', 'How It Works', 'Evidence', 'Tensions', 'Open Questions'],
      forbiddenPatterns: [
        /<\/?(?:p|div|span|br|section|article)\b/i,
        /https?:\/\//i,
        /contributes evidence for this page/i,
        /this page has been rebuilt/i,
        /source indexes?/i
      ],
      minClaims: 5,
      minSourceRefs: 2
    }
  }
];

const createModel = (docs = []) => ({
  find: () => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => docs
  })
});

const rowMatches = (row, expected = {}) => Object.entries(expected)
  .every(([key, value]) => String(row[key] || '') === String(value || ''));

const evaluateArticleToGraphFixture = (fixture) => {
  const failures = [];
  const body = docFromArticle({ title: fixture.page.title, article: fixture.article });
  const claims = deriveClaimsFromDoc({
    body,
    citations: fixture.page.citations,
    sourceRefs: fixture.page.sourceRefs,
    now: new Date('2026-05-09T12:00:00.000Z')
  });
  const [claim] = claims;

  try {
    assert.ok(claim, 'Expected at least one derived claim.');
    assert.strictEqual(claim.support, 'conflicted');
    assert.deepStrictEqual(claim.citationIds, fixture.expectations.supportCitationIds);
    assert.deepStrictEqual(claim.contradictedByCitationIds, fixture.expectations.contradictedByCitationIds);
  } catch (error) {
    failures.push(error.message);
  }

  const rows = buildWikiPageGraphRows({
    userId: 'user-1',
    page: {
      ...fixture.page,
      body,
      claims
    }
  });
  const claimGraphId = `${fixture.page._id}:${claim?.claimId || ''}`;

  if (!rows.some(row => rowMatches(row, {
    ...fixture.expectations.supportEdge,
    toType: WIKI_CLAIM_ITEM_TYPE,
    toId: claimGraphId
  }))) {
    failures.push('Expected supporting evidence edge to the derived claim.');
  }
  if (!rows.some(row => rowMatches(row, {
    ...fixture.expectations.contradictionEdge,
    toType: WIKI_CLAIM_ITEM_TYPE,
    toId: claimGraphId
  }))) {
    failures.push('Expected contradicting evidence edge to the derived claim.');
  }
  if (rows.some(row => rowMatches(row, {
    fromType: fixture.expectations.contradictionEdge.fromType,
    fromId: fixture.expectations.contradictionEdge.fromId,
    toType: WIKI_CLAIM_ITEM_TYPE,
    toId: claimGraphId,
    relationType: 'supports'
  }))) {
    failures.push('Contradicting evidence was also emitted as a supporting edge.');
  }

  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    claim: claim ? {
      text: claim.text,
      support: claim.support,
      citationIds: claim.citationIds,
      contradictedByCitationIds: claim.contradictedByCitationIds
    } : null,
    edgeCount: rows.length
  };
};

const evaluateMaintainPageFixture = async (fixture) => {
  const failures = [];
  const page = JSON.parse(JSON.stringify(fixture.page));
  await maintainWikiPage({
    page,
    userId: 'user-1',
    models: {
      Article: createModel(fixture.library?.articles || []),
      NotebookEntry: createModel(fixture.library?.notebooks || []),
      TagMeta: createModel(fixture.library?.concepts || []),
      Question: createModel(fixture.library?.questions || [])
    },
    isConfigured: () => true,
    chat: async () => ({
      text: JSON.stringify(fixture.modelResult),
      model: 'fixture-maintainer',
      provider: 'deterministic'
    }),
    now: new Date('2026-05-09T12:00:00.000Z')
  });

  if (String(page.sourceRefs?.[0]?.objectId || '') !== fixture.expectations.firstSourceObjectId) {
    failures.push(`Expected first sourceRef objectId ${fixture.expectations.firstSourceObjectId}, got ${page.sourceRefs?.[0]?.objectId || 'none'}.`);
  }
  if (String(page.citations?.[0]?.sourceObjectId || '') !== fixture.expectations.firstCitationObjectId) {
    failures.push(`Expected first citation objectId ${fixture.expectations.firstCitationObjectId}, got ${page.citations?.[0]?.sourceObjectId || 'none'}.`);
  }
  if (String(page.claims?.[0]?.support || '') !== fixture.expectations.firstClaimSupport) {
    failures.push(`Expected first claim support ${fixture.expectations.firstClaimSupport}, got ${page.claims?.[0]?.support || 'none'}.`);
  }
  if (page.sourceRefs?.some((source, index) => index > 0 && String(source.objectId || '') === fixture.expectations.firstSourceObjectId)) {
    failures.push('Fresh candidate source was duplicated instead of occupying the first citation slot.');
  }

  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    claim: page.claims?.[0] ? {
      text: page.claims[0].text,
      support: page.claims[0].support,
      citationIds: page.claims[0].citationIds,
      contradictedByCitationIds: page.claims[0].contradictedByCitationIds
    } : null,
    edgeCount: 0,
    firstSourceObjectId: page.sourceRefs?.[0]?.objectId || ''
  };
};

const evaluateMaintainMongoosePageFixture = async (fixture) => {
  const failures = [];
  const userId = new mongoose.Types.ObjectId();
  const freshArticleId = new mongoose.Types.ObjectId();
  const page = new WikiPage({
    userId,
    title: fixture.title,
    slug: 'mongoose-citation-mapping',
    pageType: 'topic',
    plainText: 'Existing stale note.',
    sourceRefs: [{
      type: 'article',
      objectId: new mongoose.Types.ObjectId(),
      title: 'Stale source',
      snippet: 'This source should not be citation index 1.'
    }],
    claims: [],
    citations: [],
    aiState: {}
  });

  await maintainWikiPage({
    page,
    userId,
    models: {
      Article: createModel([{
        _id: freshArticleId,
        userId,
        title: 'Fresh source for mongoose citation mapping',
        content: 'Mongoose Citation Mapping explains durable source references.',
        updatedAt: '2026-05-09T12:00:00.000Z'
      }]),
      NotebookEntry: createModel([]),
      TagMeta: createModel([]),
      Question: createModel([])
    },
    isConfigured: () => true,
    chat: async () => ({
      text: JSON.stringify(fixture.modelResult),
      model: 'fixture-maintainer',
      provider: 'deterministic'
    }),
    now: new Date('2026-05-09T12:00:00.000Z')
  });

  const claim = page.claims?.[0];
  if ((claim?.citationIds || []).length !== fixture.expectations.claimCitationCount) {
    failures.push(`Expected ${fixture.expectations.claimCitationCount} claim citation id, got ${(claim?.citationIds || []).length}.`);
  }
  if ((claim?.sourceRefIds || []).length !== fixture.expectations.claimSourceRefCount) {
    failures.push(`Expected ${fixture.expectations.claimSourceRefCount} claim source ref id, got ${(claim?.sourceRefIds || []).length}.`);
  }
  if (String(page.citations?.[0]?.sourceRefId || '') !== String(page.sourceRefs?.[0]?._id || '')) {
    failures.push('Expected first citation sourceRefId to match first generated sourceRef _id.');
  }
  if (String(claim?.citationIds?.[0] || '') !== String(page.citations?.[0]?._id || '')) {
    failures.push('Expected first claim citation id to match first generated citation _id.');
  }
  if (String(claim?.sourceRefIds?.[0] || '') !== String(page.sourceRefs?.[0]?._id || '')) {
    failures.push('Expected first claim source ref id to match first generated sourceRef _id.');
  }
  if (String(page.sourceRefs?.[0]?.objectId || '') !== String(freshArticleId)) {
    failures.push('Expected fresh library source to occupy the first sourceRef slot.');
  }

  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    claim: claim ? {
      text: claim.text,
      support: claim.support,
      citationIds: claim.citationIds,
      contradictedByCitationIds: claim.contradictedByCitationIds
    } : null,
    edgeCount: 0,
    firstSourceObjectId: page.sourceRefs?.[0]?.objectId || ''
  };
};

const evaluateSourceRefValidationFixture = (fixture) => {
  const result = normalizeSourceRef(fixture.payload);
  const failures = [];
  if (!result.error) failures.push('Expected invalid sourceRef payload to be rejected.');
  if (fixture.expectations?.errorPattern && !fixture.expectations.errorPattern.test(result.error || '')) {
    failures.push(`Expected error to match ${fixture.expectations.errorPattern}, got "${result.error || ''}".`);
  }
  if (result.value) failures.push('Expected rejected sourceRef payload not to produce a normalized value.');
  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    claim: null,
    edgeCount: 0
  };
};

const evaluateMaintainMongooseGraphFixture = async (fixture) => {
  const failures = [];
  const userId = new mongoose.Types.ObjectId();
  const sourceIds = [
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId(),
    new mongoose.Types.ObjectId()
  ];
  const page = new WikiPage({
    userId,
    title: fixture.title,
    slug: 'multi-section-moat',
    pageType: 'topic',
    plainText: 'Existing multi-section note.',
    sourceRefs: [],
    claims: [],
    citations: [],
    aiState: {}
  });

  await maintainWikiPage({
    page,
    userId,
    models: {
      Article: createModel([
        {
          _id: sourceIds[0],
          userId,
          title: 'Moat reinvestment source',
          content: 'Multi Section Moat durable moat reinvestment discipline attractive rates.',
          updatedAt: '2026-05-09T12:00:00.000Z'
        },
        {
          _id: sourceIds[1],
          userId,
          title: 'Capital allocation support source',
          content: 'Multi Section Moat management reinvests cash at attractive rates.',
          updatedAt: '2026-05-08T12:00:00.000Z'
        },
        {
          _id: sourceIds[2],
          userId,
          title: 'Counter distribution source',
          content: 'Multi Section Moat distributions can be superior when reinvestment opportunities fade.',
          updatedAt: '2026-05-07T12:00:00.000Z'
        }
      ]),
      NotebookEntry: createModel([]),
      TagMeta: createModel([]),
      Question: createModel([])
    },
    isConfigured: () => true,
    chat: async () => ({
      text: JSON.stringify(fixture.modelResult),
      model: 'fixture-maintainer',
      provider: 'deterministic'
    }),
    now: new Date('2026-05-09T12:00:00.000Z')
  });

  const claims = Array.isArray(page.claims) ? page.claims : [];
  const rows = buildWikiPageGraphRows({ page, userId });
  const conflicted = claims.find(claim => claim.support === 'conflicted');
  const unsupported = claims.find(claim => claim.support === 'unsupported');
  const coreIdea = claims.find(claim => claim.section === 'Core Idea');
  const tensions = claims.find(claim => claim.section === 'Tensions');
  const openQuestions = claims.find(claim => claim.section === 'Open Questions');
  const sectionRows = page.aiState?.sectionMaintenance?.sections || [];
  const claimGraphId = (claim) => `${page._id}:${claim?.claimId || ''}`;
  const sourceObjectIds = (page.sourceRefs || []).map(source => String(source.objectId || ''));

  if ((page.sourceRefs || []).length !== 3) {
    failures.push(`Expected 3 source refs, got ${(page.sourceRefs || []).length}.`);
  }
  if ((page.citations || []).length !== 3) {
    failures.push(`Expected 3 citations, got ${(page.citations || []).length}.`);
  }
  (page.citations || []).slice(0, 3).forEach((citation, index) => {
    if (String(citation.sourceRefId || '') !== String(page.sourceRefs?.[index]?._id || '')) {
      failures.push(`Expected citation ${index + 1} to point at sourceRef ${index + 1}.`);
    }
  });
  if (claims.length !== fixture.expectations.claimCount) {
    failures.push(`Expected ${fixture.expectations.claimCount} claims, got ${claims.length}.`);
  }
  const sections = claims.map(claim => claim.section);
  fixture.expectations.sections.forEach((section) => {
    if (!sections.includes(section)) failures.push(`Expected claim section "${section}".`);
  });
  if (!conflicted || conflicted.section !== 'Tensions') {
    failures.push('Expected one conflicted claim in Tensions.');
  }
  if (!unsupported || unsupported.section !== 'Open Questions') {
    failures.push('Expected one unsupported claim in Open Questions.');
  }
  if (!conflicted?.citationIds?.length || !conflicted?.contradictedByCitationIds?.length) {
    failures.push('Expected conflicted claim to carry both supporting and contradicting citation ids.');
  }
  const tensionsRow = sectionRows.find(row => row.section === 'Tensions');
  const openQuestionsRow = sectionRows.find(row => row.section === 'Open Questions');
  if (!sectionRows.find(row => row.section === 'Core Idea')) {
    failures.push('Expected section maintenance for Core Idea.');
  }
  if (!tensionsRow || tensionsRow.conflictedClaims !== 1) {
    failures.push('Expected Tensions section maintenance to count one conflicted claim.');
  }
  if (!openQuestionsRow || openQuestionsRow.unsupportedClaims !== 1) {
    failures.push('Expected Open Questions section maintenance to count one unsupported claim.');
  }
  if (rows.length !== fixture.expectations.graphRowCount) {
    failures.push(`Expected ${fixture.expectations.graphRowCount} graph rows, got ${rows.length}.`);
  }
  sourceObjectIds.forEach((objectId) => {
    if (!rows.some(row => row.fromType === 'article' && String(row.fromId || '') === objectId && row.toType === 'wiki_page' && String(row.toId || '') === String(page._id) && row.relationType === 'supports')) {
      failures.push(`Expected source-to-page support row for ${objectId}.`);
    }
    if (!rows.some(row => row.fromType === 'wiki_page' && String(row.fromId || '') === String(page._id) && row.toType === 'article' && String(row.toId || '') === objectId && row.relationType === 'supported_by')) {
      failures.push(`Expected reciprocal page-to-source supported_by row for ${objectId}.`);
    }
  });
  claims.forEach((claim) => {
    if (!rows.some(row => row.fromType === 'wiki_page' && String(row.fromId || '') === String(page._id) && row.toType === WIKI_CLAIM_ITEM_TYPE && row.toId === claimGraphId(claim) && row.relationType === 'contains')) {
      failures.push(`Expected contains row for claim ${claim.claimId}.`);
    }
    if (!rows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === claimGraphId(claim) && row.toType === 'wiki_page' && String(row.toId || '') === String(page._id) && row.relationType === 'contained_by')) {
      failures.push(`Expected reciprocal contained_by row for claim ${claim.claimId}.`);
    }
  });
  if (coreIdea && !rows.some(row => row.fromType === 'article' && String(row.fromId || '') === sourceObjectIds[0] && row.toId === claimGraphId(coreIdea) && row.relationType === 'supports')) {
    failures.push('Expected Core Idea support from source 1.');
  }
  if (coreIdea && !rows.some(row => row.fromType === 'article' && String(row.fromId || '') === sourceObjectIds[1] && row.toId === claimGraphId(coreIdea) && row.relationType === 'supports')) {
    failures.push('Expected Core Idea support from source 2.');
  }
  if (!tensions || !rows.some(row => row.fromType === 'article' && String(row.fromId || '') === sourceObjectIds[1] && row.toId === claimGraphId(tensions) && row.relationType === 'supports')) {
    failures.push('Expected Tensions support from source 2.');
  }
  if (!tensions || !rows.some(row => row.fromType === 'article' && String(row.fromId || '') === sourceObjectIds[2] && row.toId === claimGraphId(tensions) && row.relationType === 'contradicts')) {
    failures.push('Expected Tensions contradiction from source 3.');
  }
  if (!tensions || !rows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === claimGraphId(tensions) && row.toType === 'article' && String(row.toId || '') === sourceObjectIds[2] && row.relationType === 'contradicted_by')) {
    failures.push('Expected reciprocal Tensions contradicted_by edge to source 3.');
  }
  if (tensions && rows.some(row => row.fromType === 'article' && String(row.fromId || '') === sourceObjectIds[2] && row.toId === claimGraphId(tensions) && row.relationType === 'supports')) {
    failures.push('Source 3 should not support the Tensions claim.');
  }
  if (!openQuestions || !rows.some(row => row.fromType === WIKI_CLAIM_ITEM_TYPE && row.fromId === claimGraphId(openQuestions) && row.toType === 'wiki_page' && String(row.toId || '') === String(page._id) && row.relationType === 'needs_review')) {
    failures.push('Expected Open Questions needs_review graph row.');
  }
  if (!openQuestions || !rows.some(row => row.fromType === 'wiki_page' && String(row.fromId || '') === String(page._id) && row.toType === WIKI_CLAIM_ITEM_TYPE && row.toId === claimGraphId(openQuestions) && row.relationType === 'review_needed_by')) {
    failures.push('Expected reciprocal Open Questions review_needed_by graph row.');
  }
  if (!unsupported || rows.some(row => row.toId === claimGraphId(unsupported) && row.relationType === 'supports')) {
    failures.push('Expected unsupported claim to avoid supporting graph edges.');
  }
  if (!conflicted || !rows.some(row => row.toId === claimGraphId(conflicted) && row.relationType === 'contradicts' && row.fromType === 'article')) {
    failures.push('Expected graph to emit a contradicts edge for the conflicted claim.');
  }
  if (conflicted && rows.some(row => (
    row.toId === claimGraphId(conflicted)
    && row.relationType === 'supports'
    && String(row.fromId || '') === String(page.citations?.find(citation => String(citation._id || '') === String(conflicted.contradictedByCitationIds?.[0] || ''))?.sourceObjectId || '')
  ))) {
    failures.push('Contradicting citation source also appeared as support for the conflicted claim.');
  }

  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    claim: conflicted ? {
      text: conflicted.text,
      support: conflicted.support,
      citationIds: conflicted.citationIds,
      contradictedByCitationIds: conflicted.contradictedByCitationIds
    } : null,
    edgeCount: rows.length
  };
};

const evaluateLiveModelFixture = async (fixture, { requireLive = false } = {}) => {
  if (!isTextGenerationConfigured()) {
    return {
      name: fixture.name,
      ok: !requireLive,
      skipped: true,
      failures: requireLive ? ['HF_TOKEN is not configured for live model maintenance eval.'] : [],
      claim: null,
      edgeCount: 0
    };
  }

  const failures = [];
  const userId = new mongoose.Types.ObjectId();
  const page = new WikiPage({
    userId,
    title: fixture.title,
    slug: 'live-moat-maintenance',
    pageType: 'topic',
    plainText: 'Existing note: moats are about reinvestment, but distribution can sometimes be wiser.',
    sourceRefs: [],
    claims: [],
    citations: [],
    aiState: {}
  });
  const articles = fixture.sourceArticles.map((article, index) => ({
    _id: new mongoose.Types.ObjectId(),
    userId,
    title: article.title,
    content: article.content,
    updatedAt: new Date(Date.UTC(2026, 4, 9 - index))
  }));

  await maintainWikiPage({
    page,
    userId,
    models: {
      Article: createModel(articles),
      NotebookEntry: createModel([]),
      TagMeta: createModel([]),
      Question: createModel([])
    },
    now: new Date('2026-05-09T12:00:00.000Z')
  });

  const plainText = toPlainText(page.body);
  fixture.expectations.requiredHeadings.forEach((heading) => {
    if (!plainText.includes(heading)) failures.push(`Expected live output to include "${heading}".`);
  });
  fixture.expectations.forbiddenPatterns.forEach((pattern) => {
    if (pattern.test(plainText)) failures.push(`Live output matched forbidden pattern ${pattern}.`);
  });
  if ((page.claims || []).length < fixture.expectations.minClaims) {
    failures.push(`Expected at least ${fixture.expectations.minClaims} live claims, got ${(page.claims || []).length}.`);
  }
  if ((page.sourceRefs || []).length < fixture.expectations.minSourceRefs) {
    failures.push(`Expected at least ${fixture.expectations.minSourceRefs} live source refs, got ${(page.sourceRefs || []).length}.`);
  }
  if (!page.claims?.some(claim => ['supported', 'partial', 'conflicted'].includes(claim.support) && (claim.citationIds || []).length)) {
    failures.push('Expected at least one live claim with attached citation ids.');
  }
  if (!page.aiState?.maintenanceSummary) {
    failures.push('Expected live maintenance summary to be recorded.');
  }

  return {
    name: fixture.name,
    ok: failures.length === 0,
    failures,
    claim: page.claims?.[0] ? {
      text: page.claims[0].text,
      support: page.claims[0].support,
      citationIds: page.claims[0].citationIds || [],
      contradictedByCitationIds: page.claims[0].contradictedByCitationIds || []
    } : null,
    edgeCount: buildWikiPageGraphRows({ page, userId }).length,
    model: page.aiState?.model || ''
  };
};

const evaluateFixture = async (fixture) => {
  if (fixture.type === 'maintain_page') return evaluateMaintainPageFixture(fixture);
  if (fixture.type === 'maintain_mongoose_page') return evaluateMaintainMongoosePageFixture(fixture);
  if (fixture.type === 'maintain_mongoose_graph') return evaluateMaintainMongooseGraphFixture(fixture);
  if (fixture.type === 'source_ref_validation') return evaluateSourceRefValidationFixture(fixture);
  return evaluateArticleToGraphFixture(fixture);
};

const runWikiMaintenanceQualityHarness = async ({
  selectedFixtures = [],
  includeLive = false,
  requireLive = false
} = {}) => {
  const selected = selectedFixtures.length
    ? fixtures.filter(fixture => selectedFixtures.includes(fixture.name))
    : fixtures;
  const liveSelected = includeLive
    ? liveFixtures.filter(fixture => !selectedFixtures.length || selectedFixtures.includes(fixture.name))
    : [];
  const results = [
    ...await Promise.all(selected.map(evaluateFixture)),
    ...await Promise.all(liveSelected.map(fixture => evaluateLiveModelFixture(fixture, { requireLive })))
  ];
  const failed = results.filter(result => !result.ok);
  const skipped = results.filter(result => result.skipped);
  const passed = results.filter(result => result.ok && !result.skipped);
  return {
    ok: failed.length === 0,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    skipped: skipped.length,
    results
  };
};

module.exports = {
  evaluateFixture,
  fixtures,
  liveFixtures,
  runWikiMaintenanceQualityHarness
};
