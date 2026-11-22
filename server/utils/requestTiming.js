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

const ledgers = new AsyncLocalStorage();
const KINDS = ['db', 'ai'];

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
    proto.exec = function timedExec(...args) { return timed('db', () => exec.apply(this, args)); };
  });
  // Model.create calls the $save alias, so both names get the one timed save.
  const save = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = mongoose.Model.prototype.$save = function timedSave(...args) {
    return timed('db', () => save.apply(this, args));
  };
};

const summarize = (ledger, total) => [
  ...KINDS.map(kind => `${kind};dur=${ledger[kind].ms.toFixed(1)};desc="${ledger[kind].count}"`),
  `total;dur=${total.toFixed(1)}`
].join(', ');

const requestTiming = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const ledger = { db: { ms: 0, count: 0 }, ai: { ms: 0, count: 0 } };
  const started = performance.now();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const writeHead = res.writeHead;
  res.writeHead = function writeHeadWithTiming(...args) {
    if (!res.headersSent) res.setHeader('Server-Timing', summarize(ledger, performance.now() - started));
    return writeHead.apply(this, args);
  };
  res.on('finish', () => {
    console.log(`[REQ] ${requestId} ${req.method} ${req.originalUrl} ${res.statusCode} ${summarize(ledger, performance.now() - started)}`);
  });
  ledgers.run(ledger, next);
};

module.exports = { requestTiming, timeMongoose, timed };
