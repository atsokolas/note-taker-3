// Traverse BSON on the server: transfer references, never private document bodies.
// Terminal job links retain their identities without retaining obsolete snapshots.
const referenceProjection = (name) => {
  const pipeline = [];
  if (name === 'wikimaintenanceruns') pipeline.push({ $match: { status: { $nin: ['completed', 'failed'] } } });
  if (name === 'wikisourceevents') pipeline.push({ $match: { status: { $nin: ['processed', 'ignored', 'failed'] } } });
  pipeline.push({ $unset: name === 'wikirevisions' ? ['_id', 'before', 'after', 'snapshotHistoryArchive'] : '_id' });
  pipeline.push({ $project: { pending: ['$$ROOT'], refs: { $literal: [] } } });
  const isContainer = value => ({ $in: [{ $type: value }, ['object', 'array']] });
  for (let depth = 0; depth < 20; depth++) {
    pipeline.push({ $set: { values: { $reduce: {
      input: '$pending', initialValue: [], in: { $concatArrays: ['$$value', {
        $cond: [
          { $isArray: '$$this' }, '$$this',
          { $map: { input: { $objectToArray: '$$this' }, as: 'field', in: '$$field.v' } }
        ]
      }] }
    } } } });
    pipeline.push({ $set: {
      pending: { $filter: { input: '$values', as: 'value', cond: isContainer('$$value') } },
      refs: { $concatArrays: ['$refs', { $reduce: {
        input: { $filter: {
          input: '$values', as: 'value', cond: { $in: [{ $type: '$$value' }, ['string', 'objectId']] }
        } },
        initialValue: [], in: { $concatArrays: ['$$value', { $map: {
          input: { $regexFindAll: { input: { $toString: '$$this' }, regex: '[a-f0-9]{24}', options: 'i' } },
          as: 'match', in: { $toLower: '$$match.match' }
        } }] }
      } }] }
    } });
  }
  pipeline.push({ $project: { _id: 0, refs: { $setUnion: ['$refs', []] }, unresolved: { $size: '$pending' } } });
  pipeline.push({ $unwind: { path: '$refs', preserveNullAndEmptyArrays: true } });
  pipeline.push({ $group: { _id: '$refs', unresolved: { $max: '$unresolved' } } });
  pipeline.push({ $project: { _id: 0, ref: '$_id', unresolved: 1 } });
  return pipeline;
};

const readRetentionReferences = async (db) => {
  const ids = new Set();
  for (const { name, type } of await db.listCollections().toArray()) {
    if (type !== 'collection' || name.startsWith('system.') || name === 'wikistoragestate') continue;
    for (let attempt = 0; ; attempt++) {
      try {
        for await (const row of db.collection(name).aggregate(referenceProjection(name), { batchSize: 1000, maxTimeMS: 60000 })) {
          if (row.unresolved) throw new Error(`Incomplete Wiki retention reference scan: ${name}`);
          if (row.ref) ids.add(row.ref);
        }
        break;
      } catch (error) {
        const transient = /Network|Timeout/.test(error.name) || ['ETIMEDOUT', 'ECONNRESET'].includes(error.code);
        if (!transient || attempt >= 2) throw error;
      }
    }
  }
  return ids;
};

module.exports = { referenceProjection, readRetentionReferences };
