const { test } = require('node:test');
const assert = require('node:assert/strict');
const { underneathIssue } = require('./underneath');

const id = n => String(n).padStart(24, '0');
const meditations = { _id: id(1), title: 'Meditations', url: 'import://kindle/meditations', highlights: [
  { _id: id(11), text: 'The best revenge is not to be like your enemy.', createdAt: '2024-09-01T00:00:00Z', keptAt: '2025-01-01T00:00:00Z' },
  { _id: id(12), text: 'Waste no more time arguing what a good man should be.', createdAt: '2026-11-02T00:00:00Z' }
] };
const zero = { _id: id(2), title: 'Zero to One', url: 'https://example.com/zero', highlights: [{ _id: id(21), text: 'Competition is for losers.', createdAt: '2024-03-01T00:00:00Z' }] };
const munger = { _id: id(3), title: "Poor Charlie's Almanack", url: 'import://book/charlie', highlights: [{ _id: id(31), text: 'Pacifism is not free.', createdAt: '2026-11-23T00:00:00Z' }] };
const cs183 = { _id: id(4), title: "Peter Thiel's CS183, class 11", url: 'https://example.com/cs183', highlights: [] };
const met = (source, mark, relation = 'bears', says = '') => ({ about: `${source._id}>highlight:${mark}`, relation, says, createdAt: '2026-11-24T00:00:00Z' });

test('an issue from underneath: old marks that came back, the thread that formed, and what collided most', () => {
  const issue = underneathIssue({
    month: '2026-11',
    articles: [meditations, zero, munger, cs183],
    judgments: [
      met(munger, id(11), 'argues', 'Munger says deterrence costs; Aurelius says not to become the enemy.'),
      met(cs183, id(11)),
      met(cs183, id(21)),
      met(cs183, id(12)),
      { about: `${cs183._id}>wiki_page:${id(9)}`, relation: 'bears', createdAt: '2026-11-24T00:00:00Z' }
    ],
    threads: [
      { _id: id(7), answer: null, marks: [{ articleId: zero._id, highlightId: id(21) }, { articleId: munger._id, highlightId: id(31) }] },
      { _id: id(8), answer: 'not a thing', marks: [{ articleId: zero._id, highlightId: id(21) }, { articleId: munger._id, highlightId: id(31) }] }
    ]
  });
  assert.deepEqual(issue.cameBack.map(({ source, old }) => [source.title, old.title]), [
    ["Poor Charlie's Almanack", 'Meditations'], ["Peter Thiel's CS183, class 11", 'Meditations'], ["Peter Thiel's CS183, class 11", 'Zero to One']
  ], 'a mark made this month is not old, and a page is not a mark');
  assert.equal(issue.cameBack[0].says, 'Munger says deterrence costs; Aurelius says not to become the enemy.');
  assert.deepEqual([issue.cameBack[0].old.book, issue.cameBack[0].old.kept, issue.cameBack[2].old.kept], [true, true, false]);
  assert.deepEqual(issue.collided.map(old => [old.title, old.times]), [['Meditations', 2]], 'only what came back more than once collided');
  assert.deepEqual(issue.formed.map(thread => thread.threadId), [id(7)], 'a thread you turned away is not in the issue');
});

test('a month with nothing came back and nothing formed has no issue', () => {
  assert.equal(underneathIssue({ month: '2026-10', articles: [meditations], judgments: [], threads: [] }), null);
});
