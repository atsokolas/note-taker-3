const { Types } = require('mongoose');

const accountId = value => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new Error('An exact account ObjectId is required.');
  return value.toLowerCase();
};

// Counts only. Mixed embedding payloads can hold either strings or ObjectIds.
const accountRecordScopes = ({ models, userId, ownedBoardIds }) => {
  const id = accountId(userId);
  return Object.entries(models).filter(([, model]) => model?.schema && model?.collection).map(([name, model]) => {
    let query = null;
    if (name === 'User') query = { _id: id };
    else if (name === 'Recommendation') query = { recommendingUserId: id };
    else if (['ArticleReadingState', 'QuestionPresence'].includes(name)) query = { userId: id };
    else if (['BoardItem', 'BoardEdge'].includes(name) && Array.isArray(ownedBoardIds)) query = { boardId: { $in: ownedBoardIds } };
    else if (name === 'AgentConnectSession') query = { approvedUserId: id };
    else if (name === 'EmbeddingJob') query = { 'payload.userId': { $in: [id, new Types.ObjectId(id)] } };
    else if (model.schema.path('userId')?.options?.ref === 'User') query = { userId: id };
    return { name, collection: model.collection.name, query };
  });
};

const readAccountRecordInventory = async ({ models, userId }) => {
  const id = accountId(userId);
  const ownedBoardIds = typeof models.Board?.distinct === 'function' ? await models.Board.distinct('_id', { userId: id }) : undefined;
  const scopes = accountRecordScopes({ models, userId: id, ownedBoardIds });
  return recountAccountRecordInventory({ models, inventory: scopes });
};

// Reuse the captured scopes after deleting parents. Re-deriving board ids from
// an empty Board collection would hide orphaned BoardItem/BoardEdge records.
const recountAccountRecordInventory = async ({ models, inventory }) => {
  return Promise.all(inventory.map(async row => {
    if (models[row.name]?.collection?.name !== row.collection) throw new Error(`Inventory model changed: ${row.name}.`);
    return {
      ...row,
      count: row.query ? await models[row.name].countDocuments(row.query) : null,
      reviewRequired: row.query === null
    };
  }));
};

const assertWritersQuiesced = maintenance => {
  for (const name of ['ingressStopped', 'allWritersStopped', 'inFlightDrained', 'transientQueuesDiscarded', 'externalRunnersStopped']) {
    if (maintenance?.[name] !== true) throw new Error(`Maintenance verification missing: ${name}. No preparation writes permitted.`);
  }
};

// Operator-only, not mounted as an HTTP endpoint or wired to a live CLI.
// This disables access and removes locally held provider credentials. It does
// not erase workspace content, stop processes, or revoke remote provider tokens.
const prepareAccountForErasure = async ({ models, userId, maintenance, now = new Date() }) => {
  assertWritersQuiesced(maintenance);
  const id = accountId(userId);
  const required = ['User', 'AgentToken', 'AgentConnectSession', 'ChatgptOAuthGrant', 'ChatgptOAuthRequest', 'PersonalAgent', 'IntegrationConnection'];
  for (const name of required) {
    const method = name === 'User' ? 'updateOne' : 'updateMany';
    if (typeof models?.[name]?.[method] !== 'function') throw new Error(`Missing preparation model: ${name}.`);
  }
  if (typeof models.User.exists !== 'function') throw new Error('User.exists is required.');
  if (!await models.User.exists({ _id: id })) throw new Error('Account not found. No preparation writes permitted.');
  // Disable first. A later failure must leave this account blocked. Reruns
  // preserve its original disabled timestamp and finish the scoped revocations.
  await models.User.updateOne({ _id: id, accountDisabledAt: null }, { $set: { accountDisabledAt: now, 'morningPaper.enabled': false } });
  const updates = [
    ['AgentToken', { userId: id }, { $set: { status: 'revoked', revokedAt: now } }],
    ['AgentConnectSession', { approvedUserId: id }, { $set: { status: 'cancelled', tokenSecret: '' } }],
    ['ChatgptOAuthGrant', { userId: id }, { $set: { revokedAt: now } }],
    ['ChatgptOAuthRequest', { userId: id, status: { $in: ['pending', 'approved'] } }, { $set: { status: 'denied', codeHash: null } }],
    ['PersonalAgent', { userId: id }, { $set: { status: 'disabled' } }],
    ['IntegrationConnection', { userId: id }, { $set: { status: 'revoked', encryptedAccessToken: '', encryptedRefreshToken: '', encryptedApiToken: '' } }]
  ];
  const results = {};
  for (const [name, query, update] of updates) {
    const result = await models[name].updateMany(query, update);
    results[name] = { matched: result.matchedCount, modified: result.modifiedCount };
  }
  return { userId: id, accessDisabled: true, revocations: results, contentErased: false, writersMustRemainStopped: true };
};

// A checklist gate, not a detector of running processes or unknown storage.
// Actual collection/file/provider inventory must be independently reconciled.
const assertErasureResumeReady = ({ maintenance, residualOwnedRecords, unresolvedStorage, queuedJobs }) => {
  assertWritersQuiesced(maintenance);
  if (!Number.isInteger(residualOwnedRecords) || residualOwnedRecords !== 0) throw new Error('Account-owned active records remain or have not been counted.');
  if (!Number.isInteger(queuedJobs) || queuedJobs !== 0) throw new Error('Queued account work remains or has not been counted.');
  if (!Array.isArray(unresolvedStorage) || unresolvedStorage.length) throw new Error('Storage coverage is unresolved.');
  return true;
};

module.exports = { accountRecordScopes, readAccountRecordInventory, recountAccountRecordInventory, prepareAccountForErasure, assertWritersQuiesced, assertErasureResumeReady };
