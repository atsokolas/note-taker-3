// Non-destructive startup verification. createIndexes builds declared indexes;
// it never reconciles by dropping indexes as syncIndexes would.
const createChatgptOAuthReadiness = ({ models, logger = console } = {}) => {
  let ready = false;
  const entries = Object.entries(models);
  const settled = Promise.all(entries.map(async ([name, model]) => {
    try {
      await model.createIndexes();
      return true;
    } catch (_) {
      // Never log database connection strings, credentials or raw driver errors.
      logger.error('NOEIS OAuth index initialization failed:', name);
      return false;
    }
  })).then(results => {
    ready = entries.length > 0 && results.every(Boolean);
    if (ready) logger.info('NOEIS OAuth indexes ready:', entries.map(([name]) => name).join(', '));
    return ready;
  });
  return { isReady: () => ready, settled };
};
module.exports = { createChatgptOAuthReadiness };
