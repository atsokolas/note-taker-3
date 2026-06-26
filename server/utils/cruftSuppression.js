const CRUFT_TITLE_PATTERNS = [
  /\btemp\s+mcp\s+retest\b/i,
  /^blah\b/i,
  /^test\b/i,
  /^test\s*\(\d+\)$/i,
  /^discard\b/i,
  /^favorite\b/i,
  /^kevin\b/i,
  /^brand new pull test\b/i,
  /^public share smoke page$/i,
  /^new question$/i,
  /^qa\s+/i,
  /^(?:qa|codex qa)\b.*\b\d{10,}\b/i
];

const getReturnViewTitle = (item = {}) => {
  const raw = item.raw || item;
  return String(
    item.title
    || raw.title
    || raw.name
    || raw.text
    || ''
  ).trim();
};

const matchesCruftHeuristic = (title = '') => {
  const normalized = String(title || '').trim();
  if (!normalized) return false;
  return CRUFT_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const isSuppressedFromReturnView = (item = {}) => {
  if (!item) return false;
  const raw = item.raw || item;
  if (raw.hiddenFromHome || raw.debugOnly || raw.archived) return true;
  if (String(raw.status || '').toLowerCase() === 'archived') return true;
  return matchesCruftHeuristic(getReturnViewTitle(item));
};

const filterReturnViewItems = (items = []) => (
  (Array.isArray(items) ? items : []).filter((item) => !isSuppressedFromReturnView(item))
);

const countSuppressedInCollection = (items = []) => (
  (Array.isArray(items) ? items : []).filter(isSuppressedFromReturnView).length
);

const composeCruftSuppressionNotice = (count = 0) => {
  const total = Number(count) || 0;
  if (total <= 0) return '';
  const label = total === 1 ? 'import' : 'imports';
  const verb = total === 1 ? 'was' : 'were';
  return `${total} low-signal ${label} ${verb} kept out of your return view.`;
};

module.exports = {
  CRUFT_TITLE_PATTERNS,
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  filterReturnViewItems,
  getReturnViewTitle,
  isSuppressedFromReturnView,
  matchesCruftHeuristic
};
