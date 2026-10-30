const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { canonicalSourceUrl, findLibraryArticle, linkPageSources } = require('./librarySource');
const { attachSourceEventEvidence } = require('./wikiMaintenanceOrchestrator');
const backfill = require('../../scripts/link_wiki_sources_to_library');

const id = () => new mongoose.Types.ObjectId();

async function run() {
  assert.equal(canonicalSourceUrl('https://www.Example.com/piece/?utm_source=x&b=2&a=1#top'), 'example.com/piece?a=1&b=2');
  assert.equal(canonicalSourceUrl('http://example.com/piece'), canonicalSourceUrl('https://www.example.com/piece/'));
  assert.notEqual(canonicalSourceUrl('https://example.com/piece?id=1'), canonicalSourceUrl('https://example.com/piece?id=2'));
  assert.notEqual(canonicalSourceUrl('https://example.com/Report'), canonicalSourceUrl('https://example.com/report'));
  assert.notEqual(canonicalSourceUrl('https://example.com:8443/foo'), canonicalSourceUrl('https://example.com/foo'));
  assert.notEqual(canonicalSourceUrl('https://example.com/run?step=first&step=second'), canonicalSourceUrl('https://example.com/run?step=second&step=first'));
  assert.equal(canonicalSourceUrl('https://example.com/run?z=1&step=a&step=b'), 'example.com/run?step=a&step=b&z=1');
  assert.equal(canonicalSourceUrl('https://example.com:443/foo'), canonicalSourceUrl('https://example.com/foo'));
  assert.notEqual(canonicalSourceUrl('https://example.com/p?filter=a%26role%3Dadmin'), canonicalSourceUrl('https://example.com/p?filter=a&role=admin'));
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

    // Ingest asks the same question of one address: is this already yours?
    assert.equal(String((await findLibraryArticle({ Article, userId, url: 'http://example.com/buffett-intrinsic-value?fbclid=1' }))._id), String(article._id));
    assert.equal(String((await findLibraryArticle({ Article, userId, url: 'https://example.com/journals' }))._id), String(journal._id));
    assert.equal(await findLibraryArticle({ Article, userId, url: 'https://example.com/journals?page=2' }), null);
    assert.equal(await findLibraryArticle({ Article, userId, url: 'https://example.com/elsewhere' }), null, 'only your own Library');
    assert.equal(await findLibraryArticle({ Article, userId, url: 'not a url' }), null);
    assert.equal(await findLibraryArticle({ Article, userId, url: 'https://someone:secret@example.com/journals' }), null, 'an address with a password is not your article');
    const tracked = await Article.create({ userId, url: 'https://example.com/twins?utm_source=mail', title: 'Saved from the newsletter' });
    const plain = await Article.create({ userId, url: 'https://example.com/twins', title: 'Saved from the site' });
    assert.equal(String((await findLibraryArticle({ Article, userId, url: 'https://example.com/twins' }))._id), String(plain._id), 'the exact address first');
    assert.equal(String((await findLibraryArticle({ Article, userId, url: 'https://example.com/twins?utm_source=mail' }))._id), String(tracked._id));
    assert.equal(String((await findLibraryArticle({ Article, userId, url: 'https://www.example.com/twins/' }))._id), String(tracked._id), 'else the first saved');
    await Article.create({ userId, url: 'https://example.com/report?source=annual', title: 'Annual' });
    assert.equal(await findLibraryArticle({ Article, userId, url: 'https://example.com/report?source=quarterly' }), null, 'a key that picks the page is part of the address');
    await Article.create({ userId, url: 'https://example.com/put-away', title: 'Archived', archived: true });
    await Article.create({ userId, url: 'https://example.com/fixture', title: 'Debug', debugOnly: true });
    assert.equal(await findLibraryArticle({ Article, userId, url: 'https://example.com/put-away' }), null, 'an archived piece is not reused');
    assert.equal(await findLibraryArticle({ Article, userId, url: 'https://example.com/fixture' }), null, 'a debug piece is not reused');

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

    // A filing a watch brought in is filed into the Library, so its citation opens the reader.
    const filer = id();
    const filingUrl = 'https://www.sec.gov/Archives/edgar/data/1769628/000176962826000042/crwv-20260331.htm';
    const filingEvent = await WikiSourceEvent.create({
      userId: filer,
      sourceType: 'external',
      provider: 'sec-edgar',
      externalId: 'sec-edgar:0001769628:0001769628-26-000042',
      title: 'CRWV 10-Q filed 2026-05-08',
      text: 'CoreWeave, Inc. filed 10-Q on 2026-05-08.\n\nRevenue backlog was <b>large</b>.',
      url: filingUrl,
      metadata: { source: 'sec-edgar', ticker: 'CRWV', companyName: 'CoreWeave, Inc.', form: '10-Q' }
    });
    const filingRef = () => ({
      _id: id(),
      type: 'external',
      objectId: filingEvent._id,
      url: filingUrl,
      title: 'CRWV 10-Q filed 2026-05-08',
      snippet: 'CoreWeave, Inc. filed 10-Q on 2026-05-08.',
      provider: 'sec-edgar',
      metadata: { source: 'sec-edgar', ticker: 'CRWV', companyName: 'CoreWeave, Inc.' }
    });
    const dossierUpdatedAt = new Date('2026-05-09T00:00:00.000Z');
    const dossierStored = await WikiPage.collection.insertOne({
      userId: filer,
      title: 'CoreWeave',
      slug: 'coreweave',
      updatedAt: dossierUpdatedAt,
      sourceRefs: [
        filingRef(),
        filingRef(),
        { _id: id(), type: 'external', url: 'https://www.nasdaq.com/market-activity/stocks/crwv' }
      ]
    });

    const dryDossier = await WikiPage.findById(dossierStored.insertedId).lean();
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, page: dryDossier }), 0, 'a read that cannot write files nothing');
    assert.equal(await Article.countDocuments({ userId: filer }), 0);

    const dossier = await WikiPage.findById(dossierStored.insertedId).lean();
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, WikiPage, page: dossier }), 2);
    const filed = await Article.find({ userId: filer }).lean();
    assert.equal(filed.length, 1, 'one filing, one article, however often it is cited');
    const [filing] = filed;
    assert.equal(filing.url, filingUrl);
    assert.equal(filing.title, 'CRWV 10-Q filed 2026-05-08');
    assert.equal(filing.importMeta.provider, 'sec-edgar');
    assert.equal(filing.importMeta.sourceType, 'watched_filing');
    assert.equal(filing.importMeta.sourceLabel, 'CoreWeave, Inc.');
    assert.equal(filing.importMeta.externalId, 'sec-edgar:0001769628:0001769628-26-000042');
    assert.ok(filing.content.includes('Revenue backlog was &lt;b&gt;large&lt;/b&gt;.'), 'the watch\'s text, as text');
    const [tenQ, again, quote] = dossier.sourceRefs;
    assert.equal(String(tenQ.parentObjectId), String(filing._id));
    assert.equal(String(again.parentObjectId), String(filing._id));
    assert.equal(tenQ.type, 'external', 'the filing keeps its kind and its event');
    assert.equal(String(tenQ.objectId), String(filingEvent._id));
    assert.equal(quote.parentObjectId, undefined, 'a web page nobody saved is not filed');
    const dossierReread = await WikiPage.findById(dossier._id).lean();
    assert.equal(String(dossierReread.sourceRefs[0].parentObjectId), String(filing._id));
    assert.equal(dossierReread.updatedAt.toISOString(), dossierUpdatedAt.toISOString(), 'filing is not an edit');
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, WikiPage, page: dossierReread }), 0, 'the second read is direct');
    assert.equal(await Article.countDocuments({ userId: filer }), 1);

    // A filing already in the Library, at another spelling, is used as it stands.
    const savedFilingUrl = 'https://sec.gov/Archives/edgar/data/1769628/000176962826000099/crwv-10k.htm';
    const saved = await Article.create({ userId: filer, url: `${savedFilingUrl}/`, title: 'Saved 10-K', content: '<p>Mine.</p>' });
    const tenK = { _id: id(), userId: filer, sourceRefs: [{ ...filingRef(), objectId: null, url: savedFilingUrl.replace('://', '://www.') }] };
    assert.equal(await linkPageSources({ Article, WikiSourceEvent, WikiPage, page: tenK }), 1);
    assert.equal(String(tenK.sourceRefs[0].parentObjectId), String(saved._id));
    assert.equal((await Article.findById(saved._id).lean()).content, '<p>Mine.</p>', 'never overwritten');
    assert.equal(await Article.countDocuments({ userId: filer }), 2);
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
}

run().then(() => console.log('librarySource tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
