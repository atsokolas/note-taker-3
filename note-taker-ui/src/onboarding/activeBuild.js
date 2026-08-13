/**
 * activeBuild — the page currently being built for this user, in the background.
 *
 * Onboarding starts a build and immediately sends the user elsewhere, so the build
 * has to outlive the screen that started it. This is the handoff: whatever surface
 * the user lands on can pick the build up and show ambient progress.
 *
 * Session-scoped on purpose. A build that is still running when the tab closes will
 * finish server-side regardless; what we lose is only the ambient banner, and a
 * stale banner across sessions would be worse than none.
 */

const ACTIVE_BUILD_KEY = 'noeis.onboarding.activeBuild.v1';

export const setActiveBuild = ({ pageId, title = '', startedAt = null } = {}) => {
  if (!pageId) return;
  try {
    window.sessionStorage?.setItem(ACTIVE_BUILD_KEY, JSON.stringify({
      pageId: String(pageId),
      title: String(title || ''),
      startedAt: startedAt ? String(startedAt) : new Date().toISOString()
    }));
    // Surfaces mounted elsewhere in the tree need to know without a route change.
    window.dispatchEvent(new CustomEvent('noeis:active-build-changed'));
  } catch (_error) {
    // Storage blocked: the build still runs, the user just loses the banner.
  }
};

export const readActiveBuild = () => {
  try {
    const raw = window.sessionStorage?.getItem(ACTIVE_BUILD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.pageId ? parsed : null;
  } catch (_error) {
    return null;
  }
};

export const clearActiveBuild = () => {
  try {
    window.sessionStorage?.removeItem(ACTIVE_BUILD_KEY);
    window.dispatchEvent(new CustomEvent('noeis:active-build-changed'));
  } catch (_error) {
    // Nothing to clean up.
  }
};

export const ACTIVE_BUILD_EVENT = 'noeis:active-build-changed';
export { ACTIVE_BUILD_KEY };
