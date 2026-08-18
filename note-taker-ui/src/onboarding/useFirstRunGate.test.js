import { renderHook, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import useFirstRunGate from './useFirstRunGate';
import { listWikiPages } from '../api/wiki';
import { isWikiOnboardingComplete } from './onboardingState';
import syncWikiOnboardingState from './onboardingSync';

jest.mock('../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

// The gate now asks the server whether this account already onboarded, so a second
// device does not re-run first-run. Default: server says not complete.
jest.mock('./onboardingSync', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(false)
}));

const navigate = jest.fn();

const atPath = (pathname) => {
  jest.spyOn(router, 'useLocation').mockReturnValue({
    pathname, search: '', hash: '', state: null, key: 'test'
  });
};

describe('useFirstRunGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    syncWikiOnboardingState.mockResolvedValue(false);
    atPath('/paper');
  });

  it('sends a brand-new user to the start of the flow, not the home page', async () => {
    listWikiPages.mockResolvedValue([]);

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding/wiki', { replace: true }));
  });

  it('lets a new user reach the connector they just clicked', async () => {
    // The provider links in onboarding appeared to do nothing. They were addressed
    // correctly; this gate undid them. A user with no pages who lands on
    // /connections looks exactly like a new user who wandered off, so the gate
    // returned them to /onboarding/wiki before Connections finished mounting.
    // The distinction the gate was missing: they went there on purpose.
    sessionStorage.setItem('noeis.onboarding.connectAttempt', 'readwise');
    listWikiPages.mockResolvedValue([]);
    atPath('/connections');

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(listWikiPages).not.toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still rescues a new user who lands somewhere else entirely', async () => {
    // Standing down must be scoped to the connect attempt, not to every stray route.
    listWikiPages.mockResolvedValue([]);
    atPath('/connections');

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding/wiki', { replace: true }));
  });

  it('leaves an established user on the home page and stops checking', async () => {
    listWikiPages.mockResolvedValue([{ _id: 'page-1' }]);

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(isWikiOnboardingComplete()).toBe(true));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('counts pages the surface-quality filter would hide', async () => {
    // A real account holding 57 wikis was sent back through first-run
    // onboarding, because the default list hides low-quality pages and its few
    // most recently updated ones were drafts. Onboarding then offered no exit
    // except seeding starter packs. "Do you have a workspace" must not be
    // answered by "do you have a page worth featuring".
    listWikiPages.mockResolvedValue([{ _id: 'page-1' }]);

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(listWikiPages).toHaveBeenCalledWith(
      expect.objectContaining({ includeLowQuality: 1 })
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('costs a finished user nothing', () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');

    renderHook(() => useFirstRunGate());

    expect(listWikiPages).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not interrupt the onboarding route itself', () => {
    atPath('/onboarding/wiki');

    renderHook(() => useFirstRunGate());

    expect(listWikiPages).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not hijack a shared-wiki adoption hand-off', () => {
    atPath('/share/wiki/some-slug');

    renderHook(() => useFirstRunGate());

    expect(listWikiPages).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still redirects when the route changes while the check is in flight', async () => {
    // Sign-in bounces through several routes in quick succession. The in-flight
    // check must survive that, or a new user silently never reaches onboarding.
    let resolvePages;
    listWikiPages.mockReturnValue(new Promise((resolve) => { resolvePages = resolve; }));

    const { rerender } = renderHook(() => useFirstRunGate());
    atPath('/wiki');
    rerender();
    atPath('/think');
    rerender();

    resolvePages([]);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding/wiki', { replace: true }));
    // One probe, not one per route change.
    expect(listWikiPages).toHaveBeenCalledTimes(1);
  });

  it('does not re-run onboarding for an account that finished it on another device', async () => {
    syncWikiOnboardingState.mockResolvedValue(true);

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(syncWikiOnboardingState).toHaveBeenCalled());
    expect(listWikiPages).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves the user alone when it cannot tell', async () => {
    listWikiPages.mockRejectedValue(new Error('offline'));

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});
