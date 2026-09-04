const mongoose = require('mongoose');
const { buildMaintenanceCitations } = require('./wikiMaintenanceCitations');
const { __testables: { buildClaimLedger } } = require('./wikiMaintenanceService');

describe('maintenance evidence identity', () => {
  const source = { _id: new mongoose.Types.ObjectId(), type: 'external',
    objectId: new mongoose.Types.ObjectId(), title: 'Repository evidence',
    snippet: 'The queue persists jobs.', url: 'https://example.com/source', addedBy: 'ai' };
  const firstAt = new Date('2026-01-01');
  const initial = () => buildMaintenanceCitations({ sourceRefs: [source], now: firstAt })
    .map(citation => ({ ...citation, _id: new mongoose.Types.ObjectId() }));

  test('thirty identical maintenance passes do not grow claim history', () => {
    let citations = initial();
    const id = String(citations[0]._id);
    let claims = [];
    for (let i = 0; i < 30; i += 1) {
      citations = buildMaintenanceCitations({ sourceRefs: [source], previousCitations: citations });
      claims = buildClaimLedger({ claims: [{ claimId: 'queue', text: source.snippet,
        support: 'supported', citationIds: [citations[0]._id], sourceRefIds: [source._id] }],
      previousClaims: claims });
    }
    expect(String(citations[0]._id)).toBe(id);
    expect(citations[0].createdAt).toEqual(firstAt);
    expect(claims[0].history).toHaveLength(1);
  });

  test.each(['_id', 'objectId', 'type', 'title', 'snippet', 'url', 'addedBy'])('changed %s cannot reuse the citation', field => {
    const changed = { ...source, [field]: field.endsWith('Id') || field === '_id'
      ? new mongoose.Types.ObjectId() : 'changed' };
    expect(buildMaintenanceCitations({ sourceRefs: [changed], previousCitations: initial() })[0]._id).toBeUndefined();
  });

  test('reordering sources preserves exact bindings without modifying prior records', () => {
    const previous = initial();
    const other = { ...source, _id: new mongoose.Types.ObjectId() };
    const before = JSON.stringify(previous);
    const next = buildMaintenanceCitations({ sourceRefs: [other, source], previousCitations: previous });
    expect(next[0]._id).toBeUndefined();
    expect(next[1]._id).toEqual(previous[0]._id);
    expect(JSON.stringify(previous)).toBe(before);
  });
});
