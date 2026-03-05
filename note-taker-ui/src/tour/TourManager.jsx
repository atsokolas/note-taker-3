import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TourOverlay from './TourOverlay';
import {
  TOUR_RESUME_QUERY,
  TOUR_RESUME_VALUE,
  TOUR_STATUS
} from './tourConfig';
import { useTour } from './TourProvider';

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

const TourManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state,
    currentStep,
    currentIndex,
    totalSteps,
    startTour,
    resumeTour,
    pauseTour,
    skipTour,
    nextStep,
    prevStep,
    refreshState
  } = useTour();
  const autoAdvancedStepRef = useRef('');

  useEffect(() => {
    if (state.loading) return;
    if (state.status === TOUR_STATUS.COMPLETED) return;
    if (state.status !== TOUR_STATUS.NOT_STARTED) return;
    if (!state.isFirstTimeVisitor) return;
    startTour().catch((error) => {
      console.error('Failed to auto-start tour:', error);
    });
  }, [startTour, state.isFirstTimeVisitor, state.loading, state.status]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get(TOUR_RESUME_QUERY) !== TOUR_RESUME_VALUE) return;
    resumeTour().catch((error) => {
      console.error('Failed to resume tour from URL param:', error);
    });
    params.delete(TOUR_RESUME_QUERY);
    navigate(`${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate, resumeTour]);

  useEffect(() => {
    if (!state.open || !currentStep) return;
    if (routeMatches(location, currentStep.route)) return;
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
