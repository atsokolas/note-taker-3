/**
 * walkthroughState — whether the first-run walkthrough is running, and where.
 *
 * Separate from activeBuild because the two can end independently: the build can
 * finish while the user is still on stop two, and the user can skip the walkthrough
 * while the build keeps going.
 */

import { WALKTHROUGH_STATE_KEY } from './walkthroughConfig';

const read = () => {
  try {
    const raw = window.sessionStorage?.getItem(WALKTHROUGH_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.index === 'number' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const write = (value) => {
  try {
    window.sessionStorage?.setItem(WALKTHROUGH_STATE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_EVENT));
  } catch (_error) {
    // Storage blocked: the walkthrough simply will not run. Not worth throwing over.
  }
};

export const WALKTHROUGH_EVENT = 'noeis:walkthrough-changed';

export const startWalkthrough = () => write({ index: 0, startedAt: new Date().toISOString() });

export const readWalkthrough = read;

export const advanceWalkthrough = () => {
  const current = read();
  if (!current) return null;
  const next = { ...current, index: current.index + 1 };
  write(next);
  return next;
};

export const endWalkthrough = () => {
  try {
    window.sessionStorage?.removeItem(WALKTHROUGH_STATE_KEY);
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_EVENT));
  } catch (_error) {
    // Nothing to clean up.
  }
};

export const isWalkthroughRunning = () => Boolean(read());
