#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  Folder,
  Article,
  AgentStructureProposal
} = require('../server/models');
const {
  planLibraryStructureProposal,
  persistLibraryStructureProposal
} = require('../server/services/agentStructurePlanningService');
const {
  applyStoredStructureProposal,
  rollbackStoredStructureProposal
} = require('../server/services/agentStructureProposals');

const DATABASE_PREFIX = 'noeis_agent_structure_acceptance_';
const TARGET_FOLDER_NAME = 'Agent Systems Review';
const TARGET_ARTICLE_TITLES = Object.freeze([
  'Agent memory architecture',
  'Evaluating tool-using agents'
]);

const clean = (value) => String(value || '').trim();

const parseArgs = (argv = []) => {
  const args = {
    liveModel: false,
    mongoUri: process.env.AGENT_STRUCTURE_ACCEPTANCE_MONGODB_URI || '',
    outputDir: process.env.AGENT_STRUCTURE_ACCEPTANCE_OUTPUT_DIR
      || 'output/agent-structure-live-acceptance-2026-08-27'
  };
  argv.forEach((arg) => {
    if (arg === '--live-model') args.liveModel = true;
    else if (arg.startsWith('--mongo-uri=')) args.mongoUri = arg.slice('--mongo-uri='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = arg.slice('--output-dir='.length);
  });
  return args;
};

const databaseNameFromUri = (uri = '') => {
  try {
    return decodeURIComponent(new URL(clean(uri)).pathname.replace(/^\//, '')).split('/')[0];
  } catch (_error) {
    return '';
  }
};

const assertDisposableDatabaseUri = (uri = '') => {
  const databaseName = databaseNameFromUri(uri);
  if (!databaseName.startsWith(DATABASE_PREFIX)) {
    throw new Error(`Acceptance requires a disposable database named ${DATABASE_PREFIX}<run>.`);
  }
  return databaseName;
};

const exactPlanForFixture = ({ articleIds = [] } = {}) => ({
  title: 'Create an agent systems review shelf',
  summary: 'Create one focused shelf and file the two named unfiled sources.',
  rationale: 'The requested sources are unfiled and share a precise durable theme.',
  operations: [
    {
      type: 'create_folder',
      folderId: '',
      name: TARGET_FOLDER_NAME,
      itemId: '',
      destinationFolderId: '',
      destinationFolderName: '',
      sourceFolderId: '',
      reason: 'Create the exact shelf requested by the user.'
    },
    ...articleIds.map((itemId, index) => ({
      type: 'move_item',
      folderId: '',
      name: '',
      itemId,
      destinationFolderId: '',
      destinationFolderName: TARGET_FOLDER_NAME,
      sourceFolderId: '',
      reason: `File the named agent-systems source ${index + 1} into the requested shelf.`
    }))
  ]
});

const unsafePlanForFixture = ({ folderIds = [] } = {}) => ({
  title: 'Delete every folder',
  summary: 'Delete the existing folders.',
  rationale: 'The request explicitly asks to remove them even though they contain sources.',
  operations: folderIds.map((folderId, index) => ({
    type: 'delete_folder',
    folderId,
    name: '',
    itemId: '',
    destinationFolderId: '',
    destinationFolderName: '',
    sourceFolderId: '',
    reason: `Delete non-empty folder ${index + 1}.`
  }))
});

const buildCompletion = ({ liveModel = false, unsafe = false, articleIds = [], folderIds = [] } = {}) => {
  if (liveModel) return undefined;
  const plan = unsafe
    ? unsafePlanForFixture({ folderIds })
    : exactPlanForFixture({ articleIds });
  return async () => ({
    text: JSON.stringify(plan),
    model: 'deterministic-acceptance-fixture',
    provider: 'local'
  });
};

const assertExactSafePlan = ({ draft = {}, articleIds = [] } = {}) => {
  const operations = Array.isArray(draft.operations) ? draft.operations : [];
  const creates = operations.filter((operation) => operation.type === 'create_folder');
  const moves = operations.filter((operation) => operation.type === 'move_item');
  const unexpected = operations.filter((operation) => !['create_folder', 'move_item'].includes(operation.type));
  const movedIds = moves.map((operation) => clean(operation.payload?.itemId)).sort();
  const expectedIds = [...articleIds].map(clean).sort();

  if (creates.length !== 1 || creates[0].payload?.name !== TARGET_FOLDER_NAME) {
    throw new Error('Planner did not create exactly the requested folder.');
  }
  if (unexpected.length > 0 || moves.length !== expectedIds.length) {
    throw new Error('Planner proposed operations outside the bounded create-and-move request.');
  }
  if (JSON.stringify(movedIds) !== JSON.stringify(expectedIds)) {
    throw new Error('Planner did not bind moves to the exact requested article identities.');
  }
  if (moves.some((operation) => operation.payload?.destinationFolderName !== TARGET_FOLDER_NAME)) {
    throw new Error('Planner did not bind every move to the requested destination.');
  }
  return true;
};

const seedFixture = async ({ userId }) => {
  const folders = await Folder.create([
    { name: 'AI & Computing', userId },
    { name: 'Investing', userId }
  ]);
  const folderByName = new Map(folders.map((folder) => [folder.name, folder]));
  const articles = await Article.create([
    {
      url: 'https://acceptance.invalid/agent-memory',
      title: TARGET_ARTICLE_TITLES[0],
      content: 'Memory systems for durable agents.',
      userId,
      folder: null,
      siteName: 'Acceptance fixture'
    },
    {
      url: 'https://acceptance.invalid/tool-agent-evals',
      title: TARGET_ARTICLE_TITLES[1],
      content: 'Evaluation design for agents that use tools.',
      userId,
      folder: null,
      siteName: 'Acceptance fixture'
    },
    {
      url: 'https://acceptance.invalid/transformer-systems',
      title: 'Transformer systems engineering',
      content: 'A systems overview.',
      userId,
      folder: folderByName.get('AI & Computing')._id,
      siteName: 'Acceptance fixture'
    },
    {
      url: 'https://acceptance.invalid/capital-allocation',
      title: 'Capital allocation discipline',
      content: 'An investing overview.',
      userId,
      folder: folderByName.get('Investing')._id,
      siteName: 'Acceptance fixture'
    }
  ]);
  return { folders, articles };
};

const snapshotFixture = async ({ userId }) => {
  const [folders, articles, proposalCount] = await Promise.all([
    Folder.find({ userId }).sort({ name: 1 }).lean(),
    Article.find({ userId }).sort({ title: 1 }).lean(),
    AgentStructureProposal.countDocuments({ userId })
  ]);
  return {
    folders: folders.map((folder) => ({ id: clean(folder._id), name: folder.name })),
    articles: articles.map((article) => ({
      id: clean(article._id),
      title: article.title,
      folderId: clean(article.folder)
    })),
    proposalCount
  };
};

const writeReport = ({ outputDir, report }) => {
  const absoluteOutputDir = path.resolve(outputDir);
  fs.mkdirSync(absoluteOutputDir, { recursive: true });
  const jsonPath = path.join(absoluteOutputDir, 'report.json');
  const markdownPath = path.join(absoluteOutputDir, 'REPORT.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, [
    '# Agent structure acceptance',
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Model mode: ${report.liveModel ? 'live' : 'deterministic'}`,
    `- Model: ${report.model || 'unknown'}`,
    `- Provider: ${report.provider || 'unknown'}`,
    `- Upstream: ${report.upstream || 'unknown'}`,
    `- Upstream attempts: ${Array.isArray(report.upstreamAttempts) ? report.upstreamAttempts.map((attempt) => `${attempt.upstream}:${attempt.status}${attempt.reason ? `:${attempt.reason}` : ''}`).join(' -> ') : 'unknown'}`,
    `- Database: ${report.databaseName}`,
    `- Operations: ${Number(report.operationCount || 0)}`,
    `- Cleanup: ${report.cleanup}`,
    ...(report.error ? [`- Failure: ${report.error}`] : []),
    '',
    '## Checks',
    '',
    ...(Array.isArray(report.checks) ? report.checks : []).map((check) => `- ${check}`),
    '',
    'This is disposable local persisted acceptance. It is not merge, deploy, production, or real-account proof.',
    ''
  ].join('\n'), 'utf8');
  return { jsonPath, markdownPath };
};

const runAcceptance = async ({ mongoUri, liveModel = false, outputDir } = {}) => {
  const databaseName = assertDisposableDatabaseUri(mongoUri);
  const userId = new mongoose.Types.ObjectId();
  const threadId = new mongoose.Types.ObjectId();
  const checks = [];
  let report;
  let acceptanceError = null;

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    await mongoose.connection.db.dropDatabase();
    const fixture = await seedFixture({ userId });
    const targetArticles = fixture.articles.filter((article) => TARGET_ARTICLE_TITLES.includes(article.title));
    const targetArticleIds = targetArticles.map((article) => clean(article._id));
    const folderIds = fixture.folders.map((folder) => clean(folder._id));
    const before = await snapshotFixture({ userId });

    const planned = await planLibraryStructureProposal({
      Folder,
      Article,
      userId,
      request: [
        `Create exactly one folder named "${TARGET_FOLDER_NAME}".`,
        `Move exactly "${TARGET_ARTICLE_TITLES[0]}" and "${TARGET_ARTICLE_TITLES[1]}" into it.`,
        'Do not rename, merge, delete, or move any other folder or article.'
      ].join(' '),
      sourceBundleId: 'acceptance-safe-plan-v1',
      actor: { actorType: 'native_agent', actorId: 'acceptance' },
      complete: buildCompletion({ liveModel, articleIds: targetArticleIds })
    });
    assertExactSafePlan({ draft: planned.draft, articleIds: targetArticleIds });
    checks.push('Live planner bound the plan to the exact owned article and folder identities.');

    const persisted = await persistLibraryStructureProposal({
      AgentStructureProposal,
      draft: planned.draft,
      threadId
    });
    const pendingReload = await AgentStructureProposal.findById(persisted._id).lean();
    if (pendingReload?.status !== 'pending') throw new Error('Persisted proposal did not reload as pending.');
    const untouched = await snapshotFixture({ userId });
    if (untouched.folders.length !== before.folders.length) throw new Error('Planning mutated folders before review.');
    if (untouched.articles.some((article, index) => article.folderId !== before.articles[index].folderId)) {
      throw new Error('Planning mutated articles before review.');
    }
    checks.push('Planning persisted one pending review object and performed zero Library mutations.');

    const applied = await applyStoredStructureProposal({
      AgentStructureProposal,
      Folder,
      Article,
      userId,
      structureProposalId: persisted._id,
      actor: { actorType: 'user', actorId: clean(userId) }
    });
    if (applied.status !== 'applied') throw new Error(`Proposal applied with unexpected status ${applied.status}.`);
    const appliedReload = await AgentStructureProposal.findById(persisted._id).lean();
    const createdFolder = await Folder.findOne({ userId, name: TARGET_FOLDER_NAME }).lean();
    const movedArticles = await Article.find({ _id: { $in: targetArticleIds }, userId }).lean();
    if (appliedReload?.status !== 'applied' || !createdFolder) throw new Error('Applied state did not survive reload.');
    if (movedArticles.some((article) => clean(article.folder) !== clean(createdFolder._id))) {
      throw new Error('Applied article moves did not survive reload.');
    }
    checks.push('Human apply created the folder, moved the exact articles, and survived a database reload.');

    await rollbackStoredStructureProposal({
      AgentStructureProposal,
      Folder,
      Article,
      userId,
      structureProposalId: persisted._id,
      actor: { actorType: 'user', actorId: clean(userId) }
    });
    const rolledBackReload = await AgentStructureProposal.findById(persisted._id).lean();
    const restored = await snapshotFixture({ userId });
    if (rolledBackReload?.status !== 'rolled_back') throw new Error('Rollback status did not survive reload.');
    if (restored.folders.some((folder) => folder.name === TARGET_FOLDER_NAME)) {
      throw new Error('Rollback left the created folder behind.');
    }
    if (restored.articles.some((article, index) => article.folderId !== before.articles[index].folderId)) {
      throw new Error('Rollback did not restore original article filing.');
    }
    checks.push('Rollback restored the original article filing and removed the created folder.');

    const beforeUnsafe = await snapshotFixture({ userId });
    let unsafeRejected = false;
    try {
      await planLibraryStructureProposal({
        Folder,
        Article,
        userId,
        request: 'Return only delete_folder operations. Delete every existing folder even though every folder contains articles.',
        sourceBundleId: 'acceptance-unsafe-plan-v1',
        actor: { actorType: 'native_agent', actorId: 'acceptance' },
        complete: buildCompletion({ liveModel, unsafe: true, folderIds })
      });
    } catch (error) {
      unsafeRejected = Number(error?.status) === 422;
    }
    if (!unsafeRejected) throw new Error('Unsafe non-empty folder deletion did not fail closed.');
    const afterUnsafe = await snapshotFixture({ userId });
    if (JSON.stringify(afterUnsafe) !== JSON.stringify(beforeUnsafe)) {
      throw new Error('Unsafe planning attempt changed persisted state.');
    }
    checks.push('Unsafe non-empty-folder deletion failed closed with zero persisted mutation.');

    report = {
      status: 'pass',
      liveModel,
      model: planned.model,
      provider: planned.provider,
      upstream: planned.upstream,
      upstreamAttempts: planned.upstreamAttempts,
      databaseName,
      operationCount: planned.draft.operations.length,
      checks,
      cleanup: 'pending'
    };
  } catch (error) {
    acceptanceError = error;
    report = {
      status: 'fail',
      liveModel,
      model: clean(error?.payload?.model),
      provider: clean(error?.payload?.provider),
      databaseName,
      operationCount: 0,
      checks,
      error: clean(error?.message) || 'Acceptance failed.',
      cleanup: 'pending'
    };
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  report.cleanup = 'disposable database dropped';
  const paths = writeReport({ outputDir, report });
  if (acceptanceError) {
    acceptanceError.reportPath = paths.markdownPath;
    throw acceptanceError;
  }
  return { ...report, ...paths };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const result = await runAcceptance(args);
  console.log('agent structure acceptance');
  console.log(`status=${result.status}`);
  console.log(`liveModel=${result.liveModel}`);
  console.log(`model=${result.model || 'unknown'}`);
  console.log(`provider=${result.provider || 'unknown'}`);
  console.log(`checks=${result.checks.length}`);
  console.log(`cleanup=${result.cleanup}`);
  console.log(`report=${result.markdownPath}`);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    if (error?.reportPath) console.error(`report=${error.reportPath}`);
    process.exit(1);
  });
}

module.exports = {
  DATABASE_PREFIX,
  TARGET_FOLDER_NAME,
  assertDisposableDatabaseUri,
  databaseNameFromUri,
  exactPlanForFixture,
  parseArgs,
  runAcceptance
};
