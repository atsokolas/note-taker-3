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

const successorPrompts = (succession) => {
  if (questionShareArchiveOf(succession)) {
    return [
      'What did we nearly do?',
      'What happened later?',
      'What evidence was available then?'
    ];
  }
  return [
    'What alternatives were recorded then?',
    'What evidence was available then?',
    succession.review ? 'When should this be looked at again?' : 'Who handed this on?'
  ];
};

export const buildSharedQuestionCompanion = ({ slug, page } = {}) => {
  const contextId = asLine(slug);
  const succession = questionShareSuccessionOf(page);
  const archive = succession ? questionShareArchiveOf(succession) : null;
  const title = asLine(succession?.unresolved) || asLine(page?.question?.text);
  if (!contextId || !title) return null;
  const readings = publicCompanionLaterReadings(page);
  const brief = publicCompanionBrief(page);
  return {
    contextType: SHARED_QUESTION_CONTEXT_TYPE,
    contextId,
    contextTitle: title,
    subtitle: boundCompanionLine(page),
    placeholder: succession ? 'Ask about this handoff.' : 'Ask about this published question.',
    emptyStateText: succession
      ? (archive
        ? 'Ask about the recorded handoff. The other future is not in this record.'
        : 'Ask about the recorded handoff and the writing already on this door.')
      : 'Ask about the published question and the writing already on this door.',
    promptTemplates: succession
      ? successorPrompts(succession)
      : [
        'What is actually on this page?',
        'Where do the readings differ?',
        brief ? 'What does the brief still leave open?' : 'What still sits unanswered?'
      ],
    askLabel: succession ? 'Ask about this handoff' : 'Ask about this reading',
    boundSources: 1 + readings.length + (brief ? 1 : 0)
  };
};
