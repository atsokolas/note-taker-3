#!/usr/bin/env node
/**
 * Does the server actually start?
 *
 * `node -c` parses a file; it does not evaluate it. A missing import is
 * therefore invisible to it: `VectorItem` was passed to a router without ever
 * being imported, every check in the gate passed, and the deploy failed at boot
 * with `ReferenceError: VectorItem is not defined`. Render kept the previous
 * instance alive, so production silently served hours-old code while four
 * successive deploys reported "Deployed" in the timeline and failed in the
 * status column.
 *
 * This evaluates the entry module with `listen` stubbed, so it exercises every
 * top-level require, router construction, and model reference without binding a
 * port or waiting on a database. It is the cheapest possible answer to the only
 * question that matters before shipping: would this process come up?
 */

const http = require('http');
const path = require('path');

const ENTRY = path.resolve(__dirname, '..', 'server', 'server.js');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/noeis-boot-check';
process.env.PORT = process.env.PORT || '0';
// Background workers must not start doing real work during a boot check.
process.env.EMBEDDING_JOB_WORKER_DISABLED = 'true';

// Binding a port would make this fail in CI for reasons unrelated to the code.
const realListen = http.Server.prototype.listen;
http.Server.prototype.listen = function stubbedListen(...args) {
  const callback = args.find(arg => typeof arg === 'function');
  if (callback) setImmediate(callback);
  return this;
};

const finish = (code) => {
  http.Server.prototype.listen = realListen;
  // Timers and open sockets from module scope would otherwise hold the process.
  process.exit(code);
};

try {
  require(ENTRY);
  console.log('boot check passed — server module evaluates cleanly');
  setTimeout(() => finish(0), 500);
} catch (error) {
  console.error('boot check FAILED — this build would not start:');
  console.error(`  ${error.name}: ${error.message}`);
  if (error.stack) {
    const frame = String(error.stack).split('\n').find(line => line.includes('/server/'));
    if (frame) console.error(` ${frame.trim()}`);
  }
  setTimeout(() => finish(1), 100);
}
