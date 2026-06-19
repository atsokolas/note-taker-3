const { classifyWikiPageQuality } = require('./wikiPageQualityGuard');

describe('wikiPageQualityGuard', () => {
  it('blocks known malformed QA fixture titles from surface retrieval', () => {
    const review = classifyWikiPageQuality({
      title: 'Complementary Machine Thing',
      plainText: 'Machine assistance can extend human judgment when citations and review stay visible.'
    });

    expect(review.surfaceEligible).toBe(false);
    expect(review.reasons.map(reason => reason.code)).toContain('known_qa_junk_title');
  });

  it('does not block legitimate titles containing the word things', () => {
    const review = classifyWikiPageQuality({
      title: 'Internet of Things Security',
      plainText: 'Connected device security depends on patch cadence, network boundaries, and hardware trust roots.',
      sourceRefs: [{ type: 'article', title: 'Device Security' }]
    });

    expect(review.surfaceEligible).toBe(true);
    expect(review.status).toBe('ok');
  });

  it('marks sparse unsourced pages for owner review without hiding them', () => {
    const review = classifyWikiPageQuality({
      title: 'Sparse Legitimate Draft',
      plainText: ''
    });

    expect(review.surfaceEligible).toBe(true);
    expect(review.status).toBe('needs_review');
    expect(review.reasons.map(reason => reason.code)).toContain('empty_body');
  });
});
