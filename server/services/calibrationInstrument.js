/**
 * Stage 6 — Private longitudinal calibration.
 *
 * How confidence met later outcomes, for this person only. Enough samples
 * before a band speaks. Uncertainty named as a range, not a score. The
 * selection effect is copy, not a footnote. There is no leaderboard.
 */

const BANDS = Object.freeze(['certain', 'probable', 'uncertain']);
const VERDICTS = Object.freeze(['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons']);
const SUFFICIENT = 8;
const HORIZONS = Object.freeze([
  { id: 'near', maxDays: 90, label: 'within a season' },
  { id: 'year', maxDays: 370, label: 'within a year' },
  { id: 'long', maxDays: Infinity, label: 'longer than a year' }
]);
const SELECTION = 'These are the cases you chose to keep and later named an outcome. They are not a sample of everything you thought.';

const clean = (value = '', limit = 280) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const qualitative = (value) => {
  if (BANDS.includes(String(value || ''))) return String(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return 'uncertain';
  if (number >= 0.75) return 'certain';
  if (number >= 0.4) return 'probable';
  return 'uncertain';
};

const daysBetween = (from, to) => {
  const start = from ? new Date(from).getTime() : NaN;
  const end = to ? new Date(to).getTime() : NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(0, (end - start) / (24 * 60 * 60 * 1000));
};

const horizonOf = (days) => {
  if (days == null) return { id: 'unknown', label: 'horizon unnamed' };
  return HORIZONS.find((row) => days <= row.maxDays) || HORIZONS[HORIZONS.length - 1];
};

const emptyCounts = () => VERDICTS.reduce((acc, key) => {
  acc[key] = 0;
  return acc;
}, {});

const wilson = (wins, n) => {
  if (!n) return { low: null, high: null };
  const p = wins / n;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p) / n) + (z * z) / (4 * n * n))) / denom;
  return {
    low: Math.max(0, Math.round((center - spread) * 100) / 100),
    high: Math.min(1, Math.round((center + spread) * 100) / 100)
  };
};

const collectCases = (pages = [], { userId } = {}) => {
  const owner = idOf(userId);
  return list(pages).map(plain).filter((page) => {
    if (owner && idOf(page.userId) !== owner) return false;
    const judgment = plain(page.judgment) || {};
    return Boolean(clean(judgment.currentJudgment));
  }).map((page) => {
    const judgment = plain(page.judgment) || {};
    const latest = list(judgment.verdicts).concat(list(judgment.outcomes))
      .reduce((last, row) => {
        const at = iso(row.recordedAt || row.observedAt || row.at);
        if (!at) return last;
        if (!last || at > last.at) return { at, result: row.result };
        return last;
      }, null);
    const born = iso(judgment.bornAt || judgment.startedAt || page.createdAt);
    const adapter = clean(page.adapterId || judgment.adapterId || 'held-sentence', 40);
    return {
      pageId: idOf(page),
      claim: clean(judgment.currentJudgment, 400),
      confidence: qualitative(judgment.confidence),
      domain: adapter,
      bornAt: born,
      outcomeAt: latest?.at || null,
      result: VERDICTS.includes(String(latest?.result || '')) ? latest.result : '',
      horizon: horizonOf(daysBetween(born, latest?.at || born))
    };
  });
};

const summarize = (rows = []) => {
  const settled = list(rows).filter((row) => row.result);
  const counts = emptyCounts();
  settled.forEach((row) => {
    counts[row.result] += 1;
  });
  const n = settled.length;
  const sufficient = n >= SUFFICIENT;
  const held = counts.held_up + counts.partly;
  const range = sufficient ? wilson(held, n) : { low: null, high: null };
  return {
    n,
    sufficient,
    counts,
    range,
    silence: sufficient
      ? ''
      : n
        ? `Too few named outcomes (${n}) to speak. Silence until ${SUFFICIENT}.`
        : 'No named outcomes yet. The instrument is allowed to be empty.'
  };
};

const segment = (rows, key, values) => values.map((value) => {
  const id = typeof value === 'string' ? value : value.id;
  const label = typeof value === 'string' ? value : value.label;
  const subset = list(rows).filter((row) => {
    if (key === 'horizon') return row.horizon?.id === id;
    return row[key] === id;
  });
  return { id, label, ...summarize(subset) };
});

const buildCalibration = (pages = [], { userId, now = new Date() } = {}) => {
  const rows = collectCases(pages, { userId });
  const settled = rows.filter((row) => row.result);
  const byBand = BANDS.map((band) => ({
    confidence: band,
    ...summarize(settled.filter((row) => row.confidence === band))
  }));
  return {
    private: true,
    generatedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    ownerId: idOf(userId),
    selection: SELECTION,
    overall: summarize(settled),
    byConfidence: byBand,
    byDomain: segment(settled, 'domain', [...new Set(settled.map((row) => row.domain || 'held-sentence'))]),
    byHorizon: segment(settled, 'horizon', HORIZONS.concat([{ id: 'unknown', label: 'horizon unnamed' }])),
    cases: settled.map((row) => ({
      pageId: row.pageId,
      claim: row.claim,
      confidence: row.confidence,
      result: row.result,
      href: `/judgment/${encodeURIComponent(row.pageId)}`
    }))
  };
};

const publicProjection = () => ({
  private: true,
  visible: false,
  reason: 'Calibration stays on the owner page. It is not a public score.'
});

const assertPrivate = (instrument, viewerId) => {
  if (!instrument?.private) return instrument;
  if (idOf(instrument.ownerId) && idOf(viewerId) !== idOf(instrument.ownerId)) {
    return publicProjection();
  }
  return instrument;
};

module.exports = {
  BANDS,
  SELECTION,
  SUFFICIENT,
  VERDICTS,
  assertPrivate,
  buildCalibration,
  publicProjection,
  qualitative,
  summarize
};
