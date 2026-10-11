import { liveExplorationForPageClaim } from './openSentenceBinding';

/* The panel stays one Partner. Opening a sentence rebinds what it is with,
   not what it is allowed to write. A missing source stays missing. */

export const companionForOpenedClaim = (page, { claimId, exploration } = {}) => {
  const opened = String(claimId || '').trim();
  if (!opened) return null;

  const live = liveExplorationForPageClaim(page, { claimId: opened });
  const text = String(live.originalText || '').trim();
  if (!text) return null;

  const draft = exploration?.claimId === opened ? exploration.draft : null;
  const sources = [live.source, draft?.selectedSource || live.other]
    .filter(source => source?.available && source?.passage);

  return {
    subject: text,
    askPlaceholder: draft?.writing ? 'Think with me about this' : 'Ask about this sentence',
    caption: draft
      ? 'Ask with these passages and your private exploration.'
      : 'Ask about this sentence. The Partner does not rewrite the page.',
    lines: [
      ...sources.map((source, index) => ({ id: index ? `source-${index}` : 'source', text: source.title || source.articleTitle })),
      ...(draft?.writing ? [{ id: 'writing', text: draft.title || 'Your writing' }] : []),
      ...(draft?.pressure?.premise ? [{ id: 'premise', text: 'Your hypothetical premise' }] : [])
    ]
  };
};
