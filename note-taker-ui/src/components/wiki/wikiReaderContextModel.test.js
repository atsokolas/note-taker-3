import {
  candidateFootprint,
  changedClaimIdsFromPages,
  changedClaimIdsFromVisit,
  compareWikiPages,
  historicalRevisionSnapshot,
  popReaderPanel,
  pushReaderPanel,
  sourceArticleId,
  sourceSurrounding,
  surroundingFromLibrarySource,
  surroundingFromSource
} from './wikiReaderContextModel';
import { collectWikiText } from './wikiPageMetrics';

describe('wikiReaderContextModel', () => {
  it('nests inspect panels and returns to the previous view', () => {
    const stacked = pushReaderPanel([], { type: 'evidence', block: 's2' });
    const nested = pushReaderPanel(stacked, { type: 'source', source: 'choices' });
    expect(popReaderPanel(nested)).toEqual({
      panel: { type: 'evidence', block: 's2' },
      trail: [{ type: 'evidence', block: 's2' }]
    });
    expect(popReaderPanel([{ type: 'source' }])).toEqual({ panel: null, trail: [] });
  });

  it('keeps surrounding source text optional and does not invent it', () => {
    expect(sourceSurrounding({ excerpt: 'The cited sentence.' })).toEqual({
      excerpt: 'The cited sentence.',
      aroundBefore: '',
      aroundAfter: '',
      canExpand: false
    });
    expect(sourceSurrounding({
      excerpt: 'The cited sentence.',
      aroundBefore: 'A prior sentence.',
      aroundAfter: 'A following sentence.'
    }).canExpand).toBe(true);
    expect(surroundingFromSource({
      snippet: 'The cited sentence.',
      aroundBefore: 'A prior sentence.'
    })).toMatchObject({ excerpt: 'The cited sentence.', canExpand: true });
  });

  it('slices surrounding from the owned article and stays silent when the line is missing', () => {
    const source = {
      type: 'highlight',
      objectId: 'highlight-1',
      parentObjectId: 'article-1',
      snippet: 'A wrong turn you can walk back from still teaches the map.'
    };
    const article = {
      content: '<p>Getting lost was part of the work. A wrong turn you can walk back from still teaches the map. That is a different kind of care.</p>'
    };
    const around = surroundingFromLibrarySource({
      source,
      article,
      highlight: { _id: 'highlight-1', text: source.snippet }
    });
    expect(around.excerpt).toBe(source.snippet);
    expect(around.canExpand).toBe(true);
    expect(around.aroundBefore).toContain('Getting lost');
    expect(around.aroundAfter).toContain('different kind of care');
    expect(sourceArticleId(source)).toBe('article-1');
    expect(surroundingFromLibrarySource({
      source: { snippet: 'A similar-sounding neighbor was not attached.' },
      article,
      highlight: { text: 'A similar-sounding neighbor was not attached.' }
    })).toMatchObject({
      excerpt: 'A similar-sounding neighbor was not attached.',
      aroundBefore: '',
      aroundAfter: '',
      canExpand: false
    });
  });

  it('marks only claim ids that actually changed', () => {
    const current = {
      claims: [
        { claimId: 'stable', text: 'Unchanged sentence.', citationIds: ['a'] },
        { claimId: 'moved', text: 'Old wording.', citationIds: ['a'] }
      ]
    };
    const next = {
      claims: [
        { claimId: 'stable', text: 'Unchanged sentence.', citationIds: ['a'] },
        { claimId: 'moved', text: 'New wording.', citationIds: ['a'] }
      ]
    };
    expect(changedClaimIdsFromPages(current, next)).toEqual(['moved']);
    expect(changedClaimIdsFromVisit({
      page: {
        claims: [
          { claimId: 'claim-1', text: 'Memory compounds with review.' },
          { claimId: 'claim-stable', text: 'Still here.' }
        ]
      },
      added: ['memory compounds with review.']
    })).toEqual(['claim-1']);
    expect(changedClaimIdsFromVisit({ page: current, added: [], changed: [] })).toEqual([]);
  });

  it('describes the whole candidate against the current page without mixing the two', () => {
    const current = {
      claims: [{ claimId: 's2', text: 'Close alternatives.', citationIds: ['a'] }],
      sourceRefs: [{ _id: 'a', title: 'Choices' }],
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Close alternatives.' }] }] }
    };
    const candidate = {
      claims: [{ claimId: 's2', text: 'Bound the experiment.', citationIds: ['a', 'b'] }],
      sourceRefs: [{ _id: 'a', title: 'Choices' }, { _id: 'b', title: 'Experiments' }],
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bound the experiment.' }] }] }
    };
    const footprint = candidateFootprint({ current, candidate });
    expect(footprint.changedCount).toBe(1);
    expect(footprint.addedSourceCount).toBe(1);
    expect(footprint.changes[0].kind).toBe('Reworded passage');
    expect(compareWikiPages(current, current)).toEqual([]);
  });

  it('reads a retained historical snapshot and refuses to invent one', () => {
    expect(historicalRevisionSnapshot(null)).toBeNull();
    expect(historicalRevisionSnapshot({ reason: 'edit' })).toBeNull();
    expect(historicalRevisionSnapshot({
      after: { title: 'Earlier page', plainText: 'The earlier words.' },
      createdAt: '2026-09-03T00:00:00.000Z',
      _id: 'rev-2'
    })).toMatchObject({
      plainText: 'The earlier words.',
      retained: 'after',
      rev: 'rev-2'
    });
  });

  it('keeps the retained body when the list only supplies after.claims', () => {
    const snapshot = historicalRevisionSnapshot({
      _id: 'rev-list',
      createdAt: '2026-09-16T00:00:00.000Z',
      after: { claims: [{ claimId: 's2', text: 'A later sentence.' }] },
      before: {
        title: 'Strategy is a set of choices',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'UNIQUE_HISTORICAL_SENTENCE from a retained revision.' }] }]
        },
        claims: [{ claimId: 's2', text: 'The earlier words.' }]
      }
    });
    expect(snapshot).not.toBeNull();
    expect(collectWikiText(snapshot.body)).toBe('UNIQUE_HISTORICAL_SENTENCE from a retained revision.');
    expect(snapshot.retained).toBe('before');
    expect(snapshot.rev).not.toBe('rev-list');
    expect(historicalRevisionSnapshot({
      after: { claims: [{ claimId: 's2', text: 'A later sentence.' }] }
    })).toBeNull();
  });

  it('identifies this revision only when the after snapshot actually has the article', () => {
    const afterSnapshot = historicalRevisionSnapshot({
      _id: 'rev-2',
      createdAt: '2026-09-03T00:00:00.000Z',
      after: {
        title: 'Strategy is a set of choices',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The later words.' }] }]
        }
      },
      before: {
        title: 'Strategy is a set of choices',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The earlier words.' }] }]
        }
      }
    });
    expect(afterSnapshot.retained).toBe('after');
    expect(afterSnapshot.rev).toBe('rev-2');
    expect(collectWikiText(afterSnapshot.body)).toBe('The later words.');
  });
});
