const {
  buildDuplicatePagePlan,
  mergePageRecords,
  mergeClaimRecords,
  normalizeComparableText
} = require('./wikiDedupeService');

describe('wikiDedupeService', () => {
  test('normalizes claim case, whitespace, and punctuation', () => {
    expect(normalizeComparableText(' AI compute — changes! ')).toBe('ai compute changes');
  });

  test('merges claim evidence and history without losing the stable claim id', () => {
    const merged = mergeClaimRecords([
      { claimId: 'kept', text: 'A claim.', sourceRefIds: ['a'], history: [{ at: '2026-01-01', event: 'created' }] },
      { claimId: 'copy', text: 'a CLAIM!', sourceRefIds: ['b'], history: [{ at: '2026-02-01', event: 'reaffirmed' }] }
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].claimId).toBe('kept');
    expect(merged[0].sourceRefIds).toEqual(['a', 'b']);
    expect(merged[0].history).toHaveLength(2);
  });

  test('chooses the richest page and lists every duplicate id', () => {
    const plan = buildDuplicatePagePlan([
      { _id: 'thin', title: 'Compound Interest', plainText: 'Short' },
      { _id: 'rich', title: 'compound interest!', plainText: 'Long body', sourceRefs: [{ _id: 's1' }] }
    ]);
    expect(plan).toMatchObject([{ canonicalId: 'rich', duplicateIds: ['thin'] }]);
  });

  test('merges page evidence and judgment history into the richest copy', () => {
    const merged = mergePageRecords([
      {
        _id: 'kept',
        title: 'AI compute',
        plainText: 'The richer accepted page body.',
        sourceRefs: [{ _id: 'source-a' }],
        judgment: { currentJudgment: 'Compute changes quickly.', why: [{ reasonId: 'why-a', text: 'Reason A.' }] }
      },
      {
        _id: 'copy',
        title: 'AI compute',
        sourceRefs: [{ _id: 'source-b' }],
        judgment: { currentJudgment: 'Compute changes quickly!', why: [{ reasonId: 'why-b', text: 'Reason B.' }] }
      }
    ]);
    expect(merged.sourceRefs.map(source => String(source._id))).toEqual(['source-a', 'source-b']);
    expect(merged.judgment.why).toHaveLength(2);
    expect(merged.aiState.build.dedupeMigration.mergedPageIds).toEqual(['copy']);
  });
});
