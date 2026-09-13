const assert = require('node:assert/strict');
const { buildWikiRevisionRetentionPlan } = require('./wikiRevisionRetentionService');
const { resolveRevisionSnapshot } = require('./wikiRevisionService');
const now = new Date('2026-09-13T12:00:00Z');
const row = (id, days, fields = {}) => ({
  _id: id, pageId: 'page', actorType: 'agent', reason: 'agent_maintenance',
  createdAt: new Date(now.getTime() - days * 86400000), after: { plainText: id }, ...fields
});
const retained = [row('human', 50, { actorType: 'user' }), row('unknown', 40, { actorType: undefined }),
  row('human-reason', 39, { reason: 'user_edit' }), row('proof', 38),
  row('active-a', 35, { promotionStatus: 'candidate', claimReview: { scope: 'claim', state: 'pending' } }),
  row('active-b', 34, { promotionStatus: 'candidate', claimReview: { scope: 'claim', state: 'pending' } }),
  row('review', 33, { claimReview: { version: 1, state: 'accepted' } }),
  row('base', 32), row('unchanged-proof', 31, { snapshotUnchanged: true, after: null }),
  row('hour-old', 1 / 24), row('day-old', 1)];
const history = [...retained, ...Array.from({ length: 28 }, (_, i) => row(`auto-${i}`, 2 + i))];
const plan = buildWikiRevisionRetentionPlan({ revisions: history, automaticExpiry: true, now, recentLimit: 3,
  protectedRevisionIds: ['proof', 'unchanged-proof'] });
for (const item of retained) assert(plan.keptIds.includes(item._id), item._id);
assert(plan.deletedIds.includes('auto-27'), 'old original/monthly automatic payloads expire');
assert(plan.keptIds.includes('auto-0'), 'third full payload survives');
const pruned = history.map(item => plan.deletedIds.includes(item._id) ? { ...item, after: null, snapshotPrunedAt: now } : item);
assert.equal(resolveRevisionSnapshot(pruned.find(item => item._id === 'unchanged-proof'), pruned).plainText, 'base');
assert.equal(resolveRevisionSnapshot(pruned.find(item => item._id === 'auto-27'), pruned), null);
// Several weeks of daily changes retain bounded automatic full bodies; IDs remain.
let weeks = [];
for (let day = 0; day < 42; day++) {
  const at = new Date(now.getTime() + day * 86400000);
  for (let run = 0; run < 6; run++) weeks.push(row(`day-${day}-${run}`, 0, { createdAt: new Date(at.getTime() + run * 1000) }));
  const daily = buildWikiRevisionRetentionPlan({ revisions: weeks, automaticExpiry: true, now: at, recentLimit: 3 });
  weeks = weeks.map(item => daily.deletedIds.includes(item._id) ? { ...item, after: null, snapshotPrunedAt: at } : item);
  assert(weeks.filter(item => item.after).length <= 12, 'only current and boundary-day bodies remain');
}
assert.equal(weeks.length, 252, 'chronology is never deleted');
console.log('automatic retention: human/proof/active dependencies and six weeks of bounded growth passed');
