// Which paths belong to the product, as opposed to the pages that sell it.
//
// Logged out, every unmatched path fell through one catch-all to the marketing
// home. So a link to your own wiki, a bookmark to a judgment, and a typo all
// landed on the same sales page with a 200 — the product's front door, its
// missing pages, and its 404 all wearing the same face. These two are
// different questions: a page that exists and needs you signed in, and a page
// that does not exist.

const APP_ROUTE_PREFIXES = Object.freeze([
  '/wiki',
  '/judgment',
  '/lessons',
  '/library',
  '/think',
  '/paper',
  '/settings',
  '/connections',
  '/integrations',
  '/data-integrations',
  '/map',
  '/review',
  '/return-queue',
  '/trending',
  '/export',
  '/today',
  '/onboarding',
  '/articles',
  '/collections',
  '/how-to-use',
  '/marketing-analytics',
  '/search-console-opportunities'
]);

/** True for a page that exists but is behind the sign-in. */
export const isAppRoute = (pathname = '') => {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (path === '/') return false;
  return APP_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
};

/* Where to come back to once you have signed in. The same key the API client
   writes when a request is refused, and the same key the login form reads, so
   arriving from a link and being logged out mid-session end up in one place. */
export const AUTH_RETURN_KEY = 'auth_return_to';

export const rememberReturnPath = (location) => {
  const path = `${location?.pathname || ''}${location?.search || ''}${location?.hash || ''}`;
  if (!path || path === '/login') return;
  try {
    window.sessionStorage?.setItem(AUTH_RETURN_KEY, path);
  } catch (_error) {
    // A blocked sessionStorage costs the return trip, not the sign-in.
  }
};

export default isAppRoute;
