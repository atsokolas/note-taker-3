import { renderHook, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import useFirstRunGate from './useFirstRunGate';
import { listWikiPages } from '../api/wiki';
import { isWikiOnboardingComplete } from './onboardingState';

jest.mock('../api/wiki', () => ({
  listWikiPages: jest.fn()
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
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    atPath('/paper');
  });

  it('sends a brand-new user to the start of the flow, not the home page', async () => {
    listWikiPages.mockResolvedValue([]);

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding/wiki', { replace: true }));
  });

  it('leaves an established user on the home page and stops checking', async () => {
    listWikiPages.mockResolvedValue([{ _id: 'page-1' }]);

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(isWikiOnboardingComplete()).toBe(true));
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

  it('leaves the user alone when it cannot tell', async () => {
    listWikiPages.mockRejectedValue(new Error('offline'));

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });
});
