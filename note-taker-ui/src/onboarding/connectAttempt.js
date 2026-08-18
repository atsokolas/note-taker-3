/**
 * connectAttempt — the user has left onboarding on purpose, to connect an archive.
 *
 * Connecting is the one step of first run that happens outside first run: the
 * provider links go to Connections, and OAuth leaves the app entirely. Two things
 * need to know about that.
 *
 *  - The first-run gate, so it stops treating the departure as a new user who has
 *    wandered off and needs sending back. Without this the gate bounced them
 *    straight to /onboarding/wiki and the provider links did nothing at all.
 *  - Onboarding itself, so that when they return with material it can say what
 *    arrived instead of starting them over.
 *
 * Session-scoped: an attempt that outlived the tab is not an attempt worth
 * remembering.
 */

const CONNECT_ATTEMPT_KEY = 'noeis.onboarding.connectAttempt';

export const rememberConnectAttempt = (provider) => {
  try {
    window.sessionStorage?.setItem(CONNECT_ATTEMPT_KEY, String(provider || ''));
  } catch (_error) {
    // The return receipt is a nicety; losing it must not block connecting.
  }
};

export const readConnectAttempt = () => {
  try {
    return window.sessionStorage?.getItem(CONNECT_ATTEMPT_KEY) || '';
  } catch (_error) {
    return '';
  }
};

export const clearConnectAttempt = () => {
  try {
    window.sessionStorage?.removeItem(CONNECT_ATTEMPT_KEY);
  } catch (_error) {
    // Nothing to clean up.
  }
};

export { CONNECT_ATTEMPT_KEY };
