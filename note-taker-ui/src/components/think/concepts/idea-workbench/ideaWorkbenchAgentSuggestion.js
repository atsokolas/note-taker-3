const clean = (value) => String(value || '').trim();

const stripHtml = (value = '') => clean(
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
);

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const textToHtml = (value = '') => {
  const safe = clean(value);
  if (!safe) return '<p></p>';
  return safe
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
};

const ACTION_META = {
  'propose-hypothesis': {
    label: 'hypothesis',
    appliedSummary: 'Agent proposed a sharper hypothesis using the current evidence.',
    preservedSummary: 'Agent suggested a sharper hypothesis without replacing your draft.'
  },
  'strengthen-hypothesis': {
    label: 'strengthening pass',
    appliedSummary: 'Agent strengthened the hypothesis against the current support set.',
    preservedSummary: 'Agent suggested a strengthening pass without replacing your draft.'
  },
  'rewrite-clearly': {
    label: 'rewrite',
    appliedSummary: 'Agent rewrote the hypothesis for clarity.',
    preservedSummary: 'Agent suggested a clearer rewrite without replacing your draft.'
  }
};

export const resolveAgentHypothesisSuggestion = ({
  currentHtml = '',
  proposedText = '',
  action = ''
}) => {
  const proposed = clean(proposedText);
  const meta = ACTION_META[action] || {
    label: 'revision',
    appliedSummary: 'Agent updated the hypothesis.',
    preservedSummary: 'Agent suggested a revision without replacing your draft.'
  };

  if (!proposed) {
    return {
      applied: false,
      nextHypothesisHtml: currentHtml,
      versionSummary: '',
      commentTitle: 'Agent reasoning',
      commentBody: '',
      commentCaption: '',
      messageText: ''
    };
  }

  const hasExistingDraft = stripHtml(currentHtml).length > 0;
  if (!hasExistingDraft) {
    return {
      applied: true,
      nextHypothesisHtml: textToHtml(proposed),
      versionSummary: meta.appliedSummary,
      commentTitle: 'Hypothesis revision proposed',
      commentBody: proposed,
      commentCaption: '',
      messageText: meta.appliedSummary
    };
  }

  return {
    applied: false,
    nextHypothesisHtml: currentHtml,
    versionSummary: '',
    commentTitle: 'Suggested revision kept separate',
    commentBody: proposed,
    commentCaption: `Kept separate from your draft until you choose to use this ${meta.label}.`,
    messageText: `${meta.preservedSummary} I kept your current draft intact.`
  };
};
