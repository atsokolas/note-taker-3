import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchOnboardingState } from '../api/onboarding';
import { isOnboardingComplete, rememberOnboardingComplete } from './onboardingState';

/**
 * useFirstRunGate — a new account starts at the beginning, wherever it lands.
 *
 * It lives at the authenticated shell because a new reader can arrive anywhere: a
 * remembered link, a shared page, the wordmark. The server decides who is new: an
 * account starts 'pending' at sign-up and stops being pending when first run ends
 * or is skipped. Accounts that predate first run are never 'pending', so nobody with
 * a library is ever walked back through it.
 *
 * Cost: the local flag short-circuits for everyone past first run, so the request
 * happens at most once per session, and only until the server has said "not new".
 */

const WELCOME_PATH = '/welcome';

// Routes that must not be interrupted: first run itself, signing in, the public
// pages, and the agent-approval screens an external app opened on purpose.
const EXEMPT_PREFIXES = [
  WELCOME_PATH,
  '/share/',
  '/register',
  '/login',
  '/a/run/',
  '/settings/connected-agents'
];

const isExempt = (pathname = '') => EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix));

const useFirstRunGate = ({ enabled = true } = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const checkedRef = useRef(false);
  const mountedRef = useRef(true);

  // Unmount is the only thing that abandons the decision. Sign-in bounces through
  // several routes in quick succession and this effect re-runs on each; if its own
  // cleanup cancelled the request, checkedRef would block the retry and a new
  // reader would silently never meet first run.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || checkedRef.current) return;
    if (isOnboardingComplete() || isExempt(location.pathname)) return;
    checkedRef.current = true;

    fetchOnboardingState()
      .then((state) => {
        if (!mountedRef.current) return;
        if (state?.status === 'pending') {
          navigate(WELCOME_PATH, { replace: true });
          return;
        }
        rememberOnboardingComplete();
      })
      .catch(() => {
        // Cannot tell: never hijack. The next route change asks again.
        if (mountedRef.current) checkedRef.current = false;
      });
  }, [enabled, location.pathname, navigate]);
};

export default useFirstRunGate;
export { WELCOME_PATH, EXEMPT_PREFIXES };
