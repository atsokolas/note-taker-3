import { AUTH_RETURN_KEY, isAppRoute, rememberReturnPath } from './appRoutes';

/* Logged out, every unmatched path fell through one catch-all to the marketing
   home. A link to your own wiki, a bookmark to a judgment, and a typo all
   landed on the same sales page — the front door, the sign-in, and the 404
   wearing one face. */
describe('telling a page of the product from a page that sells it', () => {
  it('knows the rooms behind the sign-in', () => {
    [
      '/wiki', '/wiki/read/abc', '/judgment', '/judgment/p1', '/library', '/think', '/settings/profile',
      '/all-highlights', '/tags/investing', '/views/one', '/search', '/concepts/moats', '/questions/q1'
    ]
      .forEach(path => expect(isAppRoute(path)).toBe(true));
  });

  it('does not claim the marketing pages, the front page, or a typo', () => {
    ['/', '/guides', '/proof', '/privacy', '/terms', '/login', '/ai-second-brain', '/this-does-not-exist']
      .forEach(path => expect(isAppRoute(path)).toBe(false));
  });

  it('is not fooled by a prefix that only looks like a room', () => {
    expect(isAppRoute('/wikipedia-guide')).toBe(false);
    expect(isAppRoute('/librarything')).toBe(false);
  });

  it('remembers where you were going, under the key the login form reads', () => {
    window.sessionStorage.clear();
    rememberReturnPath({ pathname: '/judgment/p1', search: '?x=1', hash: '' });
    expect(window.sessionStorage.getItem(AUTH_RETURN_KEY)).toBe('/judgment/p1?x=1');
  });

  it('does not send you back to the login page you just left', () => {
    window.sessionStorage.clear();
    rememberReturnPath({ pathname: '/login', search: '', hash: '' });
    expect(window.sessionStorage.getItem(AUTH_RETURN_KEY)).toBeNull();
  });
});
