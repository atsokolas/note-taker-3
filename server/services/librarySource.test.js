const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { canonicalSourceUrl, linkPageSources } = require('./librarySource');
const { attachSourceEventEvidence } = require('./wikiMaintenanceOrchestrator');
const backfill = require('../../scripts/link_wiki_sources_to_library');

const id = () => new mongoose.Types.ObjectId();

async function run() {
  assert.equal(canonicalSourceUrl('https://www.Example.com/piece/?utm_source=x&b=2&a=1#top'), 'example.com/piece?a=1&b=2');
  assert.equal(canonicalSourceUrl('http://example.com/piece'), canonicalSourceUrl('https://www.example.com/piece/'));
  assert.notEqual(canonicalSourceUrl('https://example.com/piece?id=1'), canonicalSourceUrl('https://example.com/piece?id=2'));
  assert.equal(canonicalSourceUrl(''), '');

  // An in-memory server: never the application's URI.
  const memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri());
  try {
    const { Article, WikiPage, WikiSourceEvent } = require('../models');
    const userId = id();
    const article = await Article.create({
      userId,
      url: 'https://www.example.com/buffett-intrinsic-value/',
      title: 'Buffett on intrinsic value',
      content: '<p>Intrinsic value is an estimate.</p>',
      highlights: [{ text: 'Intrinsic value is an estimate.' }]
    });
    const highlightId = article.highlights[0]._id;
    const someoneElses = await Article.create({ userId: id(), url: 'https://example.com/elsewhere', title: 'Not yours' });

    // The two shapes older event processing wrote: the event's id where the piece's should be.
    const articleEvent = await WikiSourceEvent.create({ userId, sourceType: 'article', sourceObjectId: article._id, url: article.url });
    const highlightEvent = await WikiSourceEvent.create({
      userId, sourceType: 'highlight', sourceObjectId: highlightId, parentObjectId: article._id
    });
    const updatedAt = new Date('2026-01-01T00:00:00.000Z');
    const stored = await WikiPage.collection.insertOne({
      userId,
      title: 'Intrinsic value',
      slug: 'intrinsic-value',
      updatedAt,
      sourceRefs: [
        { _id: id(), type: 'article', objectId: articleEvent._id, url: article.url, metadata: { route: 'save-article' } },
        { _id: id(), type: 'highlight', objectId: highlightEvent._id },
        { _id: id(), type: 'external', url: 'http://example.com/buffett-intrinsic-value?utm_source=mail', snippet: 'Intrinsic value is an estimate.' },
        { _id: id(), type: 'highlight', objectId: highlightId },
        { _id: id(), type: 'external', url: 'https://example.com/elsewhere' },
        { _id: id(), type: 'article', objectId: article._id }
      ]
    });
    const page = await WikiPage.findById(stored.insertedId).lean();
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, WikiPage, page }), 4);

    const [fromArticleEvent, fromHighlightEvent, web, orphan, unsaved, direct] = page.sourceRefs;
    assert.equal(String(fromArticleEvent.objectId), String(article._id));
    assert.equal(String(fromArticleEvent.metadata.sourceEventId), String(articleEvent._id));
    assert.equal(fromArticleEvent.metadata.route, 'save-article', 'what the event said is kept');
    assert.equal(String(fromHighlightEvent.objectId), String(highlightId));
    assert.equal(String(fromHighlightEvent.parentObjectId), String(article._id));
    assert.equal(web.type, 'external', 'a web source keeps its kind; it gains the piece it is');
    assert.equal(String(web.parentObjectId), String(article._id));
    assert.equal(String(orphan.parentObjectId), String(article._id));
    assert.equal(unsaved.parentObjectId, undefined, 'another reader’s Library is not yours');
    assert.equal(direct.parentObjectId, undefined);
    assert.ok(someoneElses);

    const reread = await WikiPage.findById(page._id).lean();
    assert.deepEqual(
      JSON.parse(JSON.stringify(reread.sourceRefs)),
      JSON.parse(JSON.stringify(page.sourceRefs)),
      'what the read found is what was written back'
    );
    assert.equal(reread.updatedAt.toISOString(), updatedAt.toISOString(), 'linking is not an edit');
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, WikiPage, page: reread }), 0, 'the second read is direct');

    // A saved address with tracking on it is the same place; a deeper path is not.
    const journal = await Article.create({ userId, url: 'https://example.com/journals?utm_source=mail', title: 'Journals' });
    const journals = { _id: id(), userId, sourceRefs: [
      { _id: id(), type: 'external', url: 'https://EXAMPLE.com/journals/' },
      { _id: id(), type: 'external', url: 'https://example.com/journals/2024' },
      { _id: id(), type: 'external', url: 'https://example.com/journals?page=2' }
    ] };
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, page: journals }), 1);
    assert.equal(String(journals.sourceRefs[0].parentObjectId), String(journal._id));

    // The backfill says what it would do, and does it only when asked.
    const unread = await WikiPage.collection.insertOne({
      userId, title: 'Unread', slug: 'unread', sourceRefs: [{ _id: id(), type: 'external', url: 'https://example.com/buffett-intrinsic-value' }]
    });
    const dry = await backfill.run({ Article, WikiPage, WikiSourceEvent, userId });
    assert.deepEqual(dry, { pages: 2, pagesLinked: 1, refsLinked: 1 });
    assert.equal((await WikiPage.findById(unread.insertedId).lean()).sourceRefs[0].parentObjectId, undefined, 'a dry run writes nothing');
    await backfill.run({ Article, WikiPage, WikiSourceEvent, userId, apply: true });
    assert.equal(String((await WikiPage.findById(unread.insertedId).lean()).sourceRefs[0].parentObjectId), String(article._id));
    assert.deepEqual(await backfill.run({ Article, WikiPage, WikiSourceEvent, userId }), { pages: 2, pagesLinked: 0, refsLinked: 0 });

    // Going forward, a saved piece or passage is cited as itself, once.
    const target = { sourceRefs: [{ type: 'article', objectId: article._id, addedBy: 'user', snippet: 'Mine.' }] };
    await attachSourceEventEvidence({ page: target, event: articleEvent });
    assert.equal(target.sourceRefs.length, 1, 'a piece already cited is not cited twice');
    assert.equal(target.sourceRefs[0].snippet, 'Mine.');
    await attachSourceEventEvidence({ page: target, event: highlightEvent });
    const passage = target.sourceRefs[1];
    assert.equal(String(passage.objectId), String(highlightId));
    assert.equal(String(passage.parentObjectId), String(article._id));
    assert.equal(String(passage.metadata.sourceEventId), String(highlightEvent._id));
    await attachSourceEventEvidence({ page: target, event: highlightEvent });
    assert.equal(target.sourceRefs.length, 2, 'the same event lands once');
    const webEvent = { _id: id(), sourceType: 'external', url: 'https://example.com/new', metadata: {} };
    await attachSourceEventEvidence({ page: target, event: webEvent });
    assert.equal(String(target.sourceRefs[2].objectId), String(webEvent._id), 'a web source is still known by its event');
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
}

run().then(() => console.log('librarySource tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
