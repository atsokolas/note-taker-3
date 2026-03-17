const toTrimmedString = (value = '') => String(value || '').trim();

const uniqueStrings = (values = [], limit = 8) => {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const safeValue = toTrimmedString(value);
    if (!safeValue || seen.has(safeValue)) continue;
    seen.add(safeValue);
    result.push(safeValue);
    if (result.length >= limit) break;
  }
  return result;
};

const buildWarning = (code, message) => ({
  code: toTrimmedString(code),
  message: toTrimmedString(message)
});

const summarizeWarnings = (entries = []) => {
  const list = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return buildWarning('general_warning', entry);
      }
      if (!entry.code && !entry.message) return null;
      return buildWarning(entry.code || 'general_warning', entry.message || '');
    })
    .filter((entry) => entry && entry.message);
  return {
    warnings: list.map((entry) => entry.message),
    warningCodes: uniqueStrings(list.map((entry) => entry.code), 20)
  };
};

module.exports = {
  buildWarning,
  summarizeWarnings,
  uniqueStrings
};
