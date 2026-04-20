const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const EVENT_NAMES = Object.freeze({
  USER_SIGNUP: 'user_signup',
  MARKETING_CTA_CLICKED: 'marketing_cta_clicked',
  MARKETING_SIGNUP_VIEWED: 'marketing_signup_viewed',
  MARKETING_SIGNUP_STARTED: 'marketing_signup_started',
  MARKETING_SIGNUP_FAILED: 'marketing_signup_failed',
  HIGHLIGHT_CAPTURED: 'highlight_captured',
  WORKSPACE_CREATED: 'workspace_created',
  CAPTURE_COMPLETED: 'capture_completed',
  CONCEPT_CREATED: 'concept_created',
  REVISIT_SCHEDULED: 'revisit_scheduled',
  SEMANTIC_SEARCH_PERFORMED: 'semantic_search_performed',
  AI_DRAFT_GENERATED: 'ai_draft_generated',
  AI_DRAFT_ACCEPTED: 'ai_draft_accepted',
  RELATED_HIGHLIGHT_CLICKED: 'related_highlight_clicked',
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
  AGENT_ARTIFACT_DRAFT_STAGED: 'agent_artifact_draft_staged',
  AGENT_ARTIFACT_DRAFT_PROMOTED: 'agent_artifact_draft_promoted',
  AGENT_ARTIFACT_DRAFT_DISMISSED: 'agent_artifact_draft_dismissed',
  AGENT_RUN_APPROVAL_APPROVED: 'agent_run_approval_approved',
  AGENT_RUN_APPROVAL_REJECTED: 'agent_run_approval_rejected'
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

const toSafeString = (value) => String(value || '').trim();

const hashValue = (value) => {
  const raw = toSafeString(value);
  if (!raw) return '';
  return crypto
    .createHash('sha256')
    .update(`${ANALYTICS_HASH_SALT}:${raw}`)
    .digest('hex')
    .slice(0, 20);
};

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

const sanitizeProperties = (properties) => {
  if (!properties || typeof properties !== 'object') return {};
  const result = {};
  Object.entries(properties).slice(0, MAX_PROPERTY_KEYS).forEach(([key, value]) => {
    const safeKey = toSafeString(key).slice(0, 80);
    if (!safeKey) return;
    const safeValue = sanitizeValue(value, 0);
    if (safeValue !== undefined) result[safeKey] = safeValue;
  });
  return result;
};

const appendJsonLine = async (payload) => {
  const line = `${JSON.stringify(payload)}\n`;
  await fs.mkdir(path.dirname(ANALYTICS_LOG_PATH), { recursive: true });
  await fs.appendFile(ANALYTICS_LOG_PATH, line, 'utf8');
};

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
        ...properties
      }
    },
    { timeout: POSTHOG_TIMEOUT_MS }
  );
};

const queueWrite = (payload) => {
  writeChain = writeChain
    .then(() => appendJsonLine(payload))
    .catch((error) => {
      console.error('[ANALYTICS] Failed to write analytics event:', error?.message || error);
    });
};

const trackEvent = ({ event, userId, requestId = '', properties = {} } = {}) => {
  try {
    if (!ANALYTICS_ENABLED) return;
    const eventName = toSafeString(event);
    if (!VALID_EVENT_NAMES.has(eventName)) return;

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
  } catch (error) {
    console.error('[ANALYTICS] Unexpected analytics tracking error:', error?.message || error);
  }
};

module.exports = {
  EVENT_NAMES,
  trackEvent,
  hashValue
};
