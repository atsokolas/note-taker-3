import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useWikiBuildProgress from './useWikiBuildProgress';
import { ACTIVE_BUILD_EVENT, clearActiveBuild, readActiveBuild } from './activeBuild';
import { wikiPagePath } from '../utils/wikiFeatureFlags';

/**
 * OnboardingBuildBanner — ambient progress for a build the user is not waiting on.
 *
 * The rules this encodes, from the onboarding spec:
 *  - Never trap the user. There is always a way out of watching, and always a way in
 *    to the page the moment it is reachable.
 *  - Never end on nothing. A failed or stalled build says so plainly instead of
 *    pulsing forever.
 */
const OnboardingBuildBanner = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState(() => readActiveBuild());

  useEffect(() => {
    const sync = () => setActive(readActiveBuild());
    window.addEventListener(ACTIVE_BUILD_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVE_BUILD_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const pageId = active?.pageId || '';
  const { isBuilding, isReady, isFailed, error, timedOut } = useWikiBuildProgress(pageId, {
    enabled: Boolean(pageId)
  });

  const dismiss = useCallback(() => {
    clearActiveBuild();
    setActive(null);
  }, []);

  const openPage = useCallback(() => {
    if (!pageId) return;
    clearActiveBuild();
    setActive(null);
    navigate(wikiPagePath(pageId));
  }, [navigate, pageId]);

  if (!pageId) return null;

  const title = active?.title ? `“${active.title}”` : 'your first page';

  return (
    <div
      className={`onboarding-build-banner${isReady ? ' is-ready' : ''}${isFailed ? ' is-failed' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="onboarding-build-banner__copy">
        {isBuilding ? (
          <>
            <strong>Building {title}…</strong>
            <span>Keep going — I&apos;ll tell you the moment it&apos;s ready.</span>
          </>
        ) : null}
        {isReady ? (
          <>
            <strong>{active?.title || 'Your first page'} is ready.</strong>
            <span>It&apos;s in your wiki now.</span>
          </>
        ) : null}
        {isFailed ? (
          <>
            <strong>I hit a wall building {title}.</strong>
            <span>
              {timedOut
                ? 'It is taking longer than expected. Nothing is lost — open the page to check on it.'
                : (error || 'The draft did not pass the quality bar.')}
            </span>
          </>
        ) : null}
      </div>
      <div className="onboarding-build-banner__actions">
        {isReady ? (
          <button type="button" className="onboarding-build-banner__primary" onClick={openPage}>
            Take me there
          </button>
        ) : null}
        {isBuilding ? (
          <button type="button" className="onboarding-build-banner__secondary" onClick={openPage}>
            Take me there now
          </button>
        ) : null}
        {isFailed ? (
          <button type="button" className="onboarding-build-banner__secondary" onClick={openPage}>
            Open the page
          </button>
        ) : null}
        <button
          type="button"
          className="onboarding-build-banner__dismiss"
          onClick={dismiss}
          aria-label="Dismiss build progress"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default OnboardingBuildBanner;
