/**
 * wikiVisitTracker — localStorage helpers for "what changed since last
 * visit." Stores a compact snapshot of the claim texts on the page at
 * each visit, plus a timestamp. On the next visit we diff that snapshot
 * against the page's current claim texts to surface what's new / removed.
 *
 * Why text-based and not claim-id-based: the maintenance pipeline emits
 * a fresh synthetic claimId per run, so id-based diffs would mark every
 * claim "new" after maintenance. Text matches the user's mental model
 * — they care whether the content changed, not whether some opaque id
 * stayed the same.
 *
 * Storage shape (localStorage):
 *   key:   `noeis.wiki.visit.<pageId>`
 *   value: { lastViewedAt: ISO string, claimSnapshot: string[], ledgerSnapshot: object[] }
 *
 * The snapshot is capped at 200 entries — enough for any realistic
 * page, bounded so we don't fill localStorage with megabyte snapshots.
 */

const STORAGE_KEY_PREFIX = 'noeis.wiki.visit.';
const SNAPSHOT_CAP = 200;

const safePageId = (pageId) => String(pageId || '').trim();

const storageKey = (pageId) => `${STORAGE_KEY_PREFIX}${safePageId(pageId)}`;

const safeStorage = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch (_err) {
    return null;
  }
};

const normalizeClaimText = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const normalizeSupport = (value = '') => {
  if (value === 'contradicted') return 'conflicted';
  return ['supported', 'partial', 'unsupported', 'conflicted'].includes(value)
    ? value
    : 'unsupported';
};

const normalizeDateValue = (value) => {
  if (!value) return '';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
};

export const extractClaimLedgerSnapshot = (claims = []) => (
  (Array.isArray(claims) ? claims : [])
    .map((claim) => {
      const text = normalizeClaimText(claim?.text);
      if (!text) return null;
      return {
        text,
        support: normalizeSupport(claim?.support),
        confidence: Number.isFinite(Number(claim?.confidence))
          ? Number(Number(claim.confidence).toFixed(2))
          : 0,
        lastVerifiedAt: normalizeDateValue(claim?.lastVerifiedAt),
        citationCount: Array.isArray(claim?.citationIds) ? claim.citationIds.length : 0,
        historyCount: Array.isArray(claim?.history) ? claim.history.length : 0
      };
    })
    .filter(Boolean)
    .slice(0, SNAPSHOT_CAP)
);

const collectClaimTextsFromNode = (node, accumulator) => {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(child => collectClaimTextsFromNode(child, accumulator));
    return;
  }
  if (typeof node !== 'object') return;
  if (Array.isArray(node.marks) && node.marks.some(mark => mark?.type === 'claim')) {
    const text = normalizeClaimText(node.text);
    if (text) accumulator.add(text);
  }
  if (Array.isArray(node.content)) {
    node.content.forEach(child => collectClaimTextsFromNode(child, accumulator));
  }
};

/**
 * Extract the set of normalized claim texts from a TipTap doc. Used
 * both at visit time (to take a snapshot) and at compare time (to
 * diff the current state against the snapshot).
 */
export const extractClaimTexts = (doc) => {
  const set = new Set();
  collectClaimTextsFromNode(doc, set);
  return Array.from(set).slice(0, SNAPSHOT_CAP);
};

/**
 * Read the last-visit record for a page. Returns null if the page has
 * never been visited (or storage is unavailable / corrupt).
 */
export const getLastVisitState = (pageId) => {
  if (!safePageId(pageId)) return null;
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(pageId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const lastViewedAt = String(parsed.lastViewedAt || '').trim();
    const claimSnapshot = Array.isArray(parsed.claimSnapshot)
      ? parsed.claimSnapshot.map(String).filter(Boolean).slice(0, SNAPSHOT_CAP)
      : [];
    const ledgerSnapshot = Array.isArray(parsed.ledgerSnapshot)
      ? parsed.ledgerSnapshot.map((entry) => ({
          text: normalizeClaimText(entry?.text),
          support: normalizeSupport(entry?.support),
          confidence: Number.isFinite(Number(entry?.confidence)) ? Number(entry.confidence) : 0,
          lastVerifiedAt: normalizeDateValue(entry?.lastVerifiedAt),
          citationCount: Number.isFinite(Number(entry?.citationCount)) ? Number(entry.citationCount) : 0,
          historyCount: Number.isFinite(Number(entry?.historyCount)) ? Number(entry.historyCount) : 0
        })).filter(entry => entry.text).slice(0, SNAPSHOT_CAP)
      : [];
    return { lastViewedAt, claimSnapshot, ledgerSnapshot };
  } catch (_err) {
    return null;
  }
};

/**
 * Snapshot the current claim texts as the user's "last visit" state.
 * Called when the user explicitly clicks "Mark reviewed" — never auto-
 * snapshots so the banner doesn't dismiss itself before the user has
 * read it.
 */
export const recordVisit = (pageId, doc, claims = []) => {
  if (!safePageId(pageId)) return null;
  const storage = safeStorage();
  if (!storage) return null;
  const state = {
    lastViewedAt: new Date().toISOString(),
    claimSnapshot: extractClaimTexts(doc),
    ledgerSnapshot: extractClaimLedgerSnapshot(claims)
  };
  try {
    storage.setItem(storageKey(pageId), JSON.stringify(state));
  } catch (_err) {
    // Quota exceeded or similar — best-effort only.
  }
  return state;
};

/**
 * Diff a previous snapshot against the page's current claim texts.
 *  - added:   claim texts on the page now that weren't in the snapshot
 *  - removed: claim texts in the snapshot that aren't on the page now
 */
export const diffClaimSnapshots = (snapshot = [], current = []) => {
  const previous = new Set((Array.isArray(snapshot) ? snapshot : []).map(normalizeClaimText));
  const next = new Set((Array.isArray(current) ? current : []).map(normalizeClaimText));
  const added = [];
  const removed = [];
  next.forEach((text) => { if (!previous.has(text)) added.push(text); });
  previous.forEach((text) => { if (!next.has(text)) removed.push(text); });
  return { added, removed };
};

export const diffClaimLedgerSnapshots = (snapshot = [], current = []) => {
  const previous = new Map((Array.isArray(snapshot) ? snapshot : [])
    .map(entry => [normalizeClaimText(entry?.text), entry])
    .filter(([text]) => text));
  const next = new Map(extractClaimLedgerSnapshot(current)
    .map(entry => [entry.text, entry]));
  const changed = [];

  next.forEach((entry, text) => {
    const prior = previous.get(text);
    if (!prior) return;
    const supportChanged = normalizeSupport(prior.support) !== normalizeSupport(entry.support);
    const confidenceChanged = Math.abs(Number(prior.confidence || 0) - Number(entry.confidence || 0)) >= 0.15;
    const citationChanged = Number(prior.citationCount || 0) !== Number(entry.citationCount || 0);
    const historyChanged = Number(entry.historyCount || 0) > Number(prior.historyCount || 0);
    if (supportChanged || confidenceChanged || citationChanged || historyChanged) {
      changed.push({
        text,
        support: entry.support,
        confidence: entry.confidence,
        reasons: [
          supportChanged ? 'support' : null,
          confidenceChanged ? 'confidence' : null,
          citationChanged ? 'sources' : null,
          historyChanged ? 'history' : null
        ].filter(Boolean)
      });
    }
  });

  return changed.slice(0, SNAPSHOT_CAP);
};

export const __testables = {
  STORAGE_KEY_PREFIX,
  SNAPSHOT_CAP,
  normalizeClaimText,
  normalizeSupport
};
