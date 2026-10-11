const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { MongoMemoryServer } = require('mongodb-memory-server');
const models = { ...require('../../models'), ...require('../../models/chatgptOAuthModels') };
const { buildAccountAccessCheck } = require('../accountAccessService');
const { prepareAccountForErasure, readAccountRecordInventory, recountAccountRecordInventory, assertErasureResumeReady } = require('../accountErasurePreparation');
const a = '111111111111111111111111', b = '222222222222222222222222';
const maintenance = { ingressStopped: true, allWritersStopped: true, inFlightDrained: true, transientQueuesDiscarded: true, externalRunnersStopped: true };

test('preparation and restart gate refuse an unquiesced or unresolved operation', async () => {
  let writes = 0;
  await assert.rejects(prepareAccountForErasure({ models: { User: { updateOne: () => { writes++; } } }, userId: a }), /Maintenance verification missing/);
  assert.equal(writes, 0);
  for (const missing of Object.keys(maintenance)) {
    assert.throws(() => assertErasureResumeReady({ maintenance: { ...maintenance, [missing]: false }, residualOwnedRecords: 0, queuedJobs: 0, unresolvedStorage: [] }), /Maintenance verification missing/);
  }
  for (const fields of [{ residualOwnedRecords: 1, queuedJobs: 0, unresolvedStorage: [] }, { residualOwnedRecords: 0, queuedJobs: 1, unresolvedStorage: [] }, { residualOwnedRecords: 0, queuedJobs: 0, unresolvedStorage: ['manual archive'] }, { residualOwnedRecords: 0, unresolvedStorage: [] }]) {
    assert.throws(() => assertErasureResumeReady({ maintenance, ...fields }));
  }
  assert.equal(assertErasureResumeReady({ maintenance, residualOwnedRecords: 0, queuedJobs: 0, unresolvedStorage: [] }), true);
});

