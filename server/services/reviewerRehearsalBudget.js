const { createHash, randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const policy = require('./reviewerRehearsalPolicy.json');

const MODEL = 'openai/gpt-4o-mini';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const RESERVATION_MICRO_USD = 100000;
const MAX_REQUESTS = 3;
const MAX_RESERVED_MICRO_USD = 300000;
const MAX_OUTPUT_TOKENS = 4200;
const MAX_MESSAGE_BYTES = 65536;
const MAX_TOKEN_COST = 0.0298;
const HOLD_REASON = 'Reviewer rehearsal: semantic indexing held; no inference attempted by this hold.';
const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const validGenerationId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value);
const failureCodes = new Set(['REVIEWER_PROVIDER_REJECTED', 'REVIEWER_PROVIDER_RECEIPT_INVALID', 'REVIEWER_LEDGER_SETTLEMENT_FAILED', 'REVIEWER_PROVIDER_UNCERTAIN']);
const isReviewer = (userId, target = policy) => validId(target.userId) && String(userId || '') === target.userId;
const gateError = (code, message, status = 409) => Object.assign(new Error(message), { code, status });

// This is an existing authenticated concept read, not a support executor or
// new grant. Only the browser-verified private fixture may disclose its owner.
const verifyReviewerConceptOwner = async ({ concept, userId, User, target = policy } = {}) => {
  if (!User || !validId(target.identityConceptId) || String(concept?._id) !== target.identityConceptId
    || concept?.isPublic !== false || String(concept?.userId) !== String(userId) || !validId(String(userId))) return null;
  const owner = await User.findOne({ _id: userId, username: 'noeis_openai_review', accountDisabledAt: null })
    .select('_id username').lean();
  if (!owner || String(owner._id) !== String(userId)) return null;
  return { userId: String(owner._id), username: owner.username, conceptId: target.identityConceptId, ownershipVerified: true,
    holdsActive: isReviewer(owner._id, target),
    fixtureBindingComplete: validId(target.pageId) && Array.isArray(target.sourceIds) && target.sourceIds.length === 2
      && target.sourceIds.every(validId) && new Set(target.sourceIds).size === 2 };
};

const holdReviewerSourceEvent = async ({ event, userId, WikiSourceEvent, target = policy } = {}) => {
  const ownerId = String(event?.userId || userId || '');
  const alreadyHeld = event?.status === 'held' && event?.metadata?.reviewerRehearsalHold;
  if (!isReviewer(ownerId, target) && !isReviewer(userId, target) && !alreadyHeld) return null;
  if (!event?._id || !event.userId || (userId && String(userId) !== ownerId)) {
    throw gateError('REVIEWER_SOURCE_EVENT_OWNER_MISMATCH', 'Reviewer source-event ownership is unresolved.', 422);
  }
  try {
    const result = await WikiSourceEvent.updateOne({ _id: event._id, userId: event.userId }, { $set: {
      status: 'held', lockedAt: null, nextAttemptAt: null,
      'metadata.reviewerRehearsalHold': { reason: 'reviewer_rehearsal', inferenceAttemptedByHold: false }
    } });
    if (result.matchedCount !== 1) throw new Error('Hold did not match its owned event.');
  } catch (_error) {
    throw gateError('REVIEWER_SOURCE_EVENT_HOLD_UNAVAILABLE', 'Reviewer source-event hold could not be persisted.', 503);
  }
  return { event: { _id: event._id, status: 'held' }, pages: [], deferred: true, held: true,
    reason: 'reviewer_rehearsal', inferenceAttemptedByHold: false };
};

// The fixed _id is the lifetime budget identity. Neither clients nor retries can
// choose/reset it. Mongo's _id uniqueness and conditional update serialize POSTs.
const ledgerCollection = () => {
  if (!mongoose.connection.db) throw gateError('REVIEWER_LEDGER_UNAVAILABLE', 'Reviewer budget storage is unavailable.', 503);
  return mongoose.connection.db.collection('reviewer_rehearsal_budgets');
};

