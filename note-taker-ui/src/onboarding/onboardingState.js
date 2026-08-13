/**
 * onboardingState — single source of truth for "has this user finished onboarding?"
 *
 * Why this exists: the completion flag was read and written by string literal in
 * WikiOnboarding and WikiFrontPage, and a third consumer (TourManager) now needs it
 * to stay out of onboarding's way. Three copies of a storage key is how they drift.
 *
 * This is deliberately still localStorage-backed. Moving onboarding state server-side
 * next to tour state is a later stage of the onboarding rebuild (see
 * docs/noeis-onboarding-town-model-spec-2026-08-13.md, D11); when that lands, only
 * this module changes.
 */

export const WIKI_ONBOARDING_COMPLETE_KEY = 'noeis.wikiOnboardingComplete';

export const isWikiOnboardingComplete = () => {
  try {
    return window.localStorage?.getItem(WIKI_ONBOARDING_COMPLETE_KEY) === 'true';
  } catch (_error) {
    // Private mode / blocked storage: treat as not complete rather than throwing.
    return false;
  }
};

export const isWikiOnboardingPending = () => !isWikiOnboardingComplete();

export const markWikiOnboardingComplete = () => {
  try {
    window.localStorage?.setItem(WIKI_ONBOARDING_COMPLETE_KEY, 'true');
  } catch (_error) {
    // Best effort. A user who cannot persist the flag sees onboarding again next
    // visit, which is recoverable; throwing here would break the flow they just
    // finished.
  }
};
