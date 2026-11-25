const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios').default;

const EVENT_NAMES = Object.freeze({
  USER_SIGNUP: 'user_signup',
  MARKETING_CTA_CLICKED: 'marketing_cta_clicked',
  MARKETING_SIGNUP_VIEWED: 'marketing_signup_viewed',
  MARKETING_SIGNUP_STARTED: 'marketing_signup_started',
  MARKETING_SIGNUP_FAILED: 'marketing_signup_failed',
  WORKSPACE_CREATED: 'workspace_created',
  CAPTURE_COMPLETED: 'capture_completed',
  CONCEPT_CREATED: 'concept_created',
  REVISIT_SCHEDULED: 'revisit_scheduled',
  AGENT_PROPOSAL_BUNDLE_STAGED: 'agent_proposal_bundle_staged',
  AGENT_EXECUTION_INTENT_MATCHED: 'agent_execution_intent_matched',
  AGENT_EXECUTION_INTENT_AMBIGUOUS: 'agent_execution_intent_ambiguous',
  AGENT_EXECUTION_INTENT_NO_MATCH: 'agent_execution_intent_no_match',
  AGENT_RUN_STARTED: 'agent_run_started',
  AGENT_RUN_COMPLETED: 'agent_run_completed',
  AGENT_RUN_PAUSED_FOR_APPROVAL: 'agent_run_paused_for_approval',
  AGENT_RUN_AWAITING_REVIEW: 'agent_run_awaiting_review',
  AGENT_RUN_FAILED: 'agent_run_failed',
  AGENT_PROPOSED_CHANGE_ACCEPTED: 'agent_proposed_change_accepted',
  AGENT_PROPOSED_CHANGE_REJECTED: 'agent_proposed_change_rejected',
  AGENT_PROPOSED_CHANGE_ROLLED_BACK: 'agent_proposed_change_rolled_back',
  AGENT_STRUCTURE_PLAN_APPLIED: 'agent_structure_plan_applied',
  AGENT_STRUCTURE_PLAN_REJECTED: 'agent_structure_plan_rejected',
  AGENT_STRUCTURE_PLAN_ROLLED_BACK: 'agent_structure_plan_rolled_back',
  AGENT_ARTIFACT_DRAFT_PROMOTED: 'agent_artifact_draft_promoted',
  AGENT_ARTIFACT_DRAFT_DISMISSED: 'agent_artifact_draft_dismissed',
  AGENT_RUN_APPROVAL_APPROVED: 'agent_run_approval_approved',
  AGENT_RUN_APPROVAL_REJECTED: 'agent_run_approval_rejected',
  WIKI_PAGE_CREATED: 'wiki_page_created',
  WIKI_SOURCE_ATTACHED: 'wiki_source_attached',
  WIKI_DRAFT_GENERATED: 'wiki_draft_generated',
  WIKI_SHARED_ADOPTED: 'wiki_shared_adopted',
  WIKI_INGEST_SUBMITTED: 'wiki_ingest_submitted',
  WIKI_INGEST_COMPLETED: 'wiki_ingest_completed',
  WIKI_INGEST_NO_MATCH: 'wiki_ingest_no_match',
  WIKI_QA_PROMOTED: 'wiki_qa_promoted',
  WIKI_SCHEMA_SAVED: 'wiki_schema_saved',
  WIKI_SCHEMA_SUGGESTED: 'wiki_schema_suggested',
  // Judgment: a view is held, meets evidence, changes, and is settled.
  VIEW_HELD: 'view_held',
  EVIDENCE_PROPOSED: 'evidence_proposed',
  EVIDENCE_FILED: 'evidence_filed',
  EVIDENCE_DISMISSED: 'evidence_dismissed',
  VIEW_REVISED: 'view_revised',
  VIEW_RESOLVED: 'view_resolved',
  RETURN_VISIT: 'return_visit'
});

const VALID_EVENT_NAMES = new Set(Object.values(EVENT_NAMES));
const MAX_PROPERTY_DEPTH = 2;
const MAX_PROPERTY_KEYS = 40;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 240;

const ANALYTICS_ENABLED = String(process.env.ANALYTICS_ENABLED || 'true').trim().toLowerCase() !== 'false';
const ANALYTICS_LOG_PATH = path.resolve(
  process.cwd(),
  String(process.env.ANALYTICS_LOG_PATH || 'server/logs/product-events.jsonl').trim()
);
const ANALYTICS_HASH_SALT = String(
  process.env.ANALYTICS_HASH_SALT
  || process.env.JWT_SECRET
  || 'note-taker-analytics-salt'
).trim();

const POSTHOG_HOST = String(process.env.POSTHOG_HOST || '').trim().replace(/\/+$/, '');
const POSTHOG_PROJECT_API_KEY = String(process.env.POSTHOG_PROJECT_API_KEY || '').trim();
const POSTHOG_CAPTURE_URL = POSTHOG_HOST ? `${POSTHOG_HOST}/capture/` : '';
const POSTHOG_TIMEOUT_MS = Math.max(1000, Number(process.env.POSTHOG_TIMEOUT_MS || 3000) || 3000);

