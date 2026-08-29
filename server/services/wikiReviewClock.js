/**
 * Human acceptance is the boundary between a proposal and maintained knowledge.
 * When that boundary is crossed, the living index needs a quiet date — not a
 * toast, not a badge that work is ready.
 */
const plain = (value) => (
  value && typeof value.toObject === 'function' ? value.toObject() : (value || {})
);

const inkWikiPageReview = (page, now = new Date()) => {
  if (!page) return page;
  const at = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(at.getTime())) return page;
  page.lastReviewedAt = at;
  page.freshness = {
    ...plain(page.freshness),
    lastReviewedAt: at
  };
  page.markModified?.('freshness');
  return page;
};

module.exports = { inkWikiPageReview };
