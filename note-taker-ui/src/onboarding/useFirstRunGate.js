import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listWikiPages } from '../api/wiki';
import { isWikiOnboardingComplete, markWikiOnboardingComplete } from './onboardingState';
import syncWikiOnboardingState from './onboardingSync';

/**
 * useFirstRunGate — a new user starts where the flow starts.
 *
 * This lives at the authenticated shell rather than on any one page, because the
 * landing route is not the flow. Home is the Paper; onboarding is what happens
 * before you have a home worth opening. Gating inside a single page meant a new
 * user who landed anywhere else simply never met onboarding.
 *
 * Cost control: the localStorage flag is checked first and short-circuits, so an
 * established user pays nothing. The API call happens at most once per session,
 * only for users who have not finished onboarding.
 */

const ONBOARDING_PATH = '/onboarding/wiki';

// Routes that must not be interrupted. Adoption flows hand off to onboarding on
// their own terms and carry state in the query string.
const EXEMPT_PREFIXES = [
  '/onboarding',
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

  // Unmount is the only thing that should abandon the decision. Sign-in bounces
  // the user through several routes in quick succession, and this effect re-runs
  // on each one; if the effect's own cleanup cancelled the in-flight check, the
  // answer would be thrown away and checkedRef would block the retry — a new user
  // would silently never reach onboarding.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (checkedRef.current) return;
    if (isWikiOnboardingComplete()) return;
    if (isExempt(location.pathname)) return;

    checkedRef.current = true;

    // Ask the server whether this account has already onboarded before deciding
    // anything: the local flag is per-browser, and a second device would otherwise
    // walk a returning user through first-run again.
    syncWikiOnboardingState()
      .then((complete) => {
        if (!mountedRef.current || complete) return null;
        // "Do you have a workspace" is a different question from "do you have a
        // page good enough to feature". The default list hides pages failing the
        // surface-quality filter, so an established account whose few most
        // recently updated pages happen to be drafts or thin scaffolds answered
        // "no" and was walked back through first-run onboarding — which offers
        // no way out except seeding starter packs. Ask whether anything exists.
        return listWikiPages({ limit: 1, includeLowQuality: 1, summary: 1 });
      })
      .then((pages) => {
        if (!mountedRef.current || pages === null) return;
        const hasContent = Array.isArray(pages) && pages.length > 0;
        if (hasContent) {
          // Already has a workspace: past onboarding by definition. Record it so
          // this never costs them a request again.
          markWikiOnboardingComplete();
          return;
        }
        navigate(ONBOARDING_PATH, { replace: true });
      })
      .catch(() => {
        // If we cannot tell, do not hijack the user. Onboarding stays reachable
        // from the wiki, and a failed probe should never strand someone mid-session.
        if (mountedRef.current) checkedRef.current = false;
      });
  }, [enabled, location.pathname, navigate]);
};

export default useFirstRunGate;
export { ONBOARDING_PATH, EXEMPT_PREFIXES };
