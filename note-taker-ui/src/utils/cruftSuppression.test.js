import {
  composeCruftSuppressionNotice,
  filterLibraryBrowseItems,
  countSuppressedInCollection,
  filterReturnViewItems,
  isSuppressedFromLibraryBrowse,
  isSuppressedFromReturnView,
  matchesCruftHeuristic
} from './cruftSuppression';

describe('cruftSuppression', () => {
  it('suppresses persisted visibility flags and archived status', () => {
    expect(isSuppressedFromReturnView({ title: 'Good thread', hiddenFromHome: true })).toBe(true);
    expect(isSuppressedFromReturnView({ title: 'Good thread', debugOnly: true })).toBe(true);
    expect(isSuppressedFromReturnView({ title: 'Good thread', archived: true })).toBe(true);
    expect(isSuppressedFromReturnView({ title: 'Good thread', status: 'archived' })).toBe(true);
  });

  it('matches known QA fixture titles', () => {
    expect(matchesCruftHeuristic('TEMP MCP RETEST 2026-06-06')).toBe(true);
    expect(matchesCruftHeuristic('Blah')).toBe(true);
    expect(matchesCruftHeuristic('TEST (8)')).toBe(true);
    expect(matchesCruftHeuristic('QA Build Order Verification 2026-06-19')).toBe(true);
    expect(matchesCruftHeuristic('QA Cia Teach Investor Behavioural Investment')).toBe(true);
    expect(matchesCruftHeuristic('QA Complementary Machine Thing')).toBe(true);
    expect(matchesCruftHeuristic('QA User Test Embedding Retry 1782083461056')).toBe(true);
    expect(matchesCruftHeuristic('QA public question: what makes a reading note durable?')).toBe(true);
    expect(matchesCruftHeuristic('Brand New Pull Test')).toBe(true);
    expect(matchesCruftHeuristic('Claim note 1780622210271')).toBe(true);
    expect(matchesCruftHeuristic('Evidence note 1780622210271')).toBe(true);
    expect(matchesCruftHeuristic('Connection Concept A 1780621533872')).toBe(true);
    expect(matchesCruftHeuristic('Idea Workbench Route 1780621569070')).toBe(true);
    expect(matchesCruftHeuristic('Retrieval A 1780622208171')).toBe(true);
    expect(matchesCruftHeuristic('investing')).toBe(false);
    expect(matchesCruftHeuristic('Quality Assurance Strategy')).toBe(false);
  });

  it('keeps hiddenFromHome articles recoverable in Library browse while still hiding debug cruft', () => {
    expect(isSuppressedFromReturnView({ title: 'Poor Charlie', hiddenFromHome: true })).toBe(true);
    expect(isSuppressedFromLibraryBrowse({ title: 'Poor Charlie', hiddenFromHome: true })).toBe(false);
    expect(isSuppressedFromLibraryBrowse({ title: 'Good thread', debugOnly: true })).toBe(true);

    const rows = [
      { title: 'Poor Charlie', hiddenFromHome: true },
      { title: 'Test' },
      { title: 'Margin of Safety' }
    ];
    expect(filterLibraryBrowseItems(rows).map((item) => item.title)).toEqual([
      'Poor Charlie',
      'Margin of Safety'
    ]);
  });

  it('filters ranked collections and composes the maintenance notice', () => {
    const items = [
      { title: 'investing' },
      { title: 'Blah' },
      { title: 'Test' },
      { title: 'Playing to Win' }
    ];
    expect(countSuppressedInCollection(items)).toBe(2);
    expect(filterReturnViewItems(items).map((item) => item.title)).toEqual([
      'investing',
      'Playing to Win'
    ]);
    expect(composeCruftSuppressionNotice(7)).toBe(
      '7 low-signal test items were kept out of your return view.'
    );
  });
});
