const LIMITS = Object.freeze({
  explanation: 240,
  wording: 30000,
  options: 3
});

const text = (value) => String(value || '').trim();

const normalizeKey = (value) => text(value).replace(/\s+/g, ' ').toLowerCase();

const passageFromTarget = (target = {}) => {
  const base = String(target.baseText || '');
  if (['word', 'sentence'].includes(target.scope) && Number.isInteger(target.rangeStart) && Number.isInteger(target.rangeEnd)) {
    return base.slice(target.rangeStart, target.rangeEnd);
  }
  return base;
};

const stripCitationish = (value) => text(value)
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\[[^\]]+\]\([^)]+\)/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const parsePayload = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  const cleaned = String(raw).trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    return null;
  }
};

const parseNotebookWordingOptions = (raw, { original = '' } = {}) => {
  const payload = parsePayload(raw);
  const rows = Array.isArray(payload?.options) ? payload.options : [];
  const originalKey = normalizeKey(original);
  const seen = new Set();
  const options = [];
  rows.forEach((row, index) => {
    const wording = text(row?.wording).slice(0, LIMITS.wording);
    const explanation = stripCitationish(row?.explanation).slice(0, LIMITS.explanation);
    const key = normalizeKey(wording);
    if (!wording || !explanation || key === originalKey || seen.has(key)) return;
    seen.add(key);
    options.push({
      id: `opt-${index + 1}`,
      wording,
      explanation
    });
  });
  return options.slice(0, LIMITS.options);
};

module.exports = {
  LIMITS,
  passageFromTarget,
  parseNotebookWordingOptions
};