// Owned rehearsal metadata on the existing private Wiki read. Never return
// cached completions, prompts, credentials or another ledger owner's values.
const readReviewerBudgetStatus = async ({ userId, pageId, target = policy, getLedger = ledgerCollection } = {}) => {
  if (!isReviewer(userId, target) || !validId(target.pageId) || String(pageId) !== target.pageId) return null;
  const limits = { maxRequests: MAX_REQUESTS, maxReservedUsd: MAX_RESERVED_MICRO_USD / 1e6 };
  try {
    const row = await getLedger().findOne({ _id: target.ledgerId }, { projection: {
      userId: 1, pageId: 1, requests: 1, reservedMicroUsd: 1, inFlight: 1, frozen: 1, failureCode: 1,
      'receipts.generationId': 1, 'receipts.usage': 1
    } });
    if (!row) return { ...limits, status: 'not_started', requests: 0, reservedUsd: 0, receipts: [] };
    if (row.userId !== target.userId || row.pageId !== target.pageId
      || !Number.isInteger(row.requests) || row.requests < 0 || row.requests > MAX_REQUESTS
      || !Number.isInteger(row.reservedMicroUsd) || row.reservedMicroUsd < 0 || row.reservedMicroUsd > MAX_RESERVED_MICRO_USD
      || row.reservedMicroUsd !== row.requests * RESERVATION_MICRO_USD
      || typeof row.inFlight !== 'boolean' || typeof row.frozen !== 'boolean'
      || (row.failureCode !== undefined && row.failureCode !== '' && !failureCodes.has(row.failureCode))
      || !Array.isArray(row.receipts) || row.receipts.length > row.requests
      || row.receipts.some(receipt => !validGenerationId(receipt.generationId) || !Number.isInteger(receipt.usage?.promptTokens) || receipt.usage.promptTokens < 0
        || receipt.usage.promptTokens > 128000 || !Number.isInteger(receipt.usage?.completionTokens)
        || receipt.usage.completionTokens < 0 || receipt.usage.completionTokens > MAX_OUTPUT_TOKENS
        || !Number.isFinite(receipt.usage?.cost) || receipt.usage.cost < 0 || receipt.usage.cost > MAX_TOKEN_COST)) {
      return { ...limits, status: 'unavailable', code: 'REVIEWER_LEDGER_UNVERIFIED' };
    }
    return { ...limits, status: row.frozen || row.inFlight ? 'held' : (row.requests >= MAX_REQUESTS ? 'exhausted' : 'available'),
      requests: row.requests, reservedUsd: row.reservedMicroUsd / 1e6,
      inFlight: Boolean(row.inFlight), frozen: Boolean(row.frozen), failureCode: row.failureCode || '',
      receipts: row.receipts.map(receipt => ({ generationId: String(receipt.generationId || ''),
        usage: { promptTokens: receipt.usage.promptTokens, completionTokens: receipt.usage.completionTokens, cost: receipt.usage.cost } })) };
  } catch (_error) {
    return { ...limits, status: 'unavailable', code: 'REVIEWER_LEDGER_UNAVAILABLE' };
  }
};

const buildPayload = (request = {}) => {
  const messages = request.messages;
  if (!Array.isArray(messages) || messages.length !== 2
    || messages[0]?.role !== 'system' || messages[1]?.role !== 'user'
    || messages.some(message => typeof message.content !== 'string' || !message.content.trim())) {
    throw gateError('REVIEWER_INPUT_INVALID', 'Reviewer maintenance requires two plain text messages.', 422);
  }
  if (messages.reduce((bytes, message) => bytes + Buffer.byteLength(message.content, 'utf8'), 0) > MAX_MESSAGE_BYTES) {
    throw gateError('REVIEWER_INPUT_TOO_LARGE', 'Reviewer maintenance input exceeds its byte limit.', 422);
  }
  // Construct the wire payload from an allowlist. Never forward caller routes,
  // retries, reasoning, plugins, tools, transforms or provider preferences.
  return {
    model: MODEL,
    messages: messages.map(({ role, content }) => ({ role, content })),
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
    service_tier: 'default',
    provider: {
      require_parameters: true,
      allow_fallbacks: false,
      max_price: { prompt: 0.20, completion: 1, request: 0 }
    }
  };
};

