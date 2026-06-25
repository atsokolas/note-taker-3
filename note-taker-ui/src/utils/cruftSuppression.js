export const CRUFT_TITLE_PATTERNS = [
  /\btemp\s+mcp\s+retest\b/i,
  /^blah\b/i,
  /^test\b/i,
  /^test\s*\(\d+\)$/i,
  /^discard\b/i,
  /^favorite\b/i,
  /^kevin\b/i,
  /^brand new pull test\b/i,
  /^claim note \d{10,}$/i,
  /^evidence note \d{10,}$/i,
  /^connection concept [a-z]\s+\d{10,}$/i,
  /^idea workbench route\s+\d{10,}$/i,
  /^new question$/i,
  /^(?:qa|codex qa)\s+public\s+(?:question|concept|note|wiki)\b/i,
  /^(?:qa|codex qa)\s+(?:build order verification|user test|shared adoption|public share|fresh concept|slash concept|embedding retry)\b/i,
  /^(?:qa|codex qa)\b.*\b\d{10,}\b/i
];

export const getReturnViewTitle = (item = {}) => {
  const raw = item.raw || item;
  return String(
    item.title
    || raw.title
    || raw.name
    || raw.text
    || ''
  ).trim();
};

export const matchesCruftHeuristic = (title = '') => {
  const normalized = String(title || '').trim();
  if (!normalized) return false;
  return CRUFT_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isSuppressedFromReturnView = (item = {}) => {
  if (!item) return false;
  const raw = item.raw || item;
  if (raw.hiddenFromHome || raw.debugOnly || raw.archived) return true;
  if (String(raw.status || '').toLowerCase() === 'archived') return true;
  return matchesCruftHeuristic(getReturnViewTitle(item));
};

export const isSuppressedFromLibraryBrowse = (item = {}) => {
  if (!item) return false;
  const raw = item.raw || item;
  if (raw.debugOnly || raw.archived) return true;
  if (String(raw.status || '').toLowerCase() === 'archived') return true;
  return matchesCruftHeuristic(getReturnViewTitle(item));
};

export const filterReturnViewItems = (items = []) => (
  (Array.isArray(items) ? items : []).filter((item) => !isSuppressedFromReturnView(item))
);

export const filterLibraryBrowseItems = (items = []) => (
  (Array.isArray(items) ? items : []).filter((item) => !isSuppressedFromLibraryBrowse(item))
);

export const countSuppressedInCollection = (items = []) => (
  (Array.isArray(items) ? items : []).filter(isSuppressedFromReturnView).length
);

export const composeCruftSuppressionNotice = (count = 0) => {
  const total = Number(count) || 0;
  if (total <= 0) return '';
  const label = total === 1 ? 'item' : 'items';
  const verb = total === 1 ? 'was' : 'were';
  return `${total} low-signal test ${label} ${verb} kept out of your return view.`;
};
