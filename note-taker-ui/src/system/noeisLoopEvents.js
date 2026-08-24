export const NOEIS_LOOP_STATUS_CHANGED_EVENT = 'noeis:loop-status-changed';

export const notifyNoeisLoopStatusChanged = (loopId = '') => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(NOEIS_LOOP_STATUS_CHANGED_EVENT, {
    detail: { loopId: String(loopId || '').trim() }
  }));
};
