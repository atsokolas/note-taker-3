import {
  buildConceptChangeDraft,
  computeConceptFreshness,
  mergeConceptChangeDrafts
} from './conceptChangeDrafts';

describe('conceptChangeDrafts', () => {
  it('builds a support draft with concept-facing summary', () => {
    const draft = buildConceptChangeDraft({
      kind: 'support',
      cards: [
        { id: 'c1', sourceKey: 'highlight:1', title: 'Support A', zone: 'workspace' },
        { id: 'c2', sourceKey: 'highlight:2', title: 'Support B', zone: 'workspace' }
      ]
    });

    expect(draft.title).toBe('Support pull prepared');
    expect(draft.summary).toBe('Support A looks like the clearest footing. 2 supports are ready to attach.');
    expect(draft.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ zone: 'supports' })
    ]));
    expect(draft.signature).toBe('highlight:1|highlight:2');
  });

  it('dedupes change drafts by kind and signature', () => {
    const first = { id: 'one', kind: 'support', signature: 'same' };
    const second = { id: 'two', kind: 'support', signature: 'same' };

    expect(mergeConceptChangeDrafts([first], [second])).toEqual([second]);
  });

  it('marks concepts stale when newer unseen library material exists', () => {
    const freshness = computeConceptFreshness({
      materialLibrary: [
        { sourceKey: 'article:1', title: 'Fresh article', createdAt: '2026-04-10T12:00:00.000Z' },
        { sourceKey: 'article:2', title: 'Already used', createdAt: '2026-04-09T12:00:00.000Z' }
      ],
      importedSourceKeys: ['article:2'],
      lastReviewedAt: '2026-04-09T00:00:00.000Z'
    });

    expect(freshness.isStale).toBe(true);
    expect(freshness.unreviewedCount).toBe(1);
    expect(freshness.summary).toBe('1 newer source landed after the last review.');
    expect(freshness.preview).toEqual(['Fresh article']);
  });
});
