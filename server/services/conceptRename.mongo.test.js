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
      content: '<p>Moats are not prices.</p><div data-conceptid="x" data-conceptname="moats" data-blockid="c1"></div><div data-conceptname="Moats &amp; more"></div>',
      blocks: [{ id: 'c1', type: 'concept_ref', conceptName: 'Moats' }, { id: 'p1', type: 'paragraph', text: 'Moats are not prices.' }],
      asidePieces: [{ id: 'a1', nodes: [{ type: 'conceptRef', attrs: { conceptName: 'Moats', blockId: 'a1' } }, { type: 'paragraph', content: [{ type: 'text', text: 'Moats again.' }] }] }]
    });
    const aside = await NotebookEntry.create({
      userId,
      title: 'Set aside',
      content: '<p>Only words about moats here.</p>',
      asidePieces: [{ id: 'a2', nodes: [{ type: 'conceptRef', attrs: { conceptName: 'MOATS' } }], blocks: [{ id: 'b2', type: 'concept_ref', conceptName: 'Moats' }] }]
    });
    const prose = await NotebookEntry.create({ userId, title: 'Prose', content: '<p>Moats, moats, moats.</p>', blocks: [{ id: 'p2', text: 'Moats.' }] });
    const theirs = await NotebookEntry.create({ userId: stranger, title: 'Theirs', content: '<div data-conceptname="Moats"></div>' });
    const question = await Question.create({ userId, text: 'Does the moat widen?', linkedTagName: 'Moats', conceptName: 'moats' });
    await ConceptNote.create({ userId, tagName: 'Moats', title: 'Aside' });
    await ReferenceEdge.create({ userId, sourceType: 'notebook', sourceId: notebook._id, sourceBlockId: 'c1', targetType: 'concept', targetTagName: 'moats' });
    await SharedConcept.create({ userId, conceptName: 'Moats', slug: 'moats-abc' });
    const path = await ConceptPath.create({ userId, title: 'Path', itemRefs: [{ type: 'concept', id: 'Moats', order: 0 }, { type: 'article', id: String(article._id), order: 1 }] });
    await Connection.create({ userId, fromType: 'concept', fromId: 'Moats', toType: 'article', toId: String(article._id), relationType: 'supports' });
    await ReturnQueueEntry.create({ userId, itemType: 'concept', itemId: 'Moats' });
    const others = await Article.create({ userId: stranger, url: 'https://example.com/x', title: 'X', highlights: [{ text: 'x', tags: ['Moats'] }] });

    const renamed = await renameConcept({ TagMeta, models, userId, from: 'Moats', to: '  Durable   advantage ' });
    assert.deepEqual(renamed, { name: 'Durable advantage', previousName: 'Moats', conceptId: String(concept._id), notes: 2 });

    assert.equal((await TagMeta.findById(concept._id)).name, 'Durable advantage');
    assert.deepEqual((await Article.findById(article._id)).highlights.map(h => [...h.tags]), [['Durable advantage', 'retail'], ['retail']]);
    const note = await NotebookEntry.findById(notebook._id);
    assert.deepEqual([...note.tags], ['Durable advantage']);
    assert.equal(note.blocks[0].conceptName, 'Durable advantage');
    assert.equal(note.blocks[1].text, 'Moats are not prices.', 'the words a person wrote are theirs');
    assert.equal(note.content, '<p>Moats are not prices.</p><div data-conceptid="x" data-conceptname="Durable advantage" data-blockid="c1"></div><div data-conceptname="Moats &amp; more"></div>');
    assert.equal(note.asidePieces[0].nodes[0].attrs.conceptName, 'Durable advantage');
    assert.equal(note.asidePieces[0].nodes[1].content[0].text, 'Moats again.');
    const setAside = await NotebookEntry.findById(aside._id);
    assert.equal(setAside.content, '<p>Only words about moats here.</p>');
    assert.equal(setAside.asidePieces[0].nodes[0].attrs.conceptName, 'Durable advantage');
    assert.equal(setAside.asidePieces[0].blocks[0].conceptName, 'Durable advantage');
    const untouched = await NotebookEntry.findById(prose._id);
    assert.equal(untouched.content, '<p>Moats, moats, moats.</p>', 'prose is not a mention');
    assert.equal(untouched.updatedAt.getTime(), prose.updatedAt.getTime());
    assert.equal((await NotebookEntry.findById(theirs._id)).content, '<div data-conceptname="Moats"></div>', 'another reader keeps their notes');
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

    // Only the case: a rename, not a collision with itself. A name with markup in it is written as markup.
    assert.equal((await renameConcept({ TagMeta, models, userId, from: 'Durable advantage', to: 'durable advantage' })).notes, 2);
    assert.equal((await renameConcept({ TagMeta, models, userId, from: 'durable advantage', to: 'Moats & "more"' })).notes, 2);
    assert.match((await NotebookEntry.findById(notebook._id)).content, /data-conceptname="Moats &amp; &quot;more&quot;" data-blockid/);
    assert.equal((await renameConcept({ TagMeta, models, userId, from: 'Moats & "more"', to: 'durable advantage' })).notes, 2);
    await assert.rejects(renameConcept({ TagMeta, models, userId, from: 'durable advantage', to: '   ' }), (error) => error.status === 400);
    await assert.rejects(renameConcept({ TagMeta, models, userId, from: 'Nowhere', to: 'Somewhere' }), (error) => error.status === 404);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
