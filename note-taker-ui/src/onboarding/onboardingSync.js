import { fetchOnboardingState, markOnboardingCompleteOnServer } from '../api/onboarding';
import { isWikiOnboardingComplete, onboardingCompleteKey } from './onboardingState';

/**
 * Reconcile the local completion flag with the server record.
 *
 * Kept apart from onboardingState so that module stays free of the API layer — it
 * is read synchronously from render paths across the app, and only the first-run
 * gate needs to await a network answer.
 *
 * Returns true when onboarding is complete for this account.
 */
const syncWikiOnboardingState = async () => {
  const localComplete = isWikiOnboardingComplete();
  try {
    const remote = await fetchOnboardingState();
    if (remote?.complete) {
      try {
        window.localStorage?.setItem(onboardingCompleteKey(), 'true');
      } catch (_error) {
        // The server already decided this; the local copy is only an optimization.
      }
      return true;
    }
    if (localComplete) {
      // This browser knows something the server does not — an account that finished
      // before completion was tracked server-side. Backfill it.
      markOnboardingCompleteOnServer().catch(() => {});
      return true;
    }
    return false;
  } catch (_error) {
    // Server unreachable: trust what this browser knows rather than re-running
    // onboarding on someone who has already done it.
    return localComplete;
  }
};

export default syncWikiOnboardingState;
export { syncWikiOnboardingState };