test('real local Mongo: disable/revoke is scoped and retryable; counts include mixed-ID queues', async () => {
  // No application URI, environment file or external service is used. A cached
  // mongod runs with a new disposable database under the OS temp directory.
  const cached = path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-8.2.6');
  assert.ok(fs.existsSync(cached), 'Cached test mongod is required; do not download or use a real database.');
  const mongo = await MongoMemoryServer.create({ binary: { systemBinary: cached, version: '8.2.6' } });
  try {
    await mongoose.connect(mongo.getUri());
    for (const [id, username] of [[a, 'synthetic-a'], [b, 'synthetic-b']]) {
      await models.User.create({ _id: id, username, password: 'synthetic-unusable-value', morningPaper: { enabled: true } });
      await models.AgentToken.create({ userId: id, label: 'Synthetic', hashedSecret: `unusable-${id}`, secretPrefix: 'synthetic', status: 'active' });
      await models.ChatgptOAuthGrant.create({ userId: id, familyId: `synthetic-${id}`, clientId: 'synthetic-client', resource: 'https://api.invalid/mcp', scopes: ['read'], refreshHash: `unusable-${id}`, expiresAt: new Date('2099-01-01') });
      await models.ChatgptOAuthRequest.create({ userId: id, requestId: `synthetic-${id}`, clientId: 'synthetic-client', redirectUri: 'https://client.invalid/callback', resource: 'https://api.invalid/mcp', scopes: ['read'], challenge: 'synthetic', status: 'approved', codeHash: 'unusable', expiresAt: new Date('2099-01-01') });
      await models.PersonalAgent.create({ userId: id, name: 'Synthetic', apiKeyHash: `unusable-${id}` });
      await models.IntegrationConnection.create({ userId: id, provider: 'synthetic', status: 'connected', encryptedApiToken: 'unusable-synthetic' });
      await models.AgentConnectSession.create({ approvedUserId: id, sessionId: `synthetic-${id}`, pollSecretHash: 'unusable', deviceCode: `unusable-${id}`, status: 'approved', tokenSecret: 'unusable', expiresAt: new Date('2099-01-01') });
      const board = await models.Board.create({ userId: id, scopeType: 'concept', scopeId: 'synthetic-topic' });
      const items = await models.BoardItem.create([{ boardId: board._id, type: 'note', text: 'Fictional first note.' }, { boardId: board._id, type: 'note', text: 'Fictional second note.' }]);
      await models.BoardEdge.create({ boardId: board._id, fromItemId: items[0]._id, toItemId: items[1]._id, relation: 'supports' });
      await models.Recommendation.create({ recommendingUserId: id, articleUrl: 'https://source.invalid/synthetic', articleTitle: 'Fictional recommendation' });
      await models.QuestionPresence.create({ userId: id, slug: 'synthetic-question', by: 'Fictional reader', at: new Date() });
      await models.ArticleReadingState.create({ userId: id, articleId: '333333333333333333333333', anchor: { text: 'Fictional passage.', startOffsetApprox: 0 }, ratio: 0, visitedAt: new Date() });
    }
    for (const [index, owner] of [a, new mongoose.Types.ObjectId(a), b].entries()) {
      await models.EmbeddingJob.create({ collection: 'synthetic', objectId: `synthetic-${index}`, payload: { userId: owner }, text: 'Fictional passage.', status: 'queued' });
    }
    const inventory = await readAccountRecordInventory({ models, userId: a });
    assert.equal(inventory.find(row => row.name === 'EmbeddingJob').count, 2);
    assert.equal(inventory.find(row => row.name === 'AgentConnectSession').count, 1);
    assert.equal(inventory.find(row => row.name === 'BoardItem').count, 2);
    assert.equal(inventory.find(row => row.name === 'BoardEdge').count, 1);
    for (const name of ['Recommendation', 'QuestionPresence', 'ArticleReadingState']) assert.equal(inventory.find(row => row.name === name).count, 1);
    assert.ok(inventory.some(row => row.reviewRequired && row.name === 'ChatgptOAuthControl'));
    const active = buildAccountAccessCheck({ User: models.User });
    await models.User.collection.updateOne({ _id: new mongoose.Types.ObjectId(a) }, { $unset: { accountDisabledAt: '' } });
    assert.equal(await active(a), true); assert.equal(await active(b), true);
    const firstDisabledAt = new Date('2026-10-11T19:00:00Z');
    await prepareAccountForErasure({ models, userId: a, maintenance, now: firstDisabledAt });
    await prepareAccountForErasure({ models, userId: a, maintenance, now: new Date('2026-10-12T19:00:00Z') });
    assert.equal(await active(a), false); assert.equal(await active(b), true);
    const owner = await models.User.findById(a).lean();
    assert.equal(owner.accountDisabledAt.getTime(), firstDisabledAt.getTime()); assert.equal(owner.morningPaper.enabled, false);
    assert.equal((await models.AgentToken.findOne({ userId: a })).status, 'revoked');
    assert.ok((await models.ChatgptOAuthGrant.findOne({ userId: a })).revokedAt);
    assert.equal((await models.ChatgptOAuthRequest.findOne({ userId: a })).status, 'denied');
    assert.equal((await models.PersonalAgent.findOne({ userId: a })).status, 'disabled');
    assert.equal((await models.AgentConnectSession.findOne({ approvedUserId: a })).tokenSecret, '');
    assert.equal((await models.IntegrationConnection.findOne({ userId: a })).encryptedApiToken, '');
    assert.equal((await models.IntegrationConnection.findOne({ userId: b })).status, 'connected');
    // Content/jobs have deliberately not been erased by preparation: resume
    // must still fail until the separately reviewed cleanup is complete.
    assert.equal(await models.EmbeddingJob.countDocuments(), 3);
    assert.throws(() => assertErasureResumeReady({ maintenance, residualOwnedRecords: 1, queuedJobs: 2, unresolvedStorage: [] }));
    await models.Board.deleteOne({ userId: a }); // Synthetic local fixture only.
    const recounted = await recountAccountRecordInventory({ models, inventory });
    assert.equal(recounted.find(row => row.name === 'BoardItem').count, 2, 'captured child scopes must still find orphaned records');
    assert.equal(recounted.find(row => row.name === 'BoardEdge').count, 1);
    const failureModels = { ...models, AgentToken: { updateMany: async () => { throw new Error('Synthetic revocation interruption'); } } };
    await assert.rejects(prepareAccountForErasure({ models: failureModels, userId: b, maintenance }), /Synthetic revocation interruption/);
    assert.equal(await active(b), false, 'partial failure leaves the account disabled');
    await prepareAccountForErasure({ models, userId: b, maintenance });
    await models.User.deleteOne({ _id: a }); // Synthetic local fixture only.
    assert.equal(await active(a), false, 'removing the account also denies its stale sessions');
    await assert.rejects(prepareAccountForErasure({ models, userId: a, maintenance }), /Account not found/);
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});
