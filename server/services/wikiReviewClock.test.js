const test = require('node:test');
const assert = require('node:assert/strict');
const { inkWikiPageReview } = require('./wikiReviewClock');

test('inkWikiPageReview writes the quiet Accept clock on the page and freshness', () => {
  const now = new Date('2026-08-29T12:00:00.000Z');
  const marked = [];
  const page = {
    freshness: { status: 'needs_review', lastMaintainedAt: null },
    markModified(path) { marked.push(path); }
  };

  inkWikiPageReview(page, now);

  assert.equal(page.lastReviewedAt.toISOString(), now.toISOString());
  assert.equal(page.freshness.lastReviewedAt.toISOString(), now.toISOString());
  assert.equal(page.freshness.status, 'needs_review');
  assert.deepEqual(marked, ['freshness']);
});

test('inkWikiPageReview ignores invalid clocks', () => {
  const page = { freshness: {} };
  inkWikiPageReview(page, 'not-a-date');
  assert.equal(page.lastReviewedAt, undefined);
});
