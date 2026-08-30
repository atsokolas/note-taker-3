const {
  buildDuplicateClaimPlan,
  buildDuplicatePagePlan,
  mergePageRecords,
  mergeClaimRecords,
  normalizeComparableText,
  findWriteTimeCanonicalPage
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

  test('lists duplicate claim ids for migration receipts', () => {
    expect(buildDuplicateClaimPlan([
      { claimId: 'kept', text: 'AI compute changes quickly.' },
      { claimId: 'merged-1', text: 'AI COMPUTE changes quickly!' },
      { claimId: 'other', text: 'Demand remains uncertain.' }
    ])).toEqual([{
      key: 'ai compute changes quickly',
      canonicalClaimId: 'kept',
      mergedClaimIds: ['merged-1'],
      duplicateEntryCount: 1
    }]);
  });

  test('reports repeated entries even when they share one stable claim id', () => {
    expect(buildDuplicateClaimPlan([
      { claimId: 'kept', text: 'And.' },
      { claimId: 'kept', text: 'and' }
    ])).toEqual([{
      key: 'and',
      canonicalClaimId: 'kept',
      mergedClaimIds: [],
      duplicateEntryCount: 1
    }]);
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

  test('keeps the existing case canonical during a write-time merge', () => {
    const existing = {
      _id: 'existing',
      title: 'Existing case',
      claims: [{ claimId: 'kept', text: 'Compute changes quickly.', history: [{ event: 'created' }] }],
      judgment: { currentJudgment: 'Compute changes quickly.', why: [{ reasonId: 'existing-reason', text: 'Existing reason.' }] }
    };
    const duplicate = {
      _id: 'duplicate',
      title: 'A richer but redundant page',
      plainText: 'A much richer page body that must not steal canonical identity.',
      claims: [{ claimId: 'copy', text: 'COMPUTE changes quickly!', history: [{ event: 'reaffirmed' }] }],
      judgment: { currentJudgment: 'Compute changes quickly!', why: [{ reasonId: 'new-reason', text: 'New reason.' }] }
    };

    const merged = mergePageRecords([existing, duplicate], {
      canonicalPage: existing,
      mergedAt: new Date('2026-08-30T00:00:00.000Z')
    });

    expect(merged._id).toBe('existing');
    expect(merged.claims).toHaveLength(1);
    expect(merged.claims[0].claimId).toBe('kept');
    expect(merged.claims[0].history).toHaveLength(2);
    expect(merged.judgment.why).toHaveLength(2);
    expect(merged.aiState.build.dedupeMigration).toEqual({
      mergedPageIds: ['duplicate'],
      mergedAt: '2026-08-30T00:00:00.000Z'
    });
  });

  test('does not reopen a repo wiki because a claim on it happens to match', () => {
    const repo = {
      _id: 'repo',
      pageType: 'repo',
      title: 'note-taker-3 — repo wiki',
      claims: [{ claimId: 'repo-claim', text: 'Compute keeps compounding.' }],
      externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3' } }
    };
    const held = {
      _id: 'held',
      title: 'Named compute case',
      judgment: { currentJudgment: 'Compute keeps compounding.' }
    };
    expect(findWriteTimeCanonicalPage([repo], 'COMPUTE keeps compounding!')).toBeNull();
    expect(findWriteTimeCanonicalPage([repo, held], 'COMPUTE keeps compounding!')._id).toBe('held');
  });

  test('reopens an existing hold by normalized currentJudgment, not a second copy', () => {
    const held = {
      _id: 'held',
      title: 'Named compute case',
      judgment: { currentJudgment: 'I believe AI compute is going through orders of magnitude changes.' }
    };
    expect(findWriteTimeCanonicalPage(
      [held],
      'I believe AI compute is going through orders of magnitude changes!'
    )._id).toBe('held');
  });
});
