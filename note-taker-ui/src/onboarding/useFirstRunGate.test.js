import { renderHook, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import useFirstRunGate from './useFirstRunGate';
import { fetchOnboardingState } from '../api/onboarding';
import { isOnboardingComplete } from './onboardingState';

jest.mock('../api/onboarding', () => ({
  fetchOnboardingState: jest.fn()
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
    fetchOnboardingState.mockResolvedValue({ status: 'pending' });
    atPath('/wiki');
  });

  it('sends a new account to the start, wherever it lands', async () => {
    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/welcome', { replace: true }));
  });

  it('never walks an account that predates first run through it', async () => {
    // Accounts made before sign-up marked them pending have libraries. Walking
    // them through "what do you think is true?" would be absurd.
    fetchOnboardingState.mockResolvedValue({ status: 'not_started' });

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(isOnboardingComplete()).toBe(true));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('remembers a finished account so it never asks again', async () => {
    fetchOnboardingState.mockResolvedValue({ status: 'complete' });

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(isOnboardingComplete()).toBe(true));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('costs a finished reader nothing', () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');

    renderHook(() => useFirstRunGate());

    expect(fetchOnboardingState).not.toHaveBeenCalled();
  });

  it.each(['/welcome', '/share/wiki/some-slug', '/settings/connected-agents/authorize'])(
    'does not interrupt %s',
    (pathname) => {
      atPath(pathname);

      renderHook(() => useFirstRunGate());

      expect(fetchOnboardingState).not.toHaveBeenCalled();
    }
  );

  it('still redirects when the route changes while the check is in flight', async () => {
    // Sign-in bounces through several routes in quick succession.
    let resolveState;
    fetchOnboardingState.mockReturnValue(new Promise((resolve) => { resolveState = resolve; }));

    const { rerender } = renderHook(() => useFirstRunGate());
    atPath('/library');
    rerender();
    atPath('/think');
    rerender();
    resolveState({ status: 'pending' });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/welcome', { replace: true }));
    expect(fetchOnboardingState).toHaveBeenCalledTimes(1);
  });

  it('leaves the reader alone when it cannot tell', async () => {
    fetchOnboardingState.mockRejectedValue(new Error('offline'));

    renderHook(() => useFirstRunGate());

    await waitFor(() => expect(fetchOnboardingState).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(isOnboardingComplete()).toBe(false);
  });
});
