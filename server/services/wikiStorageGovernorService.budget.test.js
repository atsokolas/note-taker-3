const assert = require('assert');
const {
  DEFAULT_HIGH_WATER_BYTES,
  DEFAULT_RECENT_REVISION_LIMIT,
  revisionKeepLimit
} = require('./wikiStorageGovernorService');

/* The limit that broke was 20 recent revisions per page, or 5 once the cluster
   was already in trouble. Neither number knew how many pages shared the disk or
   how big a revision is, so 279 pages at 20 apiece licensed roughly 730MB of
   history on a 512MB cluster. No tuning of a count can fix a constraint in
   bytes; the budget has to be denominated the same way the limit is spent. */
const KB = 1024;
const MB = 1024 * KB;
const limit = (pageCount, averageRevisionBytes, extra = {}) => revisionKeepLimit({
  highWaterBytes: DEFAULT_HIGH_WATER_BYTES,
  pageCount,
  averageRevisionBytes,
  ...extra
});

// The shape that filled the cluster now yields the number a person would have
// chosen by hand — but derived, so it keeps being right as the shape changes.
assert.strictEqual(limit(279, 131 * KB), 5);

/* And when history gets cheap the window widens on its own. This is the whole
   point: a pass that changes nothing now costs almost nothing to record, and a
   budget in bytes notices that where a budget in counts never could. */
assert.strictEqual(limit(279, 20 * KB), DEFAULT_RECENT_REVISION_LIMIT);

// A small wiki has no reason to forget anything.
assert.strictEqual(limit(10, 131 * KB), DEFAULT_RECENT_REVISION_LIMIT);

// More pages sharing one disk means a shorter window each.
assert.ok(limit(1000, 131 * KB) < limit(100, 131 * KB));

// Bigger revisions mean fewer of them.
assert.ok(limit(279, 1 * MB) < limit(279, 100 * KB));

/* A page with no recent history is not a page whose history is small; it is a
   page you cannot see the work on. Even pathological revisions keep a floor. */
assert.strictEqual(limit(279, 50 * MB), 3);
assert.strictEqual(limit(100000, 10 * MB), 3);

/* Nothing measured is not permission to keep everything, but it is no reason to
   start deleting either. An unmeasured cluster falls back to the ceiling. */
assert.strictEqual(limit(0, 0), DEFAULT_RECENT_REVISION_LIMIT);
assert.strictEqual(limit(279, 0), DEFAULT_RECENT_REVISION_LIMIT);
assert.strictEqual(revisionKeepLimit(), DEFAULT_RECENT_REVISION_LIMIT);

// The ceiling is a ceiling: a generous disk never licenses more than asked for.
assert.strictEqual(limit(1, 1, { ceiling: 8 }), 8);

// A bigger disk affords a longer window at the same shape.
assert.ok(
  revisionKeepLimit({ highWaterBytes: 4 * 1024 * MB, pageCount: 279, averageRevisionBytes: 131 * KB })
  > limit(279, 131 * KB)
);

console.log('wikiStorageGovernor revision budget tests passed');
