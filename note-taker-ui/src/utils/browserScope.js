/**
 * browserScope — namespace browser-local state to the account it belongs to.
 *
 * localStorage is per-origin, not per-account. Anything cached under a bare key is
 * shared by every account that signs in on that browser, which is wrong in two
 * different ways:
 *
 *  - Correctness: `noeis.wikiOnboardingComplete` decided whether first-run runs. One
 *    account finishing onboarding silently marked it done for the next account to
 *    sign in on the same machine, so a genuinely new user never met onboarding.
 *  - Disclosure: the wiki front-page snapshot caches page titles and briefing text.
 *    Under a shared key, one account's material renders for another before the
 *    first fetch returns.
 *
 * The account id comes from the JWT payload. It is read without verification and
 * used only to namespace local keys — the server remains the only thing that
 * decides what this token may actually read.
 */

const readTokenPayload = () => {
  try {
    const token = window.localStorage?.getItem('token') || '';
    const payloadPart = String(token).split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_error) {
    return null;
  }
};

/**
 * A stable id for the signed-in account, or '' when signed out.
 */
export const currentAccountId = () => {
  const payload = readTokenPayload();
  const id = payload?.id || payload?.userId || payload?.sub || '';
  return String(id || '').trim();
};

/**
 * Namespace a localStorage key to the current account.
 *
 * Signed out, the key is returned unchanged: there is no account to attribute it
 * to, and pre-auth state is not account state.
 */
export const scopedKey = (key) => {
  const accountId = currentAccountId();
  return accountId ? `${key}::${accountId}` : key;
};

/**
 * Drop legacy unscoped copies of keys that are now per-account.
 *
 * Without this, an unscoped value written before this change keeps deciding
 * behavior for whoever signs in next — which is the bug itself, preserved.
 */
export const purgeUnscopedKeys = (keys = []) => {
  // Only meaningful once there is an account to scope to. Signed out, the bare key
  // *is* the correct key — purging it there would delete state the moment it was
  // written.
  if (!currentAccountId()) return;
  keys.forEach((key) => {
    try {
      window.localStorage?.removeItem(key);
    } catch (_error) {
      // Nothing to clean up in blocked storage.
    }
  });
};

const browserScope = { currentAccountId, scopedKey, purgeUnscopedKeys };

export default browserScope;
