/**
 * onboardingState — single source of truth for "has this user finished onboarding?"
 *
 * Why this exists: the completion flag was read and written by string literal in
 * WikiOnboarding and WikiFrontPage, and a third consumer (TourManager) now needs it
 * to stay out of onboarding's way. Three copies of a storage key is how they drift.
 *
 * The local key is namespaced per account. It used to be bare, so one account
 * finishing onboarding marked it done for the next account signing in on the same
 * browser, and that user never met first-run at all.
 *
 * Storage is two-layer on purpose. localStorage answers synchronously, because
 * render paths ask "is onboarding done?" while deciding what to show. The server
 * record is the durable one: it survives a new browser and makes the funnel
 * measurable. syncWikiOnboardingState reconciles them once per session.
 */

import { purgeUnscopedKeys, scopedKey } from '../utils/browserScope';

export const WIKI_ONBOARDING_COMPLETE_KEY = 'noeis.wikiOnboardingComplete';

// The bare key is the pre-scoping one. It is read nowhere and removed on sight, so
// a value left by another account cannot decide this account's first run.
export const onboardingCompleteKey = () => scopedKey(WIKI_ONBOARDING_COMPLETE_KEY);

export const isWikiOnboardingComplete = () => {
  try {
    purgeUnscopedKeys([WIKI_ONBOARDING_COMPLETE_KEY]);
    return window.localStorage?.getItem(onboardingCompleteKey()) === 'true';
  } catch (_error) {
    // Private mode / blocked storage: treat as not complete rather than throwing.
    return false;
  }
};

export const isWikiOnboardingPending = () => !isWikiOnboardingComplete();

export const markWikiOnboardingComplete = () => {
  try {
    window.localStorage?.setItem(onboardingCompleteKey(), 'true');
  } catch (_error) {
    // Best effort. A user who cannot persist the flag sees onboarding again next
    // visit, which is recoverable; throwing here would break the flow they just
    // finished.
  }
  // Record it where it outlives this browser. Fire and forget: the local flag has
  // already made the UI correct, and a failed write must not interrupt someone who
  // just finished onboarding. The next session's sync will settle it.
  //
  // Imported lazily on purpose. This module is read synchronously from render paths
  // all over the app; pulling the API layer (and axios) into its import graph would
  // drag it into every consumer.
  import('../api/onboarding')
    .then(({ markOnboardingCompleteOnServer }) => markOnboardingCompleteOnServer())
    .catch(() => {});
};
