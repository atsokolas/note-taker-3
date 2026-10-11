const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { ConceptRenameError, renameConcept } = require('./conceptRename');

test('real Mongo: renaming a concept moves every reference to its name, and refuses a name already taken', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  try {
    await mongoose.connect(mongo.getUri());
    const models = require('../models');
    const { TagMeta, Article, NotebookEntry, Question, ConceptNote, ReferenceEdge, SharedConcept, ConceptPath, Connection, ReturnQueueEntry } = models;
    await Promise.all(Object.values(models).filter(Model => Model?.createCollection).map(Model => Model.createCollection()));
    const userId = new mongoose.Types.ObjectId();
    const stranger = new mongoose.Types.ObjectId();
    const concept = await TagMeta.create({ userId, name: 'Moats' });
    await TagMeta.create({ userId, name: 'Pricing power' });
    await TagMeta.create({ userId: stranger, name: 'Moats' });
    const article = await Article.create({
      userId,
      url: 'https://example.com/costco',
      title: 'Costco',
      highlights: [{ text: 'Renewal is the business.', tags: ['moats', 'retail'] }, { text: 'Prices stay low.', tags: ['retail'] }]
    });
    const notebook = await NotebookEntry.create({
      userId,
      title: 'Membership',
      tags: ['Moats'],
      blocks: [{ id: 'c1', type: 'concept_ref', conceptName: 'Moats' }, { id: 'p1', type: 'paragraph', text: 'Moats are not prices.' }]
    });
    const question = await Question.create({ userId, text: 'Does the moat widen?', linkedTagName: 'Moats', conceptName: 'moats' });
    await ConceptNote.create({ userId, tagName: 'Moats', title: 'Aside' });
    await ReferenceEdge.create({ userId, sourceType: 'notebook', sourceId: notebook._id, sourceBlockId: 'c1', targetType: 'concept', targetTagName: 'moats' });
    await SharedConcept.create({ userId, conceptName: 'Moats', slug: 'moats-abc' });
    const path = await ConceptPath.create({ userId, title: 'Path', itemRefs: [{ type: 'concept', id: 'Moats', order: 0 }, { type: 'article', id: String(article._id), order: 1 }] });
    await Connection.create({ userId, fromType: 'concept', fromId: 'Moats', toType: 'article', toId: String(article._id), relationType: 'supports' });
    await ReturnQueueEntry.create({ userId, itemType: 'concept', itemId: 'Moats' });
    const others = await Article.create({ userId: stranger, url: 'https://example.com/x', title: 'X', highlights: [{ text: 'x', tags: ['Moats'] }] });

    const renamed = await renameConcept({ TagMeta, models, userId, from: 'Moats', to: '  Durable   advantage ' });
    assert.deepEqual(renamed, { name: 'Durable advantage', previousName: 'Moats', conceptId: String(concept._id) });

    assert.equal((await TagMeta.findById(concept._id)).name, 'Durable advantage');
    assert.deepEqual((await Article.findById(article._id)).highlights.map(h => [...h.tags]), [['Durable advantage', 'retail'], ['retail']]);
    const note = await NotebookEntry.findById(notebook._id);
    assert.deepEqual([...note.tags], ['Durable advantage']);
    assert.equal(note.blocks[0].conceptName, 'Durable advantage');
    assert.equal(note.blocks[1].text, 'Moats are not prices.', 'the words a person wrote are theirs');
    const asked = await Question.findById(question._id);
    assert.equal(asked.linkedTagName, 'Durable advantage');
    assert.equal(asked.conceptName, 'Durable advantage');
    assert.equal((await ConceptNote.findOne({ userId })).tagName, 'Durable advantage');
    assert.equal((await ReferenceEdge.findOne({ userId })).targetTagName, 'durable advantage');
    assert.equal((await SharedConcept.findOne({ userId })).conceptName, 'Durable advantage');
    assert.deepEqual((await ConceptPath.findById(path._id)).itemRefs.map(ref => ref.id), ['Durable advantage', String(article._id)]);
    assert.equal((await Connection.findOne({ userId })).fromId, 'Durable advantage');
    assert.equal((await ReturnQueueEntry.findOne({ userId })).itemId, 'Durable advantage');
    assert.equal((await TagMeta.findOne({ userId: stranger })).name, 'Moats', 'another reader keeps their concept');
    assert.deepEqual([...(await Article.findById(others._id)).highlights[0].tags], ['Moats']);

    // Onto a concept that exists: refused, and nothing moves.
    await assert.rejects(
      renameConcept({ TagMeta, models, userId, from: 'Durable advantage', to: 'pricing POWER' }),
      (error) => error instanceof ConceptRenameError && error.status === 409 && /already have a concept called “pricing POWER”/.test(error.message)
    );
    await assert.rejects(
      renameConcept({ TagMeta, models, userId, from: 'Durable advantage', to: 'retail' }),
      (error) => error.status === 409
    );
    assert.equal((await TagMeta.findById(concept._id)).name, 'Durable advantage');

    // Only the case: a rename, not a collision with itself.
    assert.equal((await renameConcept({ TagMeta, models, userId, from: 'Durable advantage', to: 'durable advantage' })).name, 'durable advantage');
    await assert.rejects(renameConcept({ TagMeta, models, userId, from: 'durable advantage', to: '   ' }), (error) => error.status === 400);
    await assert.rejects(renameConcept({ TagMeta, models, userId, from: 'Nowhere', to: 'Somewhere' }), (error) => error.status === 404);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
