const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { buildSettleRouter } = require('./settleRoutes');
const { buildNotebookRouter } = require('./notebookRoutes');
const { buildConceptMetaRouter } = require('./conceptMetaRoutes');
const { deriveClaimsFromDoc } = require('../services/wikiMaintenanceService');
const { isHumanOnlyWikiArtifact } = require('../services/wikiProtectedArtifactService');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

test('real Mongo: a note or a concept settles into one wiki page, quotes cited, and settling again is a revision', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 60000 }] });
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const { Article, NotebookEntry, TagMeta, WikiPage, WikiRevision } = require('../models');
    const userId = new mongoose.Types.ObjectId();
    const stranger = new mongoose.Types.ObjectId();
    const articleId = new mongoose.Types.ObjectId();
    const highlightId = new mongoose.Types.ObjectId();
    const quote = { id: 'q1', type: 'highlight_embed', articleId, highlightId, articleTitle: 'On Moats', text: 'Scale is a moat until it is not.' };
    const note = await NotebookEntry.create({
      userId,
      title: 'Why moats erode',
      blocks: [{ id: 'p1', type: 'paragraph', text: 'Prices stay low for years, and then they do not.' }, quote]
    });
    const blank = await NotebookEntry.create({ userId, title: 'Untitled', blocks: [{ id: 'p', type: 'paragraph', text: 'A start.' }] });
    const namesakeNote = await NotebookEntry.create({ userId, title: 'Compounding', blocks: [{ id: 'p', type: 'paragraph', text: 'Time does the work.' }] });
    await WikiPage.create({ userId, title: 'Compounding', slug: 'compounding' });

    const app = express();
    app.use(express.json());
    const auth = (req, _res, next) => { req.user = { id: String(req.get('x-user') || userId) }; next(); };
    app.use(buildSettleRouter({
      authenticateToken: auth,
      NotebookEntry,
      TagMeta,
      Article,
      WikiPage,
      WikiRevision,
      buildUniqueSlug: async (_user, title) => title.toLowerCase().replace(/\W+/g, '-'),
      refreshPageClaims: (page) => {
        page.claims = deriveClaimsFromDoc({ body: page.body, sourceRefs: page.sourceRefs, previousClaims: page.claims?.toObject?.() || [] });
      },
      serializePage: page => page.toObject()
    }));
    app.use(buildNotebookRouter({ authenticateToken: auth, NotebookEntry, WikiPage, ensureNotebookBlocks: () => {} }));
    app.use(buildConceptMetaRouter({ authenticateToken: auth, TagMeta, WikiPage, getConceptMeta: async (_user, id) => ({ _id: id, name: 'concept' }) }));
    let url;
    ({ server, url } = await listen(app));
    const settle = async (id, user = userId, kind = 'notebook') => {
      const response = await fetch(`${url}/api/${kind}/${id}/settle`, { method: 'POST', headers: { 'x-user': String(user) } });
      return { status: response.status, body: await response.json() };
    };

    const first = await settle(note._id);
    assert.equal(first.status, 201);
    const pageId = first.body.page._id;
    const page = await WikiPage.findById(pageId).lean();
    assert.equal(page.title, 'Why moats erode');
    assert.equal(String(page.createdFrom.objectId), String(note._id), 'the page names the note it came from');
    assert.equal(page.createdFrom.type, 'notebook');
    assert.ok(isHumanOnlyWikiArtifact(page), 'maintenance never rewrites a settled note');
    assert.equal(page.sourceRefs.length, 1);
    assert.equal(page.sourceRefs[0].type, 'highlight');
    assert.equal(String(page.sourceRefs[0].objectId), String(highlightId));
    assert.equal(String(page.sourceRefs[0].parentObjectId), String(articleId), 'the passage still opens in its article');
    const cited = page.claims.find(claim => claim.claimId === 'settled-q1');
    assert.equal(cited.text, quote.text);
    assert.equal(cited.support, 'supported');
    assert.deepEqual(cited.sourceRefIds.map(String), [String(page.sourceRefs[0]._id)]);

    const opened = await (await fetch(`${url}/api/notebook/${note._id}`)).json();
    assert.deepEqual(opened.settledIn, { _id: pageId, title: 'Why moats erode' }, 'the note keeps its quiet link');

    await NotebookEntry.updateOne({ _id: note._id }, { $set: { title: 'How moats erode', blocks: [{ id: 'p1', type: 'paragraph', text: 'Slowly, then at once.' }, quote] } });
    const again = await settle(note._id);
    assert.equal(again.status, 200);
    assert.equal(again.body.resettled, true);
    assert.equal(again.body.page._id, pageId, 'settling again updates the same page');
    assert.equal(await WikiPage.countDocuments({ userId, 'createdFrom.objectId': note._id }), 1, 'never a duplicate');
    const revised = await WikiPage.findById(pageId).lean();
    assert.equal(revised.title, 'How moats erode');
    assert.equal(revised.slug, 'how-moats-erode');
    assert.match(revised.plainText, /Slowly, then at once/);
    const revisions = await WikiRevision.find({ pageId }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(revisions.map(revision => revision.reason), ['created', 'user_edit']);
    assert.match(revisions[1].summary, /Settled again/);
    assert.match(revisions[1].before.plainText, /Prices stay low/, 'the earlier words stay in history');

    const refused = await settle(blank._id);
    assert.equal(refused.status, 422);
    assert.match(refused.body.error, /placeholder/);
    const taken = await settle(namesakeNote._id);
    assert.equal(taken.status, 409);
    assert.match(taken.body.error, /already has a page called “Compounding”/);
    assert.equal(await WikiPage.countDocuments({ userId }), 2, 'a refusal writes nothing');

    assert.equal((await settle(note._id, stranger)).status, 404);
    assert.equal((await settle('not-an-id')).status, 404);

    // A concept settles the same way: its draft, then the passages it holds.
    const inlineId = new mongoose.Types.ObjectId();
    const heldId = new mongoose.Types.ObjectId();
    const source = await Article.create({
      userId, title: 'The Moat Paradox', url: 'https://example.com/moats',
      highlights: [{ _id: inlineId, text: 'A moat is a habit.' }, { _id: heldId, text: 'Moats drain slowly.' }]
    });
    const concept = await TagMeta.create({
      userId,
      name: 'Durable advantage',
      description: 'Why some leads last.',
      pinnedHighlightIds: [inlineId, heldId],
      ideaWorkbench: { hypothesis: { html: `<h2>Claim</h2><p data-block-id="c1">Advantage &amp; time compound.</p><blockquote data-highlight-id="${inlineId}" data-highlight-text="A moat is a habit." data-article-id="${source._id}" data-article-title="The Moat Paradox"></blockquote><ul><li><p>Brands</p></li></ul>` } }
    });
    const conceptFirst = await settle(concept._id, userId, 'concepts');
    assert.equal(conceptFirst.status, 201);
    const conceptPage = await WikiPage.findById(conceptFirst.body.page._id).lean();
    assert.equal(conceptPage.title, 'Durable advantage');
    assert.equal(conceptPage.createdFrom.type, 'concept');
    assert.equal(conceptPage.createdFrom.label, `settled-concept:${concept._id}`);
    assert.ok(isHumanOnlyWikiArtifact(conceptPage), 'maintenance never rewrites a settled concept');
    assert.deepEqual(conceptPage.body.content.map(node => node.type), ['paragraph', 'heading', 'paragraph', 'pullquote', 'bulletList', 'pullquote']);
    assert.match(conceptPage.plainText, /Why some leads last\.[\s\S]*Advantage & time compound/);
    assert.deepEqual(conceptPage.sourceRefs.map(ref => String(ref.objectId)), [String(inlineId), String(heldId)], 'each passage is cited once, in reading order');
    assert.deepEqual(conceptPage.sourceRefs.map(ref => String(ref.parentObjectId)), [String(source._id), String(source._id)]);
    assert.ok(conceptPage.claims.find(claim => claim.claimId === `settled-held-${heldId}`), 'a held passage is a cited claim');

    await TagMeta.updateOne({ _id: concept._id }, { $set: { description: 'Why few leads last.' } });
    const conceptAgain = await settle(concept._id, userId, 'concepts');
    assert.equal(conceptAgain.status, 200);
    assert.equal(conceptAgain.body.page._id, conceptFirst.body.page._id, 'settling again revises the same page');
    assert.match((await WikiPage.findById(conceptFirst.body.page._id).lean()).plainText, /Why few leads last/);
    const openedConcept = await (await fetch(`${url}/api/concepts/${concept._id}`)).json();
    assert.deepEqual(openedConcept.settledIn, { _id: conceptFirst.body.page._id, title: 'Durable advantage' }, 'the concept keeps its quiet link');

    const empty = await TagMeta.create({ userId, name: 'Not yet thought' });
    const emptyRefusal = await settle(empty._id, userId, 'concepts');
    assert.equal(emptyRefusal.status, 422);
    assert.match(emptyRefusal.body.error, /Nothing is written here yet/);
    assert.equal((await settle(concept._id, stranger, 'concepts')).status, 404);
    assert.equal((await fetch(`${url}/api/questions/${concept._id}/settle`, { method: 'POST' })).status, 404, 'only notes and concepts settle');
  } finally {
    server?.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
