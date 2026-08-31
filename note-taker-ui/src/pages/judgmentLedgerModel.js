import {
  CLOCK_LABEL,
  CLOCKS,
  VERDICT_LABEL,
  explainDate,
  inferPrecision,
  proposeLessons,
  reconstructAt,
  replayDecision
} from './judgmentLedgerClient';

export {
  CLOCK_LABEL,
  CLOCKS,
  VERDICT_LABEL,
  explainDate,
  inferPrecision,
  proposeLessons,
  reconstructAt,
  replayDecision
};

const time = (value) => {
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? NaN : parsed;
};

export const momentsFrom = (ledger = {}, page = {}) => {
  const listed = Array.isArray(ledger.moments) ? ledger.moments : [];
  if (listed.length) return listed;
  const stamps = [
    page?.createdAt,
    page?.judgment?.bornAt,
    ...(Array.isArray(page?.judgment?.clocks) ? page.judgment.clocks.flatMap((fact) => [fact.occurredAt, fact.recordedAt]) : [])
  ];
  return Array.from(new Set(stamps.map((value) => {
    const at = time(value);
    return Number.isNaN(at) ? '' : new Date(at).toISOString();
  }).filter(Boolean))).sort();
};

export const cursorIndex = (moments = [], at) => {
  if (!moments.length) return 0;
  const instant = time(at);
  if (Number.isNaN(instant)) return moments.length - 1;
  const found = moments.findIndex((stamp) => time(stamp) >= instant);
  return found < 0 ? moments.length - 1 : found;
};

export const isNow = (moments = [], at) => {
  if (!moments.length) return true;
  return String(at || '') === String(moments[moments.length - 1] || '');
};

export const postmortemFor = (judgment = {}, ledger = {}) => {
  if (ledger?.postmortem) return ledger.postmortem;
  const verdicts = Array.isArray(judgment?.verdicts) ? judgment.verdicts : [];
  const latest = verdicts.at(-1);
  if (!latest) return null;
  const outcomes = Array.isArray(judgment?.outcomes) ? judgment.outcomes : [];
  if (outcomes.some((row) => String(row.verdictId || '') === String(latest.verdictId || ''))) return null;
  return {
    question: {
      held_up: 'Did it hold for the reasons you thought?',
      broke: 'What did you miss?',
      partly: 'Which part survived?',
      unresolvable: 'What would you need to know?',
      right_for_wrong_reasons: 'What was the real reason?'
    }[latest.result] || 'What happened?',
    verdictId: latest.verdictId,
    verdict: latest.result
  };
};
