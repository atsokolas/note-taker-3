import { buildQualityState } from './wikiQuality';

const goodPage = (overrides = {}) => ({
  _id: 'wiki-1',
  title: 'Investing',
  sourceRefs: [{ _id: 'source-1' }],
  claims: [
    { claimId: 'claim-1', support: 'supported' },
    { claimId: 'claim-2', support: 'supported' }
  ],
  aiState: {
    draftStatus: 'ready',
    health: {
      newItems: [],
      unsupportedClaims: [],
      missingCitations: [],
      staleSections: [],
      contradictions: []
    }
  },
  ...overrides
});

describe('wikiQuality', () => {
  it('classifies explicit structural failures as Needs rebuild', () => {
    const state = buildQualityState({
      page: goodPage({
        aiState: {
          ...goodPage().aiState,
          quality: {
            status: 'needs_rebuild',
            failures: ['Article contains instructional scaffold.']
          }
        }
      })
    });

    expect(state).toMatchObject({
      title: 'Needs rebuild',
      severity: 'rebuild'
    });
    expect(state.reasons).toContain('Article contains instructional scaffold.');
  });

  it('classifies weak evidence as Needs review', () => {
    const state = buildQualityState({
      page: goodPage({
        aiState: {
          ...goodPage().aiState,
          health: {
            ...goodPage().aiState.health,
            unsupportedClaims: [{ text: 'Claim needs source support.' }]
          }
        }
      })
    });

    expect(state).toMatchObject({
      title: 'Needs review',
      severity: 'review'
    });
    expect(state.summary).toMatch(/weak claims or citation gaps/i);
  });

  it('derives Needs review from claim support when precomputed counts are absent', () => {
    const state = buildQualityState({
      page: goodPage({
        claims: [
          { claimId: 'claim-1', support: 'supported' },
          { claimId: 'claim-2', support: 'unsupported' }
        ]
      })
    });

    expect(state).toMatchObject({
      title: 'Needs review',
      severity: 'review',
      weakClaimCount: 1
    });
  });

  it('classifies useful pages with only pending source signals as Drifting', () => {
    const state = buildQualityState({
      page: goodPage({
        aiState: {
          ...goodPage().aiState,
          health: {
            ...goodPage().aiState.health,
            newItems: [{ text: 'New source may extend the page.' }],
            staleSections: [{ text: 'Implications should be refreshed.' }]
          }
        }
      }),
      counts: { supported: 2, partial: 0, unsupported: 0, conflicted: 0 }
    });

    expect(state).toMatchObject({
      title: 'Drifting',
      severity: 'drift'
    });
    expect(state.summary).toMatch(/article is usable/i);
    expect(state.reasons).toEqual([
      'New source may extend the page.',
      'Implications should be refreshed.'
    ]);
  });

  it('returns no label for pages without quality or drift signals', () => {
    expect(buildQualityState({
      page: goodPage(),
      counts: { supported: 2, partial: 0, unsupported: 0, conflicted: 0 }
    })).toBeNull();
  });
});
