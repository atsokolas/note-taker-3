import {
  collectionSearchHaystack,
  collectionSearchHit,
  filterCollectionPages,
  pageMatchesCollectionQuery,
  pendingWikiProposal
} from './wikiCollectionModel';

const page = (overrides = {}) => ({
  _id: 'page-1',
  title: 'Strategy is a set of choices',
  summary: 'A useful strategy makes choices explicit enough to guide action.',
  plainText: 'A strategy is only real when it closes off alternatives.',
  pageType: 'topic',
  updatedAt: '2026-09-09T12:00:00.000Z',
  qualityReview: { status: 'ok', surfaceEligible: true, reasons: [] },
  aiState: { candidateStatus: 'idle', lastCandidateSummary: '' },
  ...overrides
});

describe('wikiCollectionModel', () => {
  it('searches current title, dek, and body — not candidates or private reasons', () => {
    const candidateOnly = page({
      title: 'Quiet page',
      summary: 'Current accepted dek.',
      plainText: 'Current accepted sentence.',
      aiState: {
        candidateStatus: 'awaiting_maintenance_acceptance',
        lastCandidateSummary: 'UNIQUE_CANDIDATE_PHRASE about an experiment.'
      },
      qualityReview: {
        status: 'needs_review',
        surfaceEligible: true,
        reasons: [{ message: 'PRIVATE_REVIEW_REASON that a steward wrote.' }]
      },
      privateReason: 'I accepted this because UNIQUE_PRIVATE_REASON.'
    });

    expect(collectionSearchHaystack(candidateOnly)).toBe(
      'Quiet page\nCurrent accepted dek.\nCurrent accepted sentence.'
    );
    expect(pageMatchesCollectionQuery(candidateOnly, 'UNIQUE_CANDIDATE_PHRASE')).toBe(false);
    expect(pageMatchesCollectionQuery(candidateOnly, 'PRIVATE_REVIEW_REASON')).toBe(false);
    expect(pageMatchesCollectionQuery(candidateOnly, 'UNIQUE_PRIVATE_REASON')).toBe(false);
    expect(pageMatchesCollectionQuery(candidateOnly, 'accepted sentence')).toBe(true);
    expect(filterCollectionPages({
      pages: [candidateOnly],
      query: 'UNIQUE_CANDIDATE_PHRASE'
    })).toEqual([]);
  });

  it('keeps proposed pages out of the default collection while leaving them in the proposed scope', () => {
    const current = page();
    const blocked = page({
      _id: 'blocked',
      title: 'Blocked draft',
      qualityReview: { status: 'needs_review', severity: 'blocked', surfaceEligible: false }
    });
    const awaiting = page({
      _id: 'awaiting',
      title: 'Page with a candidate',
      aiState: { candidateStatus: 'awaiting_first_head_acceptance' }
    });

    expect(filterCollectionPages({ pages: [current, blocked, awaiting], scope: 'all' }).map(collectionPage => collectionPage._id))
      .toEqual(['page-1', 'awaiting']);
    expect(filterCollectionPages({ pages: [current, blocked, awaiting], scope: 'proposed' }).map(collectionPage => collectionPage._id))
      .toEqual(['awaiting']);
    expect(pendingWikiProposal(awaiting)).toBe(true);
    expect(pendingWikiProposal(current)).toBe(false);
  });

  it('returns a current-page excerpt for a body hit and stays silent when the title already matched', () => {
    expect(collectionSearchHit(page(), 'closes off')).toMatch(/strategy is only real/i);
    expect(collectionSearchHit(page(), 'Strategy')).toBe('');
  });
});
