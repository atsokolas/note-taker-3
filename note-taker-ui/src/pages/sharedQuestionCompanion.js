import { questionShareArchiveOf, questionShareSuccessionOf } from '../components/think/thinkShareFixture';

const asLine = (value) => String(value || '').trim();

export const SHARED_QUESTION_CONTEXT_TYPE = 'shared_question';

export const hasShareToken = () => (
  typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('token'))
);

export const publicCompanionReadings = (page) => (
  Array.isArray(page?.contributions)
    ? page.contributions.filter((row) => asLine(row?.by) && asLine(row?.text))
    : []
);

export const publicCompanionBrief = (page) => {
  if (questionShareSuccessionOf(page)) return null;
  const brief = page?.brief && typeof page.brief === 'object' ? page.brief : null;
  if (!brief) return null;
  if (!asLine(brief.agreement) && !asLine(brief.remainder) && !asLine(brief.observation)) return null;
  return brief;
};

export const publicCompanionLaterReadings = (page) => {
  const readings = publicCompanionReadings(page);
  const succession = questionShareSuccessionOf(page);
  if (!succession) return readings;
  const frozenIds = new Set(succession.alternatives.map((row) => asLine(row.id)).filter(Boolean));
  return readings.filter((row) => !frozenIds.has(asLine(row.id)));
};

const successorBoundLine = (page, succession) => {
  const names = publicCompanionLaterReadings(page).map((row) => asLine(row.by));
  const archive = questionShareArchiveOf(succession);
  if (!names.length && !archive) return 'Bound to this successor record.';
  if (!names.length && archive) return 'Bound to this successor record and what happened later.';
  if (names.length === 1 && archive) {
    return `Bound to this successor record, what happened later, and ${names[0]}'s later reading.`;
  }
  if (names.length === 1) return `Bound to this successor record and ${names[0]}'s later reading.`;
  if (names.length && archive) {
    return `Bound to this successor record, what happened later, and ${names.join(', ')}.`;
  }
  return `Bound to this successor record and ${names.join(', ')}.`;
};

export const boundCompanionLine = (page) => {
  const succession = questionShareSuccessionOf(page);
  if (succession) return successorBoundLine(page, succession);
  const names = publicCompanionReadings(page).map((row) => asLine(row.by));
  const brief = publicCompanionBrief(page);
  if (!names.length && !brief) return 'Bound to this published question.';
  if (names.length === 1 && !brief) return `Bound to this published question and ${names[0]}'s reading.`;
  if (names.length === 1 && brief) return `Bound to this published question, ${names[0]}'s reading, and the shared brief.`;
  if (names.length && brief) {
    return `Bound to this published question, ${names.join(', ')}, and the shared brief.`;
  }
  if (names.length) return `Bound to this published question and ${names.join(', ')}.`;
  return 'Bound to this published question and the shared brief.';
};

export const buildSharedQuestionCompanion = ({ slug, page } = {}) => {
  const contextId = asLine(slug);
  const succession = questionShareSuccessionOf(page);
  const title = asLine(succession?.unresolved) || asLine(page?.question?.text);
  if (!contextId || !title) return null;
  return {
    contextType: SHARED_QUESTION_CONTEXT_TYPE,
    contextId,
    contextTitle: title,
    subtitle: boundCompanionLine(page),
    placeholder: succession ? 'Ask about this handoff.' : 'Ask about this published question.',
    askLabel: succession ? 'Ask about this handoff' : 'Ask about this reading'
  };
};
