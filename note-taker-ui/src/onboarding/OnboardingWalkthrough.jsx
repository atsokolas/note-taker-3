import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WALKTHROUGH_STOPS } from './walkthroughConfig';
import {
  WALKTHROUGH_EVENT,
  advanceWalkthrough,
  endWalkthrough,
  readWalkthrough
} from './walkthroughState';
import { ACTIVE_BUILD_EVENT, clearActiveBuild, readActiveBuild } from './activeBuild';
import useWikiBuildProgress from './useWikiBuildProgress';
import { wikiPagePath } from '../utils/wikiFeatureFlags';

/**
 * OnboardingWalkthrough — four short stops over the user's own product, running
 * while their first page builds.
 *
 * It never blocks: the page behind it is live, the build state is always visible,
 * and both "show me the page now" and "skip" are present at every stop. If the
 * build fails it says so here rather than letting the walkthrough end on nothing.
 */
const OnboardingWalkthrough = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState(() => readWalkthrough());
  const [build, setBuild] = useState(() => readActiveBuild());

  useEffect(() => {
    const syncWalkthrough = () => setState(readWalkthrough());
    const syncBuild = () => setBuild(readActiveBuild());
    window.addEventListener(WALKTHROUGH_EVENT, syncWalkthrough);
    window.addEventListener(ACTIVE_BUILD_EVENT, syncBuild);
    return () => {
      window.removeEventListener(WALKTHROUGH_EVENT, syncWalkthrough);
      window.removeEventListener(ACTIVE_BUILD_EVENT, syncBuild);
    };
  }, []);

  const pageId = build?.pageId || '';
  const progress = useWikiBuildProgress(pageId, {
    enabled: Boolean(pageId),
    startedAt: build?.startedAt || null
  });
  const { isReady, isFailed, error, page } = progress;

  const index = state?.index ?? -1;
  const stop = index >= 0 ? WALKTHROUGH_STOPS[index] : null;

  // Drive the route from the current stop, so the panel always sits over the thing
  // it is talking about.
  //
  // Only when we are not already there. This effect can re-run while the app is
  // mid-redirect, and re-issuing the same navigation then fights the redirect: on
  // production it held a finished user at a blank '/' that should have resolved to
  // the wiki. Stops should point at real surfaces, and this makes a stop that does
  // not still settle.
  useEffect(() => {
    if (!stop?.route) return;
    const [routePath] = stop.route.split('?');
    if (location.pathname === routePath) return;
    navigate(stop.route);
  }, [location.pathname, navigate, stop?.route]);

  const finish = useCallback(({ openPage }) => {
    endWalkthrough();
    setState(null);
    if (openPage && pageId) {
      clearActiveBuild();
      setBuild(null);
      navigate(wikiPagePath(pageId));
    }
  }, [navigate, pageId]);

  const next = useCallback(() => {
    const advanced = advanceWalkthrough();
    if (!advanced || advanced.index >= WALKTHROUGH_STOPS.length) {
      // Last stop is the Paper — home. Leave them there rather than bouncing.
      finish({ openPage: false });
      return;
    }
    setState(advanced);
  }, [finish]);

  if (!stop) return null;

  const sourceCount = Number(page?.sourceRefs?.length || 0);
  const detail = (sourceCount > 0 && typeof stop.detailWithMaterial === 'function')
    ? stop.detailWithMaterial({ sourceCount })
    : stop.detail;

  const isLastStop = index === WALKTHROUGH_STOPS.length - 1;

  const buildLine = (() => {
    if (isFailed) {
      // Say the real reason, then what to do with it. "Failed" on its own leaves a
      // new user with a dead page and no idea it was the source that was too thin.
      const reason = error || 'it could not reach the evidence bar from that source.';
      return `I could not build that page — ${reason} Add a link or more material and I will try again.`;
    }
    if (isReady) return `${build?.title || 'Your page'} is ready.`;
    return `Still building ${build?.title ? `“${build.title}”` : 'your first page'}…`;
  })();

  return (
    <aside
      className={`onboarding-walkthrough${isReady ? ' is-ready' : ''}${isFailed ? ' is-failed' : ''}`}
      aria-label="Getting started"
    >
      <div className="onboarding-walkthrough__head">
        <span className="onboarding-walkthrough__count">
          {index + 1} of {WALKTHROUGH_STOPS.length}
        </span>
        <span className="onboarding-walkthrough__eyebrow">{stop.eyebrow}</span>
      </div>

      <strong className="onboarding-walkthrough__title">{stop.title}</strong>
      <p className="onboarding-walkthrough__detail">{detail}</p>

      <p className="onboarding-walkthrough__build" role="status">{buildLine}</p>

      <div className="onboarding-walkthrough__actions">
        <button type="button" className="onboarding-walkthrough__primary" onClick={next}>
          {isLastStop ? 'Done' : 'Next'}
        </button>
        {pageId && !isFailed ? (
          <button
            type="button"
            className="onboarding-walkthrough__secondary"
            onClick={() => finish({ openPage: true })}
          >
            {isReady ? 'Show me my page' : 'Take me there now'}
          </button>
        ) : null}
        <button
          type="button"
          className="onboarding-walkthrough__skip"
          onClick={() => finish({ openPage: false })}
        >
          Skip
        </button>
      </div>
    </aside>
  );
};

export default OnboardingWalkthrough;
