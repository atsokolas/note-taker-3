/**
 * onboardingState — "has this account finished first run?", answered locally.
 *
 * The server record (GET /api/onboarding/state) is the durable one: a new account
 * starts 'pending', and only 'pending' is ever walked through first run. This flag
 * is the synchronous cache of "not pending any more", so an established reader
 * never pays a request for it, and render paths can ask without awaiting.
 *
 * The key is namespaced per account. It used to be bare, so one account finishing
 * marked it done for the next account signing in on the same browser. The value of
 * the key is unchanged from the wiki-first flow, so readers who finished that one
 * are not asked again.
 */

import { purgeUnscopedKeys, scopedKey } from '../utils/browserScope';

const ONBOARDING_COMPLETE_KEY = 'noeis.wikiOnboardingComplete';

export const onboardingCompleteKey = () => scopedKey(ONBOARDING_COMPLETE_KEY);

export const isOnboardingComplete = () => {
  try {
    purgeUnscopedKeys([ONBOARDING_COMPLETE_KEY]);
    return window.localStorage?.getItem(onboardingCompleteKey()) === 'true';
  } catch (_error) {
    // Private mode / blocked storage: not known to be complete.
    return false;
  }
};

/* Remember locally only. For an account the server already says is past first run. */
export const rememberOnboardingComplete = () => {
  try {
    window.localStorage?.setItem(onboardingCompleteKey(), 'true');
  } catch (_error) {
    // Best effort: the gate asks the server again next session, which is cheap.
  }
};

export const markOnboardingComplete = () => {
  rememberOnboardingComplete();
  // Fire and forget. The local flag already made the UI correct, and a failed write
  // must not interrupt someone who just finished. Imported lazily so this module,
  // read from render paths everywhere, stays out of the API layer's import graph.
  import('../api/onboarding')
    .then(({ markOnboardingCompleteOnServer }) => markOnboardingCompleteOnServer())
    .catch(() => {});
};
