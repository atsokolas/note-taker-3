const crypto = require('crypto');
const express = require('express');

const DEBUG_FIXTURE_SCENARIO = 'import_organization';
const DEBUG_FIXTURE_PREFIX = `debug-fixture:${DEBUG_FIXTURE_SCENARIO}`;
const LIBRARY_SOURCE_FIXTURE_SCENARIO = 'library_source_provenance';
const LIBRARY_SOURCE_FIXTURE_PREFIX = `debug-fixture:${LIBRARY_SOURCE_FIXTURE_SCENARIO}`;
const ROOT_NOTEBOOK_TITLE = 'Imported Roadmap';
const CREATED_FOLDER_NAME = 'Workbench Intake';
const SOURCE_FOLDER_NAME = 'Product specs';
const REJECTED_RENAME_TARGET = 'Legacy Product specs';
const LIBRARY_SOURCE_ARTICLE_URL = 'https://debug-fixture.noeis.local/library-source-provenance';
const LIBRARY_SOURCE_ARTICLE_TITLE = 'Debug Fixture - Library Source Provenance';
const LIBRARY_SOURCE_WIKI_TITLE = 'Debug Fixture - Source-Backed Thesis';
const LIBRARY_SOURCE_WIKI_SLUG = 'debug-fixture-source-backed-thesis';
const LIBRARY_SOURCE_COUNTER_ARTICLE_URL = 'https://debug-fixture.noeis.local/library-source-provenance-counter';
const LIBRARY_SOURCE_COUNTER_ARTICLE_TITLE = 'Debug Fixture - Provenance Counter Signal';
const LIBRARY_SOURCE_QUESTION_TEXT = 'Debug Fixture - Can source provenance keep a challenged claim grounded?';

