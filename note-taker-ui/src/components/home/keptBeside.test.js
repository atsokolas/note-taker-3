import { keptBeside } from './homeModel';

const kept = [
  { kind: 'mark', articleId: 'a1', highlightId: 'h1', title: 'High Output Management', text: 'A meeting is the medium of managerial work.' },
  { kind: 'source', articleId: 'a2', title: 'Pricing power and moats' },
  { kind: 'thread', threadId: 't1', title: 'A thread through Pricing and Meetings', text: 'Retaliate once, then forgive. Punish defection quickly.', marks: 2 }
];

it('offers what you keep when it shares two words with what you are writing, and nothing below that', () => {
  const beside = keptBeside(kept, 'Fix the weekly managerial meeting');
  expect(beside.map(held => held.highlightId || held.articleId)).toEqual(['h1']);
  expect(beside[0].path).toContain('h1');
  expect(keptBeside(kept, 'Pricing page')).toEqual([]);
  expect(keptBeside(kept, 'Moats and pricing review').map(held => held.articleId)).toEqual(['a2']);
});

it('finds a kept thread by what its passages say, never by the books its title names', () => {
  expect(keptBeside(kept, 'Pricing meetings')).toEqual([]);
  expect(keptBeside(kept, 'Should we forgive a supplier once, or retaliate?').map(held => held.threadId)).toEqual(['t1']);
});
