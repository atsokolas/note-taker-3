import {
  diffClaimLedgerSnapshots,
  diffClaimSnapshots,
  extractClaimLedgerSnapshot,
  extractClaimTexts,
  getLastVisitState,
  recordVisit,
  __testables
} from './wikiVisitTracker';

const claimDoc = (claims) => ({
  type: 'doc',
  content: claims.map((claim) => ({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: claim.text,
      marks: claim.support === false ? [] : [{
        type: 'claim',
        attrs: { claimId: claim.id || `c-${claim.text}`, support: claim.support || 'supported', citationIndexes: claim.cites || [] }
      }]
    }]
  }))
});

describe('wikiVisitTracker', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('extractClaimTexts', () => {
    it('returns the normalized text of every span carrying a claim mark', () => {
      const doc = claimDoc([
        { text: 'Compounders need patience.' },
        { text: '  Time + reinvestment beats picking. ' }
      ]);
      expect(extractClaimTexts(doc)).toEqual([
        'compounders need patience.',
        'time + reinvestment beats picking.'
      ]);
    });

    it('skips text spans that do not carry a claim mark', () => {
      const doc = claimDoc([
        { text: 'Marked.' },
        { text: 'Unmarked.', support: false }
      ]);
      expect(extractClaimTexts(doc)).toEqual(['marked.']);
    });

    it('returns an empty array for an empty / null doc', () => {
      expect(extractClaimTexts(null)).toEqual([]);
      expect(extractClaimTexts(undefined)).toEqual([]);
      expect(extractClaimTexts({ type: 'doc', content: [] })).toEqual([]);
    });
  });

  describe('diffClaimSnapshots', () => {
    it('reports added and removed sets relative to the previous snapshot', () => {
      const result = diffClaimSnapshots(['a', 'b'], ['b', 'c']);
      expect(result.added).toEqual(['c']);
      expect(result.removed).toEqual(['a']);
    });

    it('normalizes whitespace and case so trivial edits do not register', () => {
      expect(diffClaimSnapshots(['Hello world.'], ['hello   world.'])).toEqual({ added: [], removed: [] });
    });

    it('returns empty arrays when the snapshots match', () => {
      expect(diffClaimSnapshots(['a', 'b'], ['a', 'b'])).toEqual({ added: [], removed: [] });
    });
  });

  describe('claim ledger snapshots', () => {
    it('extracts support, confidence, verification, source count, and history count', () => {
      expect(extractClaimLedgerSnapshot([{
        text: 'A sourced claim.',
        support: 'contradicted',
        confidence: 0.823,
        lastVerifiedAt: '2026-05-09T12:00:00.000Z',
        citationIds: ['c1', 'c2'],
        history: [{}, {}]
      }])).toEqual([{
        text: 'a sourced claim.',
        support: 'conflicted',
        confidence: 0.82,
        lastVerifiedAt: '2026-05-09T12:00:00.000Z',
        citationCount: 2,
        historyCount: 2
      }]);
    });

    it('reports ledger-only evidence changes without treating verification timestamp alone as a change', () => {
      const previous = [{
        text: 'a sourced claim.',
        support: 'partial',
        confidence: 0.5,
        lastVerifiedAt: '2026-05-01T00:00:00.000Z',
        citationCount: 1,
        historyCount: 1
      }];
      expect(diffClaimLedgerSnapshots(previous, [{
        text: 'A sourced claim.',
        support: 'partial',
        confidence: 0.51,
        lastVerifiedAt: '2026-05-09T00:00:00.000Z',
        citationIds: ['c1'],
        history: [{}]
      }])).toEqual([]);
      expect(diffClaimLedgerSnapshots(previous, [{
        text: 'A sourced claim.',
        support: 'supported',
        confidence: 0.82,
        citationIds: ['c1', 'c2'],
        history: [{}, {}]
      }])).toEqual([{
        text: 'a sourced claim.',
        support: 'supported',
        confidence: 0.82,
        reasons: ['support', 'confidence', 'sources', 'history']
      }]);
    });
  });

  describe('getLastVisitState', () => {
    it('returns null when there is no record for the page', () => {
      expect(getLastVisitState('wiki-1')).toBeNull();
    });

    it('returns the persisted shape when storage has a valid record', () => {
      window.localStorage.setItem(
        `${__testables.STORAGE_KEY_PREFIX}wiki-1`,
        JSON.stringify({ lastViewedAt: '2026-04-25T00:00:00Z', claimSnapshot: ['a', 'b'] })
      );
      expect(getLastVisitState('wiki-1')).toEqual({
        lastViewedAt: '2026-04-25T00:00:00Z',
        claimSnapshot: ['a', 'b'],
        ledgerSnapshot: []
      });
    });

    it('returns null when the persisted JSON is malformed', () => {
      window.localStorage.setItem(`${__testables.STORAGE_KEY_PREFIX}wiki-1`, '{not json');
      expect(getLastVisitState('wiki-1')).toBeNull();
    });
  });

  describe('recordVisit', () => {
    it('persists the current claim snapshot and a fresh timestamp', () => {
      const doc = claimDoc([{ text: 'Compounders.' }, { text: 'Patience.' }]);
      const written = recordVisit('wiki-1', doc, [{
        text: 'Compounders.',
        support: 'supported',
        confidence: 0.88,
        citationIds: ['citation-1'],
        history: [{}]
      }]);
      const stored = JSON.parse(window.localStorage.getItem(`${__testables.STORAGE_KEY_PREFIX}wiki-1`));
      expect(stored.claimSnapshot).toEqual(['compounders.', 'patience.']);
      expect(stored.ledgerSnapshot[0]).toMatchObject({
        text: 'compounders.',
        support: 'supported',
        confidence: 0.88,
        citationCount: 1,
        historyCount: 1
      });
      expect(stored.lastViewedAt).toMatch(/^\d{4}-/);
      expect(written.claimSnapshot).toEqual(['compounders.', 'patience.']);
    });

    it('returns null without throwing when the pageId is empty', () => {
      expect(recordVisit('', { type: 'doc', content: [] })).toBeNull();
    });
  });

  describe('snapshot cap', () => {
    it('caps the persisted and returned snapshot at SNAPSHOT_CAP entries', () => {
      const claims = Array.from({ length: __testables.SNAPSHOT_CAP + 25 }, (_, i) => ({ text: `claim ${i}` }));
      const written = recordVisit('wiki-1', claimDoc(claims));
      expect(written.claimSnapshot.length).toBe(__testables.SNAPSHOT_CAP);
    });
  });
});