const hasPosthogConfig = Boolean(POSTHOG_CAPTURE_URL && POSTHOG_PROJECT_API_KEY);
let writeChain = Promise.resolve();

/** @param {unknown} value */
const toSafeString = (value) => String(value || '').trim();

/** @param {unknown} value */
const hashValue = (value) => {
  const raw = toSafeString(value);
  if (!raw) return '';
  return crypto
    .createHash('sha256')
    .update(`${ANALYTICS_HASH_SALT}:${raw}`)
    .digest('hex')
    .slice(0, 20);
};

/** @param {unknown} value @returns {unknown} */
const sanitizeValue = (value, depth = 0) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().slice(0, MAX_STRING_LENGTH);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_PROPERTY_DEPTH) return undefined;
    const next = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(item => sanitizeValue(item, depth + 1))
      .filter(item => item !== undefined);
    return next;
  }
  if (typeof value === 'object') {
    if (depth >= MAX_PROPERTY_DEPTH) return undefined;
    const entries = Object.entries(value).slice(0, MAX_PROPERTY_KEYS);
    /** @type {Record<string, unknown>} */
    const next = {};
    entries.forEach(([key, entryValue]) => {
      const safeKey = toSafeString(key).slice(0, 80);
      if (!safeKey) return;
      const cleaned = sanitizeValue(entryValue, depth + 1);
      if (cleaned !== undefined) next[safeKey] = cleaned;
    });
    return next;
  }
  return undefined;
};

// The properties object itself is one level above its values.
/** @param {unknown} properties */
const sanitizeProperties = (properties) => (
  properties && typeof properties === 'object' ? sanitizeValue(properties, -1) : {}
);

/** @param {object} payload */
const appendJsonLine = async (payload) => {
  const line = `${JSON.stringify(payload)}\n`;
  await fs.mkdir(path.dirname(ANALYTICS_LOG_PATH), { recursive: true });
  await fs.appendFile(ANALYTICS_LOG_PATH, line, 'utf8');
};

/** @param {{ event: string, distinctId: string, properties: unknown, timestamp: string }} capture */
const postToPosthog = async ({ event, distinctId, properties, timestamp }) => {
  if (!hasPosthogConfig) return;
  await axios.post(
    POSTHOG_CAPTURE_URL,
    {
      api_key: POSTHOG_PROJECT_API_KEY,
      event,
      distinct_id: distinctId || 'anonymous',
      timestamp,
      properties: {
        source: 'backend',
        .../** @type {object} */ (properties)
      }
    },
    { timeout: POSTHOG_TIMEOUT_MS }
  );
};

/** @param {object} payload */
const queueWrite = (payload) => {
  writeChain = writeChain
    .then(() => appendJsonLine(payload))
    .catch((error) => {
      console.error('[ANALYTICS] Failed to write analytics event:', error?.message || error);
    });
};

/** @param {{ event?: string, userId?: unknown, requestId?: string, properties?: object }} [tracked] */
const trackEvent = ({ event, userId, requestId = '', properties = {} } = {}) => {
  try {
    if (!ANALYTICS_ENABLED) return;
    const eventName = toSafeString(event);
    if (!(/** @type {Set<string>} */ (VALID_EVENT_NAMES)).has(eventName)) return;

    const timestamp = new Date().toISOString();
    const userIdHash = hashValue(userId);
    const cleanedProperties = sanitizeProperties(properties);
    const payload = {
      event: eventName,
      timestamp,
      requestId: toSafeString(requestId),
      source: 'backend',
      actor: {
        userIdHash
      },
      properties: cleanedProperties
    };

    queueWrite(payload);
    postToPosthog({
      event: eventName,
      distinctId: userIdHash,
      properties: cleanedProperties,
      timestamp
    }).catch((error) => {
      console.error('[ANALYTICS] Failed to send event to PostHog:', error?.message || error);
    });
  } catch (/** @type {any} */ error) {
    console.error('[ANALYTICS] Unexpected analytics tracking error:', error?.message || error);
  }
};

/* One return_visit per user per day. Kept in memory: a restart can count a
   reader twice in one day, which a per-day distinct count absorbs. */
let visitDay = '';
const visitedToday = new Set();
/** @param {unknown} userId */
const trackReturnVisit = (userId) => {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== visitDay) {
    visitDay = day;
    visitedToday.clear();
  }
  const key = toSafeString(userId);
  if (!key || visitedToday.has(key)) return;
  visitedToday.add(key);
  trackEvent({ event: EVENT_NAMES.RETURN_VISIT, userId: key });
};

module.exports = {
  EVENT_NAMES,
  trackEvent,
  trackReturnVisit,
  hashValue
};