const clean = (value = '') => String(value || '').trim();
const createBlockId = () => (
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`
);
const buildFixtureExternalId = (fixtureKey = '', suffix = '') => `${DEBUG_FIXTURE_PREFIX}:${fixtureKey}:${suffix}`;
const buildLibrarySourceFixtureExternalId = (fixtureKey = '', suffix = '') => `${LIBRARY_SOURCE_FIXTURE_PREFIX}:${fixtureKey}:${suffix}`;

const buildLibrarySourceFixtureDiscussion = ({ fixtureKey, now }) => ({
  _id: crypto.randomBytes(12).toString('hex'),
  question: 'What should become a standalone wiki page from this source-backed answer?',
  answer: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'A standalone page should preserve the source provenance loop: the Library highlight supports the settled wiki claim, and the resulting page should carry that citation forward.',
          marks: [{
            type: 'claim',
            attrs: {
              claimId: `discussion-claim-${fixtureKey}`,
              support: 'supported',
              citationIndexes: [1]
            }
          }]
        }]
      },
      {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Promoting this answer should create a new wiki page with a source reference back to the original Library article.'
        }]
      }
    ]
  },
  citationIndexesUsed: [1],
  model: 'debug-fixture',
  status: 'answered',
  errorMessage: '',
  askedAt: now
});

const clearImportOrganizationFixtures = async ({
  userId,
  IntegrationConnection,
  ImportSession,
  NotebookFolder,
  NotebookEntry,
  AgentThread,
  AgentStructureProposal
}) => {
  const fixturePrefixPattern = new RegExp(`^${DEBUG_FIXTURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  await Promise.all([
    IntegrationConnection?.deleteMany?.({
      userId,
      externalAccountId: fixturePrefixPattern
    }),
    ImportSession?.deleteMany?.({
      userId,
      'config.filters.debugFixtureScenario': DEBUG_FIXTURE_SCENARIO
    }),
    NotebookEntry?.deleteMany?.({
      userId,
      'importMeta.externalId': fixturePrefixPattern
    }),
    NotebookFolder?.deleteMany?.({
      userId,
      'importMeta.externalId': fixturePrefixPattern
    }),
    AgentStructureProposal?.deleteMany?.({
      userId,
      sourceBundleId: fixturePrefixPattern
    }),
    AgentThread?.deleteMany?.({
      userId,
      'scope.metadata.fixtureScenario': DEBUG_FIXTURE_SCENARIO
    })
  ]);
};

const createImportOrganizationFixture = async ({
  userId,
  IntegrationConnection,
  ImportSession,
  NotebookFolder,
  NotebookEntry,
  AgentThread,
  AgentStructureProposal
}) => {
  await clearImportOrganizationFixtures({
    userId,
    IntegrationConnection,
    ImportSession,
    NotebookFolder,
    NotebookEntry,
    AgentThread,
    AgentStructureProposal
  });

  const fixtureKey = crypto.randomBytes(8).toString('hex');
  const now = new Date();

  const connection = await IntegrationConnection.create({
    provider: 'notion',
    status: 'connected',
    health: 'healthy',
    accountLabel: 'Product Wiki',
    externalAccountId: buildFixtureExternalId(fixtureKey, 'connection'),
    mode: 'oauth',
    scopes: ['workspace'],
    lastValidatedAt: now,
    userId
  });

  const session = await ImportSession.create({
    provider: 'notion',
    mode: 'oauth',
    status: 'completed',
    sourceLabel: 'Product Wiki',
    connectionId: connection._id,
    config: {
      sourceType: 'oauth',
      importStrategy: 'oauth',
      filters: {
        debugFixtureScenario: DEBUG_FIXTURE_SCENARIO,
        fixtureKey
      }
    },
    preview: {
      items: 1,
      notes: 1,
      pages: 1,
      sampleTitles: [ROOT_NOTEBOOK_TITLE]
    },
    progress: {
      stage: 'completed',
      percent: 100,
      indexingState: 'queued'
    },
    result: {
      importedNotes: 1,
      indexingQueued: 1,
      indexingAttempts: 1
    },
    recommendedNextAction: 'organize_import',
    agentSuggestions: [
      {
        type: 'organize_import',
        intent: 'organize_import',
        operationType: 'organize_workspace',
        status: 'pending',
        label: 'Organize this import',
        summary: 'Review and organize imported material from Product Wiki.',
        scopeType: 'import_session',
        scopeId: '',
        suggestedAt: now
      }
    ],
    userId
  });

  session.agentSuggestions[0].scopeId = String(session._id);
  await session.save();

  const mirrorRoot = await NotebookFolder.create({
    name: 'Imported notebooks',
    userId,
    sortOrder: 0,
    importMeta: {
      provider: 'notion',
      sourceType: 'oauth',
      sourcePath: 'Imported notebooks',
      folderOwnership: 'import_mirror',
      externalId: buildFixtureExternalId(fixtureKey, 'mirror-root')
    }
  });

  const sourceFolder = await NotebookFolder.create({
    name: SOURCE_FOLDER_NAME,
    userId,
    parentFolderId: mirrorRoot._id,
    sortOrder: 0,
    importMeta: {
      provider: 'notion',
      sourceType: 'oauth',
      sourceLabel: 'Product Wiki',
      sourcePath: `Imported notebooks / ${SOURCE_FOLDER_NAME}`,
      folderOwnership: 'import_mirror',
      externalId: buildFixtureExternalId(fixtureKey, 'mirror-child'),
      parentExternalId: buildFixtureExternalId(fixtureKey, 'mirror-root')
    }
  });

  const note = await NotebookEntry.create({
    title: ROOT_NOTEBOOK_TITLE,
    content: '<p>Original imported notebook body.</p>',
    blocks: [
      {
        id: createBlockId(),
        type: 'paragraph',
        text: 'Original imported notebook body.'
      }
    ],
    folder: sourceFolder._id,
    type: 'note',
    tags: ['strategy'],
    importMeta: {
      provider: 'notion',
      sourceType: 'oauth',
      sourceLabel: 'Product Wiki',
      sourcePath: `Imported notebooks / ${SOURCE_FOLDER_NAME}`,
      folderOwnership: 'import_mirror',
      externalId: buildFixtureExternalId(fixtureKey, 'note'),
      importSessionId: session._id,
      importedAt: now,
      searchableAt: now
    },
    userId
  });

  session.result.lastImportedEntryId = String(note._id);
  await session.save();

  const thread = await AgentThread.create({
    userId,
    title: 'Notion cleanup',
    status: 'active',
    summary: 'Stage a reviewable cleanup plan for the imported notebook structure.',
    scope: {
      type: 'workspace',
      id: String(session._id),
      title: 'Notion import',
      metadata: {
        importSessionId: String(session._id),
        provider: 'notion',
        fixtureScenario: DEBUG_FIXTURE_SCENARIO,
        fixtureKey
      }
    },
    createdBy: { actorType: 'user', actorId: String(userId) },
    lastActor: { actorType: 'native_agent', actorId: 'resident' },
    messages: [
      {
        role: 'assistant',
        text: 'I staged a structure plan for your Notion import.',
        actor: { actorType: 'native_agent', actorId: 'resident' },
        createdAt: now
      }
    ]
  });

  const proposal = await AgentStructureProposal.create({
    userId,
    sourceThreadId: thread._id,
    sourceBundleId: buildFixtureExternalId(fixtureKey, 'bundle'),
    scope: 'import_session',
    scopeRef: String(session._id),
    status: 'pending',
    title: 'Organize Product Wiki import',
    summary: 'Stage the imported roadmap under a cleaner working folder and leave the mirrored folder name alone if you reject it.',
    rationale: 'This keeps imported structure reviewable instead of leaving it as a mirror dump.',
    operations: [
      {
        opId: 'create-folder',
        type: 'create_folder',
        targetDomain: 'notebook',
        status: 'pending',
        payload: {
          name: CREATED_FOLDER_NAME,
          importMeta: {
            provider: 'notion',
            sourceType: 'oauth',
            sourceLabel: 'Product Wiki',
            folderOwnership: 'user_owned',
            externalId: buildFixtureExternalId(fixtureKey, 'created-folder')
          }
        },
        preview: {
          folderName: CREATED_FOLDER_NAME
        },
        risk: 'low'
      },
      {
        opId: 'move-note',
        type: 'move_item',
        targetDomain: 'notebook',
        status: 'pending',
        payload: {
          itemId: String(note._id),
          destinationFolderName: CREATED_FOLDER_NAME
        },
        preview: {
          itemTitle: ROOT_NOTEBOOK_TITLE,
          destinationFolderName: CREATED_FOLDER_NAME
        },
        risk: 'low'
      },
      {
        opId: 'rename-source-folder',
        type: 'rename_folder',
        targetDomain: 'notebook',
        status: 'pending',
        payload: {
          folderId: String(sourceFolder._id),
          name: REJECTED_RENAME_TARGET
        },
        preview: {
          from: SOURCE_FOLDER_NAME,
          to: REJECTED_RENAME_TARGET,
          reason: 'Normalize the mirrored folder label.'
        },
        risk: 'low'
      }
    ],
    createdBy: {
      actorType: 'native_agent',
      actorId: 'resident'
    }
  });

  return {
    fixtureKey,
    sessionId: String(session._id),
    threadId: String(thread._id),
    proposalId: String(proposal._id),
    noteId: String(note._id),
    sourceFolderId: String(sourceFolder._id),
    createdFolderName: CREATED_FOLDER_NAME,
    sourceFolderName: SOURCE_FOLDER_NAME,
    rejectedRenameTarget: REJECTED_RENAME_TARGET,
    rootNotebookTitle: ROOT_NOTEBOOK_TITLE
  };
};

const clearLibrarySourceFixture = async ({
  userId,
  Article,
  WikiPage,
  Connection,
  Question
}) => {
  const fixturePrefixPattern = new RegExp(`^${LIBRARY_SOURCE_FIXTURE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  const [fixtureArticles, fixtureQuestions] = await Promise.all([
    Article?.find?.({
      userId,
      $or: [
        { url: LIBRARY_SOURCE_ARTICLE_URL },
        { url: LIBRARY_SOURCE_COUNTER_ARTICLE_URL },
        { 'importMeta.externalId': fixturePrefixPattern }
      ]
    }).select?.('_id highlights._id')?.lean?.() || [],
    Question?.find?.({
      userId,
      $or: [
        { text: LIBRARY_SOURCE_QUESTION_TEXT },
        { conceptName: fixturePrefixPattern }
      ]
    }).select?.('_id linkedHighlightId linkedHighlightIds blocks.highlightId')?.lean?.() || []
  ]);
  const fixtureArticleIds = (Array.isArray(fixtureArticles) ? fixtureArticles : [])
    .map(article => String(article?._id || ''))
    .filter(Boolean);
  const fixtureQuestionIds = (Array.isArray(fixtureQuestions) ? fixtureQuestions : [])
    .map(question => String(question?._id || ''))
    .filter(Boolean);
  const fixtureHighlightIds = [
    ...(Array.isArray(fixtureArticles) ? fixtureArticles : [])
      .flatMap(article => (Array.isArray(article?.highlights) ? article.highlights : []).map(highlight => highlight?._id)),
    ...(Array.isArray(fixtureQuestions) ? fixtureQuestions : [])
      .flatMap(question => [
        question?.linkedHighlightId,
        ...(Array.isArray(question?.linkedHighlightIds) ? question.linkedHighlightIds : []),
        ...(Array.isArray(question?.blocks) ? question.blocks.map(block => block?.highlightId) : [])
      ])
  ].map(value => String(value || '')).filter(Boolean);
  await Promise.all([
    Article?.deleteMany?.({
      userId,
      $or: [
        { url: LIBRARY_SOURCE_ARTICLE_URL },
        { url: LIBRARY_SOURCE_COUNTER_ARTICLE_URL },
        { 'importMeta.externalId': fixturePrefixPattern }
      ]
    }),
    WikiPage?.deleteMany?.({
      userId,
      $or: [
        { slug: LIBRARY_SOURCE_WIKI_SLUG },
        { 'createdFrom.sourceId': fixturePrefixPattern }
      ]
    }),
    Question?.deleteMany?.({
      userId,
      $or: [
        { text: LIBRARY_SOURCE_QUESTION_TEXT },
        { conceptName: fixturePrefixPattern }
      ]
    }),
    Connection?.deleteMany?.({
      userId,
      $or: [
        { scopeType: LIBRARY_SOURCE_FIXTURE_SCENARIO },
        ...fixtureQuestionIds.map(questionId => ({ scopeType: 'question', scopeId: questionId })),
        ...fixtureQuestionIds.map(questionId => ({ toType: 'question', toId: questionId })),
        ...fixtureQuestionIds.map(questionId => ({ fromType: 'question', fromId: questionId })),
        ...fixtureArticleIds.map(articleId => ({ fromType: 'article', fromId: articleId })),
        ...fixtureArticleIds.map(articleId => ({ toType: 'article', toId: articleId })),
        ...fixtureHighlightIds.map(highlightId => ({ fromType: 'highlight', fromId: highlightId })),
        ...fixtureHighlightIds.map(highlightId => ({ toType: 'highlight', toId: highlightId }))
      ]
    })
  ]);
};

const createLibrarySourceFixture = async ({
  userId,
  Article,
  WikiPage,
  Connection,
  Question
}) => {
  await clearLibrarySourceFixture({ userId, Article, WikiPage, Connection, Question });

  const fixtureKey = crypto.randomBytes(8).toString('hex');
  const now = new Date();
  const highlightId = crypto.randomBytes(12).toString('hex');
  const counterHighlightId = crypto.randomBytes(12).toString('hex');
  const claimId = `claim-${fixtureKey}`;
  const questionBlockId = `fixture-question-line-${fixtureKey}`;
  const seededDiscussion = buildLibrarySourceFixtureDiscussion({ fixtureKey, now });

  const article = await Article.create({
    url: LIBRARY_SOURCE_ARTICLE_URL,
    title: LIBRARY_SOURCE_ARTICLE_TITLE,
    content: [
      'Source-backed thinking improves when a Library highlight can travel into Think and Wiki without losing provenance.',
      'A durable claim should show where it came from and where it is now being used.'
    ].join('\n\n'),
    userId,
    siteName: 'Noeis QA Fixture',
    author: 'Noeis QA',
    importMeta: {
      provider: 'debug_fixture',
      externalId: buildLibrarySourceFixtureExternalId(fixtureKey, 'article'),
      raw: { scenario: LIBRARY_SOURCE_FIXTURE_SCENARIO, fixtureKey }
    },
    highlights: [{
      _id: highlightId,
      text: 'A durable claim should show where it came from and where it is now being used.',
      note: 'Use this highlight to verify source provenance across Library, Think, and Wiki.',
      tags: ['source-provenance', 'debug-fixture'],
      type: 'evidence',
      createdAt: now,
      importMeta: {
        provider: 'debug_fixture',
        externalId: buildLibrarySourceFixtureExternalId(fixtureKey, 'highlight'),
        raw: { scenario: LIBRARY_SOURCE_FIXTURE_SCENARIO, fixtureKey }
      }
    }]
  });

  const counterArticle = await Article.create({
    url: LIBRARY_SOURCE_COUNTER_ARTICLE_URL,
    title: LIBRARY_SOURCE_COUNTER_ARTICLE_TITLE,
    content: [
      'Source provenance can still mislead when a Library highlight is pulled into a challenged claim without counter-evidence.',
      'A challenged claim should show both the support trail and the counter signal before the line is trusted.'
    ].join('\n\n'),
    userId,
    siteName: 'Noeis QA Fixture',
    author: 'Noeis QA',
    importMeta: {
      provider: 'debug_fixture',
      externalId: buildLibrarySourceFixtureExternalId(fixtureKey, 'counter-article'),
      raw: { scenario: LIBRARY_SOURCE_FIXTURE_SCENARIO, fixtureKey }
    },
    highlights: [{
      _id: counterHighlightId,
      text: 'A challenged claim should show both the support trail and the counter signal before the line is trusted.',
      note: 'Use this highlight to verify counter-evidence in the challenged question gauge.',
      tags: ['source-provenance', 'counter-signal', 'debug-fixture'],
      type: 'evidence',
      createdAt: now,
      importMeta: {
        provider: 'debug_fixture',
        externalId: buildLibrarySourceFixtureExternalId(fixtureKey, 'counter-highlight'),
        raw: { scenario: LIBRARY_SOURCE_FIXTURE_SCENARIO, fixtureKey }
      }
    }]
  });

  const wikiPage = await WikiPage.create({
    userId,
    title: LIBRARY_SOURCE_WIKI_TITLE,
    slug: LIBRARY_SOURCE_WIKI_SLUG,
    pageType: 'overview',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'current_item',
    createdFrom: {
      type: 'article',
      objectId: article._id,
      label: LIBRARY_SOURCE_ARTICLE_TITLE,
      text: 'Seeded for local QA of Library source provenance.'
    },
    plainText: 'Library source provenance depends on bidirectional traces from highlights to settled wiki claims.',
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Library source provenance depends on bidirectional traces from highlights to settled wiki claims.'
          }]
        }
      ]
    },
    sourceRefs: [{
      _id: article._id,
      type: 'article',
      objectId: article._id,
      title: LIBRARY_SOURCE_ARTICLE_TITLE,
      url: LIBRARY_SOURCE_ARTICLE_URL,
      snippet: 'Seeded source used to verify Library highlight provenance.',
      citationLabel: 'Fixture source',
      createdAt: now
    }],
    claims: [{
      claimId,
      text: 'Source-backed thinking improves when a Library highlight can travel into Wiki without losing provenance.',
      support: 'supported',
      sourceRefIds: [article._id],
      citationIds: [highlightId],
      confidence: 0.95,
      lastVerifiedAt: now
    }],
    citations: [{
      _id: highlightId,
      sourceType: 'highlight',
      sourceObjectId: highlightId,
      sourceRefId: article._id,
      sourceTitle: LIBRARY_SOURCE_ARTICLE_TITLE,
      quote: 'A durable claim should show where it came from and where it is now being used.',
      url: LIBRARY_SOURCE_ARTICLE_URL,
      confidence: 0.95
    }],
    discussions: [seededDiscussion],
    aiState: {
      maintenanceSummary: 'Debug fixture page seeded with Library source provenance.',
      quality: {
        status: 'pass',
        checkedAt: now,
        failures: []
      }
    }
  });

  const question = Question ? await Question.create({
    userId,
    text: LIBRARY_SOURCE_QUESTION_TEXT,
    status: 'open',
    linkedTagName: 'source-provenance',
    conceptName: buildLibrarySourceFixtureExternalId(fixtureKey, 'question'),
    linkedHighlightId: highlightId,
    linkedHighlightIds: [highlightId, counterHighlightId],
    blocks: [{
      id: questionBlockId,
      type: 'paragraph',
      text: 'A challenged source provenance claim is grounded only when the Library highlight support trail and counter signal are both visible.',
      highlightId,
      challenge: {
        enabled: true,
        createdAt: now,
        note: 'QA fixture: verify this challenged line shows Library support and counter evidence.',
        support: [{
          id: String(highlightId),
          objectId: String(highlightId),
          sourceKind: 'Library highlight',
          title: LIBRARY_SOURCE_ARTICLE_TITLE,
          quote: 'A durable claim should show where it came from and where it is now being used.',
          source: LIBRARY_SOURCE_ARTICLE_TITLE,
          stance: 'support'
        }],
        counter: [{
          id: String(counterHighlightId),
          objectId: String(counterHighlightId),
          sourceKind: 'Library highlight',
          title: LIBRARY_SOURCE_COUNTER_ARTICLE_TITLE,
          quote: 'A challenged claim should show both the support trail and the counter signal before the line is trusted.',
          source: LIBRARY_SOURCE_COUNTER_ARTICLE_TITLE,
          stance: 'counter'
        }]
      }
    }]
  }) : null;

  const connectionRows = [
    {
      fromType: 'highlight',
      fromId: String(highlightId),
      toType: 'wiki_page',
      toId: String(wikiPage._id),
      relationType: 'supports'
    },
    {
      fromType: 'wiki_page',
      fromId: String(wikiPage._id),
      toType: 'highlight',
      toId: String(highlightId),
      relationType: 'referenced_by'
    },
    {
      fromType: 'article',
      fromId: String(article._id),
      toType: 'wiki_page',
      toId: String(wikiPage._id),
      relationType: 'supports'
    },
    {
      fromType: 'wiki_page',
      fromId: String(wikiPage._id),
      toType: 'article',
      toId: String(article._id),
      relationType: 'supported_by'
    }
  ];

  if (question?._id) {
    connectionRows.push(
      {
        fromType: 'highlight',
        fromId: String(highlightId),
        toType: 'question',
        toId: String(question._id),
        relationType: 'supports',
        scopeType: 'question',
        scopeId: String(question._id)
      },
      {
        fromType: 'highlight',
        fromId: String(counterHighlightId),
        toType: 'question',
        toId: String(question._id),
        relationType: 'contradicts',
        scopeType: 'question',
        scopeId: String(question._id)
      },
      {
        fromType: 'article',
        fromId: String(article._id),
        toType: 'question',
        toId: String(question._id),
        relationType: 'supports',
        scopeType: 'question',
        scopeId: String(question._id)
      },
      {
        fromType: 'article',
        fromId: String(counterArticle._id),
        toType: 'question',
        toId: String(question._id),
        relationType: 'contradicts',
        scopeType: 'question',
        scopeId: String(question._id)
      }
    );
  }

  await Promise.all(connectionRows.map(row => Connection.create({
    ...row,
    scopeType: row.scopeType || LIBRARY_SOURCE_FIXTURE_SCENARIO,
    scopeId: row.scopeId || fixtureKey,
    userId
  })));

  return {
    fixtureKey,
    articleId: String(article._id),
    highlightId: String(highlightId),
    counterArticleId: String(counterArticle._id),
    counterHighlightId: String(counterHighlightId),
    wikiPageId: String(wikiPage._id),
    discussionId: String(seededDiscussion._id),
    questionId: question?._id ? String(question._id) : '',
    questionBlockId,
    articleUrl: LIBRARY_SOURCE_ARTICLE_URL,
    wikiPath: `/wiki/workspace?page=${String(wikiPage._id)}`,
    wikiTalkPath: `/wiki/workspace?page=${String(wikiPage._id)}&tab=talk`,
    libraryPath: `/library?articleId=${String(article._id)}&pull=1`,
    questionPath: question?._id ? `/think?tab=questions&questionId=${String(question._id)}` : '',
    scenario: LIBRARY_SOURCE_FIXTURE_SCENARIO
  };
};

const buildSystemRouter = ({
  authenticateToken,
  parseAiServiceUrl,
  joinUrl,
  allowDebugFixtures = process.env.NODE_ENV !== 'production',
  IntegrationConnection,
  ImportSession,
  NotebookFolder,
  NotebookEntry,
  AgentThread,
  AgentStructureProposal,
  Article,
  WikiPage,
  Connection,
  Question
}) => {
  const router = express.Router();

  router.get('/api/debug/time', (req, res) => {
    const serverNowSec = Math.floor(Date.now() / 1000);
    res.status(200).json({ serverNowISO: new Date().toISOString(), serverNowSec });
  });

  router.get('/api/debug/auth', authenticateToken, (req, res) => {
    const serverNowSec = Math.floor(Date.now() / 1000);
    res.status(200).json({
      tokenSource: req.authInfo?.tokenSource || 'unknown',
      serverNowSec,
      iat: req.authInfo?.iat,
      exp: req.authInfo?.exp
    });
  });

  router.get('/api/debug/ai-upstream', (req, res) => {
    const { origin, hasPath } = parseAiServiceUrl(process.env.AI_SERVICE_URL || '');
    const synthesizeUrl = origin ? joinUrl(origin, '/synthesize') : '';
    res.status(200).json({
      ai_service_origin: origin,
      synthesize_url: synthesizeUrl,
      looks_valid: Boolean(origin) && !hasPath,
      has_path: hasPath
    });
  });

  router.post('/api/debug/fixtures/import-organization', authenticateToken, async (req, res) => {
    if (!allowDebugFixtures) {
      return res.status(404).json({ error: 'Not found.' });
    }
    try {
      const fixture = await createImportOrganizationFixture({
        userId: String(req.user.id),
        IntegrationConnection,
        ImportSession,
        NotebookFolder,
        NotebookEntry,
        AgentThread,
        AgentStructureProposal
      });
      return res.status(201).json({ fixture });
    } catch (error) {
      console.error('❌ Error creating import organization fixture:', error);
      return res.status(500).json({ error: 'Failed to create import organization fixture.' });
    }
  });

  router.delete('/api/debug/fixtures/import-organization', authenticateToken, async (req, res) => {
    if (!allowDebugFixtures) {
      return res.status(404).json({ error: 'Not found.' });
    }
    try {
      await clearImportOrganizationFixtures({
        userId: String(req.user.id),
        IntegrationConnection,
        ImportSession,
        NotebookFolder,
        NotebookEntry,
        AgentThread,
        AgentStructureProposal
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('❌ Error clearing import organization fixtures:', error);
      return res.status(500).json({ error: 'Failed to clear import organization fixtures.' });
    }
  });

  router.post('/api/debug/fixtures/library-source-provenance', authenticateToken, async (req, res) => {
    if (!allowDebugFixtures) {
      return res.status(404).json({ error: 'Not found.' });
    }
    try {
      const fixture = await createLibrarySourceFixture({
        userId: String(req.user.id),
        Article,
        WikiPage,
        Connection,
        Question
      });
      return res.status(201).json({ fixture });
    } catch (error) {
      console.error('❌ Error creating library source provenance fixture:', error);
      return res.status(500).json({ error: 'Failed to create library source provenance fixture.' });
    }
  });

  router.delete('/api/debug/fixtures/library-source-provenance', authenticateToken, async (req, res) => {
    if (!allowDebugFixtures) {
      return res.status(404).json({ error: 'Not found.' });
    }
    try {
      await clearLibrarySourceFixture({
        userId: String(req.user.id),
        Article,
        WikiPage,
        Connection,
        Question
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('❌ Error clearing library source provenance fixture:', error);
      return res.status(500).json({ error: 'Failed to clear library source provenance fixture.' });
    }
  });

  router.get('/health', (req, res) => {
    console.log("Health check ping received.");
    res.status(200).json({ status: "ok", message: "Server is warm." });
  });

  router.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));

  return router;
};

module.exports = {
  buildSystemRouter
};
