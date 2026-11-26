const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { moveDatabase } = require('./move_database');

/* Two real deployments: everything on the first arrives on the second with
   its indexes, a dry run writes nothing, a source still taking writes is
   refused, and so is a target holding data. */
test('real Mongo: the move copies every document and index, and never into live data', async () => {
  const [one, two] = await Promise.all([MongoMemoryServer.create(), MongoMemoryServer.create()]);
  const source = await MongoClient.connect(one.getUri());
  const target = await MongoClient.connect(two.getUri());
  const log = () => {};
  try {
    const articles = source.db('test').collection('articles');
    await articles.insertMany(Array.from({ length: 2500 }, (_, i) => ({ _id: new ObjectId(), title: `Piece ${i}`, userId: 'u1', at: new Date(i) })));
    await articles.createIndex({ userId: 1, at: -1 }, { name: 'by_reader' });
    await source.db('test').collection('vectoritems').insertOne({ userId: 'u1', embedding: [0.1, 0.2] });

    await moveDatabase({ source, target, log });
    assert.equal(await target.db('test').collection('articles').estimatedDocumentCount(), 0, 'a dry run writes nothing');

    await assert.rejects(moveDatabase({ source, target, apply: true, log }), /still accepts writes/);
    assert.equal(await source.db().listCollections({ name: 'move_database_probe' }).toArray().then(rows => rows.length), 0, 'the probe leaves nothing behind');

    const landed = await moveDatabase({ source, target, apply: true, requireFreeze: false, log });
    assert.deepEqual(landed['test.articles'], { count: 2500, arrived: 2500 });
    assert.deepEqual(landed['test.vectoritems'], { count: 1, arrived: 1 });
    const copy = await target.db('test').collection('articles').findOne({ title: 'Piece 7' });
    assert.ok(copy.at instanceof Date, 'types survive the move');
    const names = (await target.db('test').collection('articles').listIndexes().toArray()).map(index => index.name);
    assert.ok(names.includes('by_reader'));

    await assert.rejects(moveDatabase({ source, target, apply: true, requireFreeze: false, log }), /refusing to copy into it/);
  } finally {
    await Promise.all([source.close(), target.close()]);
    await Promise.all([one.stop(), two.stop()]);
  }
});
