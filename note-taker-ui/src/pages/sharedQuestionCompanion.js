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
  const brief = page?.brief && typeof page.brief === 'object' ? page.brief : null;
  if (!brief) return null;
  if (!asLine(brief.agreement) && !asLine(brief.remainder) && !asLine(brief.observation)) return null;
  return brief;
};

export const boundCompanionLine = (page) => {
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
  const title = asLine(page?.question?.text);
  if (!contextId || !title) return null;
  const readings = publicCompanionReadings(page);
  const brief = publicCompanionBrief(page);
  return {
    contextType: SHARED_QUESTION_CONTEXT_TYPE,
    contextId,
    contextTitle: title,
    subtitle: boundCompanionLine(page),
    placeholder: 'Ask about this published question.',
    emptyStateText: 'Ask about the published question and the writing already on this door.',
    promptTemplates: [
      'What is actually on this page?',
      'Where do the readings differ?',
      brief ? 'What does the brief still leave open?' : 'What still sits unanswered?'
    ],
    boundSources: 1 + readings.length + (brief ? 1 : 0)
  };
};
