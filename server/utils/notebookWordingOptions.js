/** @typedef {import('../types/request').Fields} Fields */

const LIMITS = Object.freeze({
  explanation: 240,
  wording: 30000,
  options: 3
});

/** @param {unknown} value */
const text = (value) => String(value || '').trim();

/** @param {unknown} value */
const normalizeKey = (value) => text(value).replace(/\s+/g, ' ').toLowerCase();

/** @param {Fields} [target] */
const passageFromTarget = (target = {}) => {
  const base = String(target.baseText || '');
  if (Number.isInteger(target.rangeStart) && Number.isInteger(target.rangeEnd) && target.rangeEnd > target.rangeStart && target.rangeEnd <= base.length) {
    return base.slice(target.rangeStart, target.rangeEnd);
  }
  return base;
};

/** @param {unknown} value */
const stripCitationish = (value) => text(value)
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\[[^\]]+\]\([^)]+\)/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** A model's answer, as JSON text (fenced or not) or already parsed. @param {unknown} raw @returns {Fields | null} */
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

/** @param {unknown} raw */
const parseNotebookWordingOptions = (raw, { original = '' } = {}) => {
  const payload = parsePayload(raw);
  const rows = Array.isArray(payload?.options) ? payload.options : [];
  const originalKey = normalizeKey(original);
  const seen = new Set();
  /** @type {{ id: string, wording: string, explanation: string }[]} */
  const options = [];
  rows.forEach((/** @type {Fields} */ row, /** @type {number} */ index) => {
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
