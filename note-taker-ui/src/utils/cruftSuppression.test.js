import {
  composeCruftSuppressionNotice,
  countSuppressedInCollection,
  filterReturnViewItems,
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
    expect(matchesCruftHeuristic('investing')).toBe(false);
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