const createBoundedReviewerChat = ({
  target = policy,
  getLedger = ledgerCollection,
  fetchFn = (...args) => fetch(...args),
  apiKey = () => String(process.env.OPENROUTER_API_KEY || '').trim(),
  timeoutMs = 30000
} = {}) => async request => {
  const payload = buildPayload(request);
  const key = apiKey();
  if (!key) throw gateError('REVIEWER_PROVIDER_UNAVAILABLE', 'Reviewer inference is unavailable.', 503);
  if (!validId(target.userId) || !validId(target.pageId)
    || target.ledgerId !== policy.ledgerId) {
    throw gateError('REVIEWER_POLICY_UNVERIFIED', 'Reviewer policy requires verified immutable identities.', 503);
  }
  let ledger;
  const identity = { _id: target.ledgerId };
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const attemptId = randomUUID();
  try {
    ledger = getLedger();
    try {
      await ledger.updateOne(identity, { $setOnInsert: {
        userId: target.userId,
        pageId: target.pageId,
        requests: 0,
        reservedMicroUsd: 0,
        inFlight: false,
        frozen: false,
        receipts: [],
        createdAt: new Date()
        } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // A simultaneous first request may have inserted the same lifetime _id.
      // Read and verify it below; never replace/reset its counters.
    }
    const prior = await ledger.findOne(identity);
    if (prior?.userId !== target.userId || prior?.pageId !== target.pageId) {
      throw gateError('REVIEWER_LEDGER_IDENTITY_MISMATCH', 'The lifetime reviewer budget belongs to different fixtures.', 503);
    }
    const cached = prior.receipts?.find(receipt => receipt.requestHash === requestHash && receipt.completion);
    if (cached) return cached.completion;
    const reserved = await ledger.findOneAndUpdate({
      ...identity,
      userId: target.userId,
      pageId: target.pageId,
      requests: { $lt: MAX_REQUESTS },
      reservedMicroUsd: { $lte: MAX_RESERVED_MICRO_USD - RESERVATION_MICRO_USD },
      inFlight: false,
      frozen: false,
      'receipts.requestHash': { $ne: requestHash }
    }, {
      $inc: { requests: 1, reservedMicroUsd: RESERVATION_MICRO_USD },
      $set: { inFlight: true, attemptId, requestHash, startedAt: new Date() }
    }, { returnDocument: 'after', includeResultMetadata: false });
    if (!reserved) {
      const latest = await ledger.findOne(identity);
      const replay = latest?.receipts?.find(receipt => receipt.requestHash === requestHash && receipt.completion);
      if (replay) return replay.completion;
      throw gateError('REVIEWER_BUDGET_HELD', 'Reviewer inference is in flight, frozen or exhausted; no new request was sent.');
    }
  } catch (error) {
    if ((typeof error.code === 'string' && error.code.startsWith('REVIEWER_'))) throw error;
    throw gateError('REVIEWER_LEDGER_UNAVAILABLE', 'Reviewer budget reservation could not be verified; no provider request was sent.', 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(30000, Math.max(1, timeoutMs)));
  try {
    // Exactly one provider POST after a durable reservation. No retry/hint-drop
    // path. Keep the timer alive through body consumption, not just headers.
    const response = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) throw gateError('REVIEWER_PROVIDER_REJECTED', 'The bounded provider request was rejected.', 502);
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    const usage = data?.usage || {};
    if (typeof text !== 'string' || !text.trim() || data.model !== MODEL || !validGenerationId(data.id)
      || !Number.isInteger(usage.prompt_tokens) || usage.prompt_tokens < 0 || usage.prompt_tokens > 128000
      || !Number.isInteger(usage.completion_tokens) || usage.completion_tokens < 0 || usage.completion_tokens > MAX_OUTPUT_TOKENS
      || !Number.isFinite(usage.cost) || usage.cost < 0 || usage.cost > MAX_TOKEN_COST) {
      throw gateError('REVIEWER_PROVIDER_RECEIPT_INVALID', 'The provider did not return a verifiable bounded receipt.', 502);
    }
    const completion = { text, model: MODEL, provider: 'openrouter' };
    const settled = await ledger.updateOne({ ...identity, attemptId, inFlight: true }, {
      $set: { inFlight: false, completedAt: new Date() },
      $push: { receipts: {
        requestHash,
        attemptId,
        generationId: String(data.id || ''),
        usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, cost: usage.cost },
        completion,
        completedAt: new Date()
      } }
    });
    if (settled.matchedCount !== 1) throw gateError('REVIEWER_LEDGER_SETTLEMENT_FAILED', 'Reviewer request settlement could not be confirmed.', 503);
    return completion;
  } catch (error) {
    // Retain the reservation and lock on ALL uncertain/error attempts. No timer
    // or restart may reclaim an in-flight paid request into another attempt.
    await ledger.updateOne({ ...identity, attemptId }, { $set: {
      frozen: true,
      failureCode: (typeof error.code === 'string' && error.code.startsWith('REVIEWER_')) ? error.code : 'REVIEWER_PROVIDER_UNCERTAIN'
    } }).catch(() => {});
    if ((typeof error.code === 'string' && error.code.startsWith('REVIEWER_'))) throw error;
    throw gateError('REVIEWER_PROVIDER_UNCERTAIN', 'Reviewer inference outcome is uncertain; its budget remains reserved.', 503);
  } finally {
    clearTimeout(timer);
  }
};

const reviewerMaintenanceArgs = ({ userId, page, target = policy, chat = createBoundedReviewerChat({ target }) } = {}) => {
  if (!isReviewer(userId, target)) return {};
  const refs = page?.sourceRefs || [];
  if (!validId(target.pageId) || !Array.isArray(target.sourceIds) || target.sourceIds.length !== 2
    || target.sourceIds.some(id => !validId(id)) || new Set(target.sourceIds).size !== 2
    || String(page?._id) !== target.pageId || String(page?.userId) !== target.userId
    || page.visibility !== 'private' || page.pageType !== 'topic' || page.sourceScope !== 'selected_sources'
    || refs.length !== 2 || refs.some(ref => ref.type !== 'article' || !target.sourceIds.includes(String(ref.objectId)))
    || new Set(refs.map(ref => String(ref.objectId))).size !== 2) {
    throw gateError('REVIEWER_FIXTURE_MISMATCH', 'Reviewer draft requires the verified private two-source fixture.', 422);
  }
  return { chat, isConfigured: () => true, streamDraft: false, failClosedChat: true };
};

module.exports = {
  readReviewerBudgetStatus,
  verifyReviewerConceptOwner, holdReviewerSourceEvent,
  policy, isReviewer, reviewerMaintenanceArgs, createBoundedReviewerChat,
  buildPayload, HOLD_REASON,
  bounds: { MODEL, ENDPOINT, MAX_REQUESTS, MAX_RESERVED_MICRO_USD, MAX_OUTPUT_TOKENS, MAX_MESSAGE_BYTES, MAX_TOKEN_COST }
};
