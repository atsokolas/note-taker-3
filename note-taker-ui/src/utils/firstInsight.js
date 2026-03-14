const STORAGE_KEY = 'first-insight.activation.v1';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const normalizeString = (value) => String(value || '').trim();

const normalizeCounts = (counts = {}) => ({
  importedArticles: Math.max(0, Number(counts.importedArticles) || 0),
  importedHighlights: Math.max(0, Number(counts.importedHighlights) || 0),
  importedNotes: Math.max(0, Number(counts.importedNotes) || 0),
  skippedRows: Math.max(0, Number(counts.skippedRows) || 0),
  parseErrors: Math.max(0, Number(counts.parseErrors) || 0)
});

const normalizeState = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const createdAt = normalizeString(value.createdAt);
  const updatedAt = normalizeString(value.updatedAt);
  const state = {
    status: normalizeString(value.status) || 'captured',
    sourceType: normalizeString(value.sourceType) || 'manual-note',
    title: normalizeString(value.title) || 'Untitled',
    notebookEntryId: normalizeString(value.notebookEntryId),
    conceptId: normalizeString(value.conceptId),
    conceptName: normalizeString(value.conceptName),
    articleId: normalizeString(value.articleId),
    dueAt: normalizeString(value.dueAt),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || createdAt || new Date().toISOString(),
    counts: normalizeCounts(value.counts)
  };
  return state;
};

export const buildCanonicalArticlePath = (articleId = '') => {
  const safeArticleId = normalizeString(articleId);
  if (!safeArticleId) return '/library';
  return `/library?articleId=${encodeURIComponent(safeArticleId)}`;
};

export const readFirstInsightState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
};

export const saveFirstInsightState = (payload = {}) => {
  const now = new Date().toISOString();
  const next = normalizeState({
    ...payload,
    createdAt: normalizeString(payload.createdAt) || now,
    updatedAt: now
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const updateFirstInsightState = (patch = {}) => {
  const current = readFirstInsightState() || {};
  return saveFirstInsightState({ ...current, ...patch });
};

export const clearFirstInsightState = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const isFirstInsightActive = (state) => {
  const normalized = normalizeState(state);
  if (!normalized) return false;
  if (normalized.status === 'completed') return false;
  const createdAtMs = new Date(normalized.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return true;
  return (Date.now() - createdAtMs) <= MAX_AGE_MS;
};

export const getFirstInsightOpenPath = (state) => {
  const normalized = normalizeState(state);
  if (!normalized) return '/today';
  if (normalized.conceptName) {
    return `/think?tab=concepts&concept=${encodeURIComponent(normalized.conceptName)}`;
  }
  if (normalized.notebookEntryId) {
    return `/think?tab=notebook&entryId=${encodeURIComponent(normalized.notebookEntryId)}`;
  }
  if (normalized.articleId) {
    return buildCanonicalArticlePath(normalized.articleId);
  }
  return '/today';
};

export const getFirstInsightSummary = (state) => {
  const normalized = normalizeState(state);
  if (!normalized) return 'No capture in progress.';
  const summaryBits = [];
  if (normalized.counts.importedNotes) summaryBits.push(`${normalized.counts.importedNotes} note${normalized.counts.importedNotes === 1 ? '' : 's'}`);
  if (normalized.counts.importedHighlights) summaryBits.push(`${normalized.counts.importedHighlights} highlight${normalized.counts.importedHighlights === 1 ? '' : 's'}`);
  if (normalized.counts.importedArticles) summaryBits.push(`${normalized.counts.importedArticles} article${normalized.counts.importedArticles === 1 ? '' : 's'}`);
  if (normalized.conceptName) summaryBits.push(`concept: ${normalized.conceptName}`);
  if (normalized.dueAt) summaryBits.push(`revisit: ${new Date(normalized.dueAt).toLocaleDateString()}`);
  return summaryBits.length > 0 ? summaryBits.join(' · ') : normalized.title;
};
