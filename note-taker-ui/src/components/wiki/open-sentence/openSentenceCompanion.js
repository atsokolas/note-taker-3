import { liveExplorationForPageClaim } from './openSentenceBinding';

/* The rail stays one partner. Opening a sentence rebinds what it is with,
   not what it is allowed to write. A missing source stays missing. */

export const companionForOpenedClaim = (page, { claimId } = {}) => {
  const opened = String(claimId || '').trim();
  if (!opened) return null;

  const live = liveExplorationForPageClaim(page, { claimId: opened });
  const text = String(live.originalText || '').trim();
  if (!text) return null;

  const source = live.source;
  const bound = source?.available ? 1 : 0;

  return {
    subject: text,
    boundSources: bound,
    empty: bound
      ? 'Nothing to retrieve until you ask against this sentence.'
      : 'Nothing beside this sentence yet.',
    askPlaceholder: 'Ask about this sentence',
    roleDescription: 'Works beside this sentence. Does not rewrite the article.',
    lines: source?.available && source.title
      ? [{ id: 'source', text: source.title }]
      : []
  };
};
