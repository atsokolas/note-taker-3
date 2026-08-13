import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TourOverlay from './TourOverlay';
import {
  TOUR_RESUME_QUERY,
  TOUR_RESUME_VALUE,
  TOUR_STATUS
} from './tourConfig';
import { useTour } from './TourProvider';
import { isWikiOnboardingPending } from '../onboarding/onboardingState';

const parseRoute = (route) => {
  if (!route) return null;
  try {
    return new URL(route, window.location.origin);
  } catch (error) {
    return null;
  }
};

const routeMatches = (location, route) => {
  if (!route) return true;
  const parsed = parseRoute(route);
  if (!parsed) return true;
  if (parsed.pathname !== location.pathname) return false;
  const expectedParams = parsed.searchParams;
  for (const [key, value] of expectedParams.entries()) {
    if (new URLSearchParams(location.search).get(key) !== value) {
      return false;
    }
  }
  return true;
};

const TOUR_AUTONAV_BLOCKED_PREFIXES = [
  '/wiki/workspace',
  '/connections',
  '/integrations',
  '/share/',
  // First-run onboarding drives its own navigation. Without this the tour yanks a
  // brand-new user off /onboarding/wiki to its own first step mid-build.
  '/onboarding'
];

const shouldAutoNavigateForTour = ({ location, currentStep, explicitResume = false } = {}) => {
  if (!currentStep?.route) return false;
  if (explicitResume) return true;
  const pathname = location?.pathname || '';
  if (TOUR_AUTONAV_BLOCKED_PREFIXES.some(prefix => pathname.startsWith(prefix))) return false;
  return true;
};

const TourManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state,
    currentStep,
    currentIndex,
    totalSteps,
    resumeTour,
    pauseTour,
    skipTour,
    nextStep,
    prevStep,
    refreshState
  } = useTour();
  const autoAdvancedStepRef = useRef('');
  const explicitResumeRef = useRef(false);

  // The tour no longer auto-starts.
  //
  // Auto-start only ever fired for NOT_STARTED first-time visitors — exactly the
  // users who now get first-run onboarding instead. Leaving it on meant the tour
  // grabbed them the moment onboarding finished and dragged them off the home page
  // they had just chosen to open. Deferring it (rather than deleting it) only moved
  // the collision later in the sequence.
  //
  // The tour stays fully reachable on demand: ?tour=resume, and any explicit entry
  // point. It is scheduled to be replaced by the onboarding walkthrough, which runs
  // over the user's own material while their first build is still going.
  useEffect(() => {
    if (state.loading) return;
    if (!isWikiOnboardingPending()) return;
    // Nothing to do. Retained as an explicit statement that first-run belongs to
    // onboarding, so a future change does not quietly restore a second driver.
  }, [state.loading]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get(TOUR_RESUME_QUERY) !== TOUR_RESUME_VALUE) return;
    explicitResumeRef.current = true;
    resumeTour().catch((error) => {
      console.error('Failed to resume tour from URL param:', error);
    });
    params.delete(TOUR_RESUME_QUERY);
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate, resumeTour]);

  useEffect(() => {
    if (!state.open || !currentStep) return;
    if (routeMatches(location, currentStep.route)) return;
    const explicitResume = explicitResumeRef.current
      || new URLSearchParams(location.search).get(TOUR_RESUME_QUERY) === TOUR_RESUME_VALUE;
    if (!shouldAutoNavigateForTour({ location, currentStep, explicitResume })) return;
    navigate(currentStep.route, { replace: false });
  }, [currentStep, location, navigate, state.open]);

  useEffect(() => {
    if (!state.open || !currentStep?.signalKey) {
      autoAdvancedStepRef.current = '';
      return;
    }
    const done = Boolean(state.signals?.[currentStep.signalKey]);
    if (!done) {
      autoAdvancedStepRef.current = '';
      return;
    }
    if (autoAdvancedStepRef.current === currentStep.id) return;
    autoAdvancedStepRef.current = currentStep.id;
    const timer = setTimeout(() => {
      nextStep().catch((error) => {
        console.error('Failed to auto-advance tour step:', error);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [currentStep, nextStep, state.open, state.signals]);

  useEffect(() => {
    if (state.loading) return undefined;
    if (!state.open && state.status !== TOUR_STATUS.IN_PROGRESS) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        await refreshState();
      } catch (error) {
        if (!cancelled) {
          console.error('Failed refreshing tour state:', error);
        }
      }
    };
    const interval = setInterval(tick, 3500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshState, state.loading, state.open, state.status]);

  const onAction = useMemo(() => async (cta = {}) => {
    if (cta.href) {
      window.open(cta.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (cta.route) {
      navigate(cta.route);
      return;
    }
    if (cta.action === 'run_semantic_demo') {
      navigate('/search?mode=semantic&q=decision%20quality');
      setTimeout(() => {
        refreshState().catch(() => {});
      }, 700);
    }
  }, [navigate, refreshState]);

  if (state.loading) return null;
  if (!state.open || state.status === TOUR_STATUS.COMPLETED) return null;

  return (
    <TourOverlay
      open={state.open}
      step={currentStep}
      stepIndex={currentIndex}
      totalSteps={totalSteps}
      onNext={nextStep}
      onBack={prevStep}
      onSkip={skipTour}
      onClose={pauseTour}
      onAction={onAction}
    />
  );
};

export default TourManager;
