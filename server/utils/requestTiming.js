const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

/**
 * Where does a request's time go? Each request carries a ledger of the time
 * it spent waiting on Mongo and on a model. Its response reports the ledger in
 * a Server-Timing header (browser devtools draw it), and one log line repeats it.
 * Waits that overlap are summed, so `db` can exceed `total` when queries run in
 * parallel; the count says how many there were.
 */

/** @typedef {Record<'db' | 'ai', { ms: number, count: number }>} Ledger */
/** @type {AsyncLocalStorage<Ledger>} */
const ledgers = new AsyncLocalStorage();
const KINDS = /** @type {const} */ (['db', 'ai']);

/** @template T @param {'db' | 'ai'} kind @param {() => Promise<T>} work @returns {Promise<T>} */
const timed = async (kind, work) => {
  const ledger = ledgers.getStore();
  if (!ledger) return work();
  const started = performance.now();
  try {
    return await work();
  } finally {
    ledger[kind].ms += performance.now() - started;
    ledger[kind].count += 1;
  }
};

// Every query, aggregate and save goes through one of these. Wrapping them
// here times all 90 models without touching any of them.
const timeMongoose = () => {
  [mongoose.Query.prototype, mongoose.Aggregate.prototype].forEach((proto) => {
    const exec = proto.exec;
    proto.exec = function timedExec(/** @type {any[]} */ ...args) { return timed('db', () => exec.apply(this, /** @type {any} */ (args))); };
  });
  // Model.create calls the $save alias, so both names get the one timed save.
  const save = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = mongoose.Model.prototype.$save = function timedSave(/** @type {any[]} */ ...args) {
    return timed('db', () => save.apply(this, args));
  };
};

/** @param {Ledger} ledger @param {number} total */
const summarize = (ledger, total) => [
  ...KINDS.map(kind => `${kind};dur=${ledger[kind].ms.toFixed(1)};desc="${ledger[kind].count}"`),
  `total;dur=${total.toFixed(1)}`
].join(', ');

/** @type {import('../types/request').Handler} */
const requestTiming = (req, res, next) => {
  // A caller's id is kept only if it is plainly an id, so it cannot write lines into the log.
  const offered = String(req.headers['x-request-id'] || '');
  const requestId = /^[\w.-]{1,64}$/.test(offered) ? offered : crypto.randomUUID();
  const ledger = { db: { ms: 0, count: 0 }, ai: { ms: 0, count: 0 } };
  const started = performance.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const writeHead = res.writeHead;
  res.writeHead = function writeHeadWithTiming(/** @type {any[]} */ ...args) {
    if (!res.headersSent) res.setHeader('Server-Timing', summarize(ledger, performance.now() - started));
    return writeHead.apply(this, /** @type {any} */ (args));
  };
  // The path only: query strings carry OAuth codes and states.
  res.on('finish', () => {
    console.log(`[REQ] ${requestId} ${req.method} ${req.path} ${res.statusCode} ${summarize(ledger, performance.now() - started)}`);
  });
  ledgers.run(ledger, next);
};

module.exports = { requestTiming, timeMongoose, timed };
