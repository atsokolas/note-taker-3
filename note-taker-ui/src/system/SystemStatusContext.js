import { createContext, useContext } from 'react';

/**
 * @typedef {import('./systemStatusModel').SystemStatusReceipt} SystemStatusReceipt
 * @typedef {import('./systemStatusModel').BackgroundWork} BackgroundWork
 * @typedef {import('./systemStatusModel').RecoverableFailure} RecoverableFailure
 */

/**
 * Controls any page can call to push into the topbar system-status affordance.
 * The retry stored on a recoverable failure can carry a thunk (see App wiring),
 * so a failed action can be re-run from the topbar.
 *
 * @typedef {{
 *   setBackgroundWork: (work: BackgroundWork | null) => void;
 *   setLatestReceipt: (receipt: SystemStatusReceipt | null) => void;
 *   clearRecentReceipts: () => void;
 *   setRecoverableFailure: (failure: (RecoverableFailure & { retry?: () => void }) | null) => void;
 *   clearRecoverableFailure: () => void;
 *   resetSystemStatus: () => void;
 * }} SystemStatusControls
 */

const noop = () => {};

/** Safe no-op controls so producers never crash outside a provider (public routes, tests). */
const NOOP_CONTROLS = /** @type {SystemStatusControls} */ ({
  setBackgroundWork: noop,
  setLatestReceipt: noop,
  clearRecentReceipts: noop,
  setRecoverableFailure: noop,
  clearRecoverableFailure: noop,
  resetSystemStatus: noop
});

const SystemStatusContext = createContext(NOOP_CONTROLS);

export const SystemStatusProvider = SystemStatusContext.Provider;

/**
 * Read the system-status controls. Returns no-op controls if no provider is mounted,
 * so a component can call these unconditionally without guarding.
 * @returns {SystemStatusControls}
 */
export const useSystemStatusControls = () => useContext(SystemStatusContext);

export { NOOP_CONTROLS };
export default SystemStatusContext;
