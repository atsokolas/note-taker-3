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
const isReviewer = (userId, target = policy) => validId(target.userId) && String(userId || '') === target.userId;
const gateError = (code, message, status = 409) => Object.assign(new Error(message), { code, status });

// The fixed _id is the lifetime budget identity. Neither clients nor retries can
// choose/reset it. Mongo's _id uniqueness and conditional update serialize POSTs.
const ledgerCollection = () => {
  if (!mongoose.connection.db) throw gateError('REVIEWER_LEDGER_UNAVAILABLE', 'Reviewer budget storage is unavailable.', 503);
  return mongoose.connection.db.collection('reviewer_rehearsal_budgets');
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
    if (typeof text !== 'string' || !text.trim() || data.model !== MODEL
      || !Number.isInteger(usage.prompt_tokens) || usage.prompt_tokens < 0 || usage.prompt_tokens > 128000
      || !Number.isInteger(usage.completion_tokens) || usage.completion_tokens < 0 || usage.completion_tokens > MAX_OUTPUT_TOKENS
      || typeof usage.cost !== 'number' || usage.cost < 0 || usage.cost > MAX_TOKEN_COST) {
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
  policy, isReviewer, reviewerMaintenanceArgs, createBoundedReviewerChat,
  buildPayload, HOLD_REASON,
  bounds: { MODEL, ENDPOINT, MAX_REQUESTS, MAX_RESERVED_MICRO_USD, MAX_OUTPUT_TOKENS, MAX_MESSAGE_BYTES, MAX_TOKEN_COST }
};
