const crypto = require('crypto');
const express = require('express');

const DEBUG_FIXTURE_SCENARIO = 'import_organization';
const DEBUG_FIXTURE_PREFIX = `debug-fixture:${DEBUG_FIXTURE_SCENARIO}`;
const ROOT_NOTEBOOK_TITLE = 'Imported Roadmap';
const CREATED_FOLDER_NAME = 'Workbench Intake';
const SOURCE_FOLDER_NAME = 'Product specs';
const REJECTED_RENAME_TARGET = 'Legacy Product specs';

const clean = (value = '') => String(value || '').trim();
const createBlockId = () => (
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`
);
const buildFixtureExternalId = (fixtureKey = '', suffix = '') => `${DEBUG_FIXTURE_PREFIX}:${fixtureKey}:${suffix}`;

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
  AgentStructureProposal
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
