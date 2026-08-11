const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const READ_METHODS = new Set(['get', 'head']);

export const shouldRecoverBackend = (error = {}) => {
  const config = error?.config || {};
  const method = String(config.method || 'get').toLowerCase();
  if (!READ_METHODS.has(method) || config.__noeisWakeRetry) return false;
  if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return false;
  const status = Number(error?.response?.status || 0);
  if (status) return TRANSIENT_STATUSES.has(status);
  return error?.code === 'ERR_NETWORK' || error?.message === 'Network Error';
};

export const createBackendRecovery = ({
  probe,
  sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  delays = [0, 1000, 2000, 3000, 4000, 5000]
} = {}) => {
  let recoveryInFlight = null;

  return () => {
    if (recoveryInFlight) return recoveryInFlight;
    recoveryInFlight = (async () => {
      let lastError = null;
      for (const delay of delays) {
        if (delay > 0) await sleep(delay);
        try {
          await probe();
          return true;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Backend did not recover.');
    })().finally(() => {
      recoveryInFlight = null;
    });
    return recoveryInFlight;
  };
};
