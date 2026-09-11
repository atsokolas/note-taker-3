#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');

const {
  User,
  Article,
  NotebookEntry,
  Question,
  WikiPage,
  AuthoredExploration,
  WikiSourceEvent,
  EmbeddingJob
} = require('../server/models');
const { buildNotebookRouter } = require('../server/routes/notebookRoutes');
const { buildAuthoredExplorationRouter } = require('../server/routes/authoredExplorationRoutes');
const { resolveExplorationContext } = require('../server/services/authoredExplorationService');
const { buildAuthoredKeepEffects } = require('../server/services/authoredKeepEffects');
const { enqueueNotebookEmbedding, enqueueQuestionEmbedding } = require('../server/ai/embeddingJobs');

const DEFAULT_URI = 'mongodb://127.0.0.1:27028/noeis_authorship_qa';
const OWNER_TOKEN = 'authorship-owner';
const FOREIGN_TOKEN = 'authorship-foreign';
const AGENT_TOKEN = 'authorship-agent';

const parseUri = () => {
  const argument = process.argv.find((item) => item.startsWith('--mongo-uri='));
  const value = argument ? argument.slice('--mongo-uri='.length) : DEFAULT_URI;
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    parsed.protocol !== 'mongodb:'
    || parsed.hostname !== '127.0.0.1'
    || parsed.port !== '27028'
    || database !== 'noeis_authorship_qa'
    || parsed.username
    || parsed.password
  ) {
    throw new Error('Acceptance is restricted to mongodb://127.0.0.1:27028/noeis_authorship_qa without credentials.');
  }
  return value;
};

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
});

const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

const request = async (base, route, { method = 'GET', token = OWNER_TOKEN, body } = {}) => {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  if (response.status !== 204) payload = await response.json();
  return { status: response.status, payload };
};

const draft = ({ claimText, writing, question = 'Who decides what can be recovered?', articleId, highlightId, passage }) => ({
  title: 'A private line in motion',
  writing,
  originalText: claimText,
  provisionalText: claimText,
  question,
  returnNote: 'Come back after another example.',
  mark: '!',
  selectedSource: { articleId, highlightId, passage }
});

const claimBody = (claims) => ({
  type: 'doc',
  content: claims.map(claim => ({
    type: 'paragraph',
    content: [{
      type: 'text',
      text: claim.text,
      marks: [{ type: 'claim', attrs: { claimId: claim.claimId } }]
    }]
  }))
});

const run = async () => {
  const uri = parseUri();
  const runId = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const checks = [];
  const counters = { notebookEmbeddings: 0, questionEmbeddings: 0, sourceEvents: 0 };
  const created = { userIds: [], pageIds: [], articleIds: [] };
  let server;
  let report;

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await Promise.all([AuthoredExploration.init(), WikiSourceEvent.init(), EmbeddingJob.init()]);
    const indexes = await AuthoredExploration.collection.indexes();
    const ownerClaimIndex = indexes.find((index) => (
      index.unique
      && JSON.stringify(index.key) === JSON.stringify({ userId: 1, pageId: 1, claimId: 1 })
    ));
    assert(ownerClaimIndex, 'owner/page/claim unique index must exist');
    assert(indexes.some((index) => (
      JSON.stringify(index.key) === JSON.stringify({ userId: 1, pageId: 1, updatedAt: -1 })
    )), 'owner/page recency index must exist');
    checks.push('The real collection has its unique owner/page/claim and owner/page recency indexes.');

    const [owner, foreign] = await User.create([
      { username: `authorship-owner-${runId}`, password: 'acceptance-only' },
      { username: `authorship-foreign-${runId}`, password: 'acceptance-only' }
    ]);
    created.userIds.push(owner._id, foreign._id);

    const source = await Article.create({
      userId: owner._id,
      url: `https://acceptance.invalid/authorship/${runId}/source`,
      title: `Authorship source ${runId}`,
      content: 'Before the chosen line. A recoverable mistake leaves another attempt. After the chosen line.',
      highlights: [{ text: 'A recoverable mistake leaves another attempt.', note: 'Acceptance passage' }]
    });
    const comparisonPassage = 'Another tradition treats revision as a form of attention.';
    const comparisonSource = await Article.create({
      userId: owner._id,
      url: `https://acceptance.invalid/authorship/${runId}/comparison`,
      title: `Comparison source ${runId}`,
      content: `Before the comparison. ${comparisonPassage} After the comparison.`,
      highlights: []
    });
    const foreignSource = await Article.create({
      userId: foreign._id,
      url: `https://acceptance.invalid/authorship/${runId}/foreign`,
      title: `Foreign source ${runId}`,
      content: 'A source the owner must never resolve.',
      highlights: [{ text: 'A source the owner must never resolve.' }]
    });
    created.articleIds.push(source._id, comparisonSource._id, foreignSource._id);
    const highlightId = source.highlights[0]._id;

    const sourceRefId = new mongoose.Types.ObjectId();
    const citationId = new mongoose.Types.ObjectId();
    const claimOne = `claim-one-${runId}`;
    const claimTwo = `claim-two-${runId}`;
    const claimThree = `claim-three-${runId}`;
    const claimFour = `claim-four-${runId}`;
    const claimText = 'A durable thought needs room to change.';
    const claims = [
      { claimId: claimOne, text: claimText, support: 'supported', sourceRefIds: [sourceRefId], citationIds: [citationId] },
      { claimId: claimTwo, text: 'A second sentence holds a separate experiment.', support: 'supported' },
      { claimId: claimThree, text: 'A third sentence tests ownership.', support: 'supported' },
      { claimId: claimFour, text: 'A fourth sentence tests interrupted finishing.', support: 'supported' }
    ];
    const page = await WikiPage.create({
      userId: owner._id,
      title: `Authorship acceptance ${runId}`,
      slug: `authorship-acceptance-${runId}`,
      status: 'published',
      plainText: claimText,
      body: claimBody(claims),
      sourceRefs: [{
        _id: sourceRefId,
        type: 'highlight',
        objectId: highlightId,
        parentObjectId: source._id,
        title: source.title,
        snippet: source.highlights[0].text
      }],
      citations: [{ _id: citationId, sourceRefId, sourceType: 'highlight', sourceObjectId: highlightId, quote: source.highlights[0].text }],
      claims
    });
    const foreignPage = await WikiPage.create({
      userId: foreign._id,
      title: `Foreign authorship acceptance ${runId}`,
      slug: `foreign-authorship-acceptance-${runId}`,
      status: 'published',
      claims: [{ claimId: `foreign-claim-${runId}`, text: 'Foreign private sentence.' }],
      body: claimBody([{ claimId: `foreign-claim-${runId}`, text: 'Foreign private sentence.' }])
    });
    created.pageIds.push(page._id, foreignPage._id);
    const wikiBefore = JSON.stringify({ claims: page.claims, sourceRefs: page.sourceRefs, citations: page.citations, body: page.body, plainText: page.plainText });

    const app = express();
    const effects = buildAuthoredKeepEffects({ WikiSourceEvent, enqueueNotebookEmbedding, enqueueQuestionEmbedding });
    let failAfterEffects = false;
    app.use(express.json({ limit: '1mb' }));
    const authenticateToken = (req, res, next) => {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (token === OWNER_TOKEN) req.user = { id: String(owner._id) };
        else if (token === FOREIGN_TOKEN) req.user = { id: String(foreign._id) };
        else if (token === AGENT_TOKEN) {
          req.user = { id: String(owner._id) };
          req.agentToken = true;
        }
        else return res.status(401).json({ error: 'AUTH_REQUIRED' });
        return next();
      };
    app.use(buildNotebookRouter({ authenticateToken, NotebookEntry }));
    app.use(buildAuthoredExplorationRouter({
      authenticateToken,
      AuthoredExploration,
      WikiPage,
      Article,
      NotebookEntry,
      Question,
      createBlockId: () => crypto.randomUUID(),
      onNotebookKept: async entry => {
        counters.notebookEmbeddings += 1;
        counters.sourceEvents += 1;
        await effects.onNotebookKept(entry);
        if (failAfterEffects) throw new Error('Interrupted after durable effects');
      },
      onQuestionKept: async question => { counters.questionEmbeddings += 1; await effects.onQuestionKept(question); }
    }));
    const listening = await listen(app);
    server = listening.server;
    const base = listening.base;
    const claimPath = (claimId) => `/api/wiki/pages/${page._id}/claims/${encodeURIComponent(claimId)}/exploration`;

    const firstDraft = draft({
      claimText,
      writing: 'The first private sentence.',
      articleId: comparisonSource._id,
      passage: comparisonPassage
    });
    const createdExploration = await request(base, claimPath(claimOne), {
      method: 'PUT', body: { expectedRevision: 0, mutationId: `create-${runId}`, draft: firstDraft }
    });
    assert.equal(createdExploration.status, 201, JSON.stringify(createdExploration.payload));
    assert.equal(createdExploration.payload.exploration.draft.selectedSource.title, comparisonSource.title);
    const selectedPath = createdExploration.payload.exploration.draft.selectedSource.href;
    assert(selectedPath.startsWith(`/library?articleId=${comparisonSource._id}#passage=`));
    assert.equal(counters.notebookEmbeddings + counters.questionEmbeddings + counters.sourceEvents, 0);
    checks.push('A draft persisted with a canonical owned source and no embedding or Wiki-source callback.');

    const raceBodies = [
      { expectedRevision: 1, mutationId: `race-a-${runId}`, draft: { ...firstDraft, writing: 'Race winner A.' } },
      { expectedRevision: 1, mutationId: `race-b-${runId}`, draft: { ...firstDraft, writing: 'Race winner B.' } }
    ];
    const race = await Promise.all(raceBodies.map((body) => request(base, claimPath(claimOne), { method: 'PUT', body })));
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
    const winnerIndex = race.findIndex((result) => result.status === 200);
    const winner = race[winnerIndex];
    const replay = await request(base, claimPath(claimOne), { method: 'PUT', body: raceBodies[winnerIndex] });
    assert.equal(replay.status, 200);
    assert.equal(replay.payload.exploration.idempotent, true);
    assert.equal(replay.payload.exploration.revision, 2);
    assert.equal(replay.payload.exploration.draft.writing, winner.payload.exploration.draft.writing);
    assert.equal(counters.notebookEmbeddings + counters.questionEmbeddings + counters.sourceEvents, 0);
    checks.push('Real Mongo CAS admitted one concurrent writer and replayed the exact winning mutation after a lost acknowledgement.');

    const notebookKeepBody = { expectedRevision: 2, mutationId: `keep-note-${runId}`, destination: 'notebook' };
    const keptNotebook = await request(base, `${claimPath(claimOne)}/keep`, { method: 'POST', body: notebookKeepBody });
    assert.equal(keptNotebook.status, 200, JSON.stringify(keptNotebook.payload));
    assert.equal(keptNotebook.payload.destination, 'notebook');
    assert.match(keptNotebook.payload.href, /^\/think\?tab=notebook&entryId=/);
    const noteId = keptNotebook.payload.targetId;
    const note = await NotebookEntry.findOne({ _id: noteId, userId: owner._id }).lean();
    assert(note);
    assert.equal(note.importMeta.sourceType, 'authored_exploration');
    assert.equal(note.importMeta.sourceUrl, `/wiki/read/${page._id}?claimId=${encodeURIComponent(claimOne)}&exploration=1`);
    assert.equal(note.importMeta.sourcePath, selectedPath);
    assert(note.importMeta.importedAt instanceof Date);
    assert(note.linkedHighlightIds.some((value) => String(value) === String(highlightId)));
    assert(note.blocks.some((block) => block.type === 'highlight_embed' && block.text === source.highlights[0].text && String(block.highlightId) === String(highlightId)));
    assert(note.blocks.some((block) => block.type === 'quote' && block.text === comparisonPassage && String(block.articleId) === String(comparisonSource._id) && block.sourcePath === selectedPath));
    assert.equal(note.blocks.some((block) => String(block.text || '').startsWith('Origin:')), false);
    const noteRetry = await request(base, `${claimPath(claimOne)}/keep`, { method: 'POST', body: notebookKeepBody });
    assert.equal(noteRetry.payload.targetId, noteId);
    assert.equal(await NotebookEntry.countDocuments({ userId: owner._id, 'importMeta.sourceType': 'authored_exploration' }), 1);
    assert.equal(counters.notebookEmbeddings, 1);
    assert.equal(counters.sourceEvents, 1);
    checks.push('Notebook keep preserved the primary highlight and chosen exact article excerpt with structured return links; retry produced no duplicate or duplicate callbacks.');

    const questionKeepBody = { expectedRevision: 3, mutationId: `keep-question-${runId}`, destination: 'question' };
    const keptQuestion = await request(base, `${claimPath(claimOne)}/keep`, { method: 'POST', body: questionKeepBody });
    assert.equal(keptQuestion.status, 200, JSON.stringify(keptQuestion.payload));
    assert.match(keptQuestion.payload.href, /^\/think\?tab=questions&questionId=/);
    const questionId = keptQuestion.payload.targetId;
    const question = await Question.findOne({ _id: questionId, userId: owner._id }).lean();
    assert(question);
    assert.equal(question.text, firstDraft.question);
    assert.equal(question.importMeta.sourceType, 'authored_exploration');
    assert.equal(question.importMeta.sourceUrl, `/wiki/read/${page._id}?claimId=${encodeURIComponent(claimOne)}&exploration=1`);
    assert.equal(question.importMeta.sourcePath, selectedPath);
    assert(question.importMeta.importedAt instanceof Date);
    assert(question.linkedHighlightIds.some((value) => String(value) === String(highlightId)));
    assert(question.blocks.some((block) => block.type === 'highlight-ref' && block.text === source.highlights[0].text && String(block.highlightId) === String(highlightId)));
    assert(question.blocks.some((block) => block.type === 'paragraph' && block.text === comparisonPassage && String(block.articleId) === String(comparisonSource._id) && block.sourcePath === selectedPath));
    assert.equal(question.blocks.some((block) => String(block.text || '').startsWith('Origin:')), false);
    const questionRetry = await request(base, `${claimPath(claimOne)}/keep`, { method: 'POST', body: questionKeepBody });
    assert.equal(questionRetry.payload.targetId, questionId);
    assert.equal(await Question.countDocuments({ userId: owner._id }), 1);
    assert.equal(counters.questionEmbeddings, 1);
    checks.push('Question keep preserved the primary highlight and chosen exact article excerpt in one normal linked Question; retry returned the same target.');

    const secondText = page.claims.find((claim) => claim.claimId === claimTwo).text;
    const secondDraft = draft({ claimText: secondText, writing: 'Writing captured when Keep was pressed.', articleId: source._id, highlightId, passage: source.highlights[0].text });
    const secondCreated = await request(base, claimPath(claimTwo), {
      method: 'PUT', body: { expectedRevision: 0, mutationId: `second-${runId}`, draft: secondDraft }
    });
    assert.equal(secondCreated.status, 201);
    const realNotebookCreate = NotebookEntry.create;
    NotebookEntry.create = async () => { throw new Error('simulated destination interruption'); };
    const realConsoleError = console.error;
    console.error = (...args) => {
      if (!String(args[1]?.message || args[1] || '').includes('simulated destination interruption')) realConsoleError(...args);
    };
    let interrupted;
    try {
      interrupted = await request(base, `${claimPath(claimTwo)}/keep`, {
        method: 'POST', body: { expectedRevision: 1, mutationId: `pending-${runId}`, destination: 'notebook' }
      });
    } finally {
      NotebookEntry.create = realNotebookCreate;
      console.error = realConsoleError;
    }
    assert.equal(interrupted.status, 500);
    const pending = await AuthoredExploration.findOne({ userId: owner._id, pageId: page._id, claimId: claimTwo }).lean();
    assert.equal(pending.revision, 2);
    assert.equal(pending.keeps[0].status, 'pending');
    assert.equal(pending.keeps[0].snapshot.draft.writing, secondDraft.writing);
    const laterSave = await request(base, claimPath(claimTwo), {
      method: 'PUT', body: { expectedRevision: 2, mutationId: `later-${runId}`, draft: { ...secondDraft, writing: 'Writing added after the interrupted Keep.' } }
    });
    assert.equal(laterSave.status, 200);
    const claimsBeforePendingRecovery = JSON.parse(JSON.stringify(page.claims));
    const bodyBeforePendingRecovery = JSON.parse(JSON.stringify(page.body));
    const claimsWithoutPendingOrigin = claimsBeforePendingRecovery.filter((claim) => claim.claimId !== claimTwo);
    page.claims = claimsWithoutPendingOrigin;
    page.body = claimBody(claimsWithoutPendingOrigin);
    page.markModified('claims');
    page.markModified('body');
    await page.save();
    const recovered = await request(base, `${claimPath(claimTwo)}/keep`, {
      method: 'POST', body: { expectedRevision: 1, mutationId: `pending-${runId}`, destination: 'notebook' }
    });
    assert.equal(recovered.status, 200, JSON.stringify(recovered.payload));
    const recoveredNote = await NotebookEntry.findById(recovered.payload.targetId).lean();
    assert.equal(recoveredNote.content, secondDraft.writing);
    const completed = await AuthoredExploration.findOne({ userId: owner._id, pageId: page._id, claimId: claimTwo }).lean();
    assert.equal(completed.keeps[0].status, 'complete');
    assert.equal(completed.keeps[0].snapshot?.draft, undefined);
    page.claims = claimsBeforePendingRecovery;
    page.body = bodyBeforePendingRecovery;
    page.markModified('claims');
    page.markModified('body');
    await page.save();
    checks.push('A pending Keep survived an interrupted target write, retained its click-time snapshot through a later draft revision and missing origin, and recovered once.');

    const fourthText = claims.find(claim => claim.claimId === claimFour).text;
    const fourthDraft = draft({ claimText: fourthText, writing: 'Words at the moment of Keep.',
      articleId: source._id, highlightId, passage: source.highlights[0].text });
    const fourthSave = await request(base, claimPath(claimFour), {
      method: 'PUT', body: { expectedRevision: 0, mutationId: `save-four-${runId}`, draft: fourthDraft }
    });
    assert.equal(fourthSave.status, 201);
    const fourthKeepBody = { expectedRevision: 1, mutationId: `keep-four-${runId}`, destination: 'notebook' };
    const realEventUpdate = WikiSourceEvent.updateOne;
    let interruptedEffects;
    try {
      WikiSourceEvent.updateOne = () => { throw new Error('Source-event queue unavailable'); };
      interruptedEffects = await request(base, `${claimPath(claimFour)}/keep`, { method: 'POST', body: fourthKeepBody });
    } finally { WikiSourceEvent.updateOne = realEventUpdate; }
    assert.equal(interruptedEffects.status, 503);
    assert.equal(interruptedEffects.payload.code, 'keep_pending');
    const pendingCopy = interruptedEffects.payload.current.keeps[0];
    const pendingId = pendingCopy.targetId;
    assert.equal(pendingCopy.status, 'pending');
    assert.equal(await NotebookEntry.countDocuments({ _id: pendingId, userId: owner._id }), 1);
    assert.equal(await EmbeddingJob.countDocuments({ collection: 'notebook_entries', objectId: pendingId }), 1);
    assert.equal(await WikiSourceEvent.countDocuments({ _id: pendingId }), 0);
    await request(base, claimPath(claimFour), { method: 'PUT', body: {
      expectedRevision: 2, mutationId: `later-four-${runId}`, draft: { ...fourthDraft, writing: 'Later private words remain private.' }
    } });
    let lostEffectAck;
    try {
      failAfterEffects = true;
      lostEffectAck = await request(base, `${claimPath(claimFour)}/keep`, { method: 'POST', body: fourthKeepBody });
    } finally { failAfterEffects = false; }
    assert.equal(lostEffectAck.status, 503);
    assert.equal(await WikiSourceEvent.countDocuments({ _id: pendingId }), 1);
    const recoveredEffects = await Promise.all([0, 1].map(() => request(base, `${claimPath(claimFour)}/keep`, {
      method: 'POST', body: fourthKeepBody
    })));
    assert(recoveredEffects.every(result => result.status === 200 && result.payload.targetId === pendingId));
    assert.equal(await NotebookEntry.countDocuments({ _id: pendingId, userId: owner._id }), 1);
    assert.equal(await EmbeddingJob.countDocuments({ collection: 'notebook_entries', objectId: pendingId }), 1);
    assert.equal(await WikiSourceEvent.countDocuments({ _id: pendingId }), 1);
    const fourthRecord = await AuthoredExploration.findOne({ userId: owner._id, pageId: page._id, claimId: claimFour }).lean();
    assert.equal(fourthRecord.keeps[0].status, 'complete');
    assert.equal(fourthRecord.keeps[0].snapshot?.draft, undefined);
    assert.equal(fourthRecord.draft.writing, 'Later private words remain private.');
    assert.equal((await NotebookEntry.findById(pendingId).lean()).content, fourthDraft.writing);
    checks.push('Keep recovered after partial queue persistence and a lost effects acknowledgment; concurrent retries left one exact copy, one durable embedding job, and one source event.');

    const effectsBeforeDeletion = { ...counters };
    for (const [Model, targetId, body] of [[NotebookEntry, noteId, notebookKeepBody], [Question, keptQuestion.payload.targetId, questionKeepBody]]) {
      await Model.deleteOne({ _id: targetId, userId: owner._id });
      const deletedRetry = await request(base, `${claimPath(claimOne)}/keep`, { method: 'POST', body });
      assert.equal(deletedRetry.status, 410);
      assert.equal(deletedRetry.payload.code, 'kept_copy_removed');
      assert.equal(await Model.countDocuments({ _id: targetId }), 0);
    }
    assert.deepEqual(counters, effectsBeforeDeletion);
    checks.push('Deleted completed Notebook and Question copies stayed deleted on retry, without recreation or queue callbacks.');

    const ownerOnForeignPage = await request(base, `/api/wiki/pages/${foreignPage._id}/explorations`);
    assert.equal(ownerOnForeignPage.status, 404);
    const foreignOnOwnerPage = await request(base, `/api/wiki/pages/${page._id}/explorations`, { token: FOREIGN_TOKEN });
    assert.equal(foreignOnOwnerPage.status, 404);
    const foreignSourceAttempt = await request(base, claimPath(claimThree), {
      method: 'PUT',
      body: {
        expectedRevision: 0,
        mutationId: `foreign-source-${runId}`,
        draft: draft({
          claimText: page.claims.find((claim) => claim.claimId === claimThree).text,
          writing: 'This must not save.',
          articleId: foreignSource._id,
          highlightId: foreignSource.highlights[0]._id,
          passage: foreignSource.highlights[0].text
        })
      }
    });
    assert.equal(foreignSourceAttempt.status, 404);
    checks.push('Foreign pages and foreign selected sources were blocked without revealing ownership.');

    const thirdText = page.claims.find((claim) => claim.claimId === claimThree).text;
    const acceptedBeforeLostAck = {
      expectedRevision: 0,
      mutationId: `accepted-before-lost-ack-${runId}`,
      draft: draft({
        claimText: thirdText,
        writing: 'These words were accepted before their acknowledgement was lost.',
        articleId: source._id,
        highlightId,
        passage: source.highlights[0].text
      })
    };
    const acceptedThird = await request(base, claimPath(claimThree), { method: 'PUT', body: acceptedBeforeLostAck });
    assert.equal(acceptedThird.status, 201);
    const newerThird = await request(base, claimPath(claimThree), {
      method: 'PUT',
      body: {
        expectedRevision: 1,
        mutationId: `newer-after-lost-ack-${runId}`,
        draft: { ...acceptedBeforeLostAck.draft, writing: 'Newer words from another session.' }
      }
    });
    assert.equal(newerThird.status, 200);
    const ambiguousReplay = await request(base, claimPath(claimThree), { method: 'PUT', body: acceptedBeforeLostAck });
    assert.equal(ambiguousReplay.status, 409);
    assert.equal(ambiguousReplay.payload.code, 'stale_revision');
    assert.equal(ambiguousReplay.payload.acknowledgedRevision, 1);
    assert.equal(ambiguousReplay.payload.current.revision, 2);
    const staleDiscard = await request(base, claimPath(claimThree), {
      method: 'DELETE', body: { expectedRevision: 1 }
    });
    assert.equal(staleDiscard.status, 409);
    const preservedThird = await AuthoredExploration.findOne({ userId: owner._id, pageId: page._id, claimId: claimThree }).lean();
    assert.equal(preservedThird.revision, 2);
    assert.equal(preservedThird.draft.writing, 'Newer words from another session.');
    checks.push('A replayed old save exposed newer concurrent work as a conflict and could not authorize Discard of that newer revision.');

    comparisonSource.content = 'The owned passage changed after the private writing was saved.';
    await comparisonSource.save();
    const drifted = await request(base, `/api/wiki/pages/${page._id}/explorations`);
    assert.equal(drifted.status, 200);
    const driftedFirst = drifted.payload.explorations.find((item) => item.claimId === claimOne);
    assert.equal(driftedFirst.draft.writing, winner.payload.exploration.draft.writing);
    assert.equal(driftedFirst.draft.selectedSource.passage, firstDraft.selectedSource.passage);
    assert.equal(driftedFirst.draft.selectedSource.available, false);
    assert.equal(driftedFirst.draft.selectedSource.stale, true);
    assert.equal(driftedFirst.sourceIssue.code, 'stale_source');
    checks.push('GET retained authored words and the recorded passage while explicitly invalidating a drifted source.');

    const originalBody = JSON.parse(JSON.stringify(page.body));
    page.body.content[0].content[0].text = 'The rendered body changed without its claim ledger.';
    page.markModified('body');
    await page.save();
    const bodyDrifted = await request(base, `/api/wiki/pages/${page._id}/explorations`);
    assert.equal(bodyDrifted.status, 200);
    const bodyDriftedFirst = bodyDrifted.payload.explorations.find((item) => item.claimId === claimOne);
    assert.equal(bodyDriftedFirst.originStale, true);
    assert.equal(bodyDriftedFirst.draft.writing, winner.payload.exploration.draft.writing);
    const rejectedBodySave = await request(base, claimPath(claimOne), {
      method: 'PUT',
      body: {
        expectedRevision: 4,
        mutationId: `body-drift-${runId}`,
        draft: winner.payload.exploration.draft
      }
    });
    assert.equal(rejectedBodySave.status, 409);
    assert.equal(rejectedBodySave.payload.code, 'stale_origin');
    await assert.rejects(
      resolveExplorationContext({
        userId: owner._id,
        context: {
          pageId: String(page._id),
          claimId: claimOne,
          metadata: {
            exploration: {
              pageId: String(page._id),
              claimId: claimOne,
              draft: winner.payload.exploration.draft
            }
          }
        },
        WikiPage,
        Article
      }),
      error => error?.code === 'stale_origin'
    );
    page.body = originalBody;
    page.markModified('body');
    await page.save();
    checks.push('Rendered-body drift remained readable but blocked draft save and explicit generation binding before private words could be consumed.');

    const foreignDiscard = await request(base, claimPath(claimOne), {
      method: 'DELETE', token: FOREIGN_TOKEN, body: { expectedRevision: 4 }
    });
    assert.equal(foreignDiscard.status, 204);
    assert(await AuthoredExploration.exists({ userId: owner._id, pageId: page._id, claimId: claimOne }));
    const agentDiscard = await request(base, claimPath(claimOne), {
      method: 'DELETE', token: AGENT_TOKEN, body: { expectedRevision: 4 }
    });
    assert.equal(agentDiscard.status, 403);
    assert(await AuthoredExploration.exists({ userId: owner._id, pageId: page._id, claimId: claimOne }));
    const ownerDiscard = await request(base, claimPath(claimOne), {
      method: 'DELETE', body: { expectedRevision: 4 }
    });
    assert.equal(ownerDiscard.status, 204);
    assert.equal(await AuthoredExploration.exists({ userId: owner._id, pageId: page._id, claimId: claimOne }), null);
    checks.push('Foreign discard was harmless, agent authentication was rejected, and the human owner CAS delete removed only the intended exploration.');

    const wikiAfterDoc = await WikiPage.findById(page._id).lean();
    const wikiAfter = JSON.stringify({ claims: wikiAfterDoc.claims, sourceRefs: wikiAfterDoc.sourceRefs, citations: wikiAfterDoc.citations, body: wikiAfterDoc.body, plainText: wikiAfterDoc.plainText });
    assert.equal(wikiAfter, wikiBefore);
    checks.push('The accepted Wiki claims, citations, sources, body, and text were byte-for-byte unchanged.');

    // Library authorship uses the same CAS and Keep protocol without a Wiki.
    const libraryPath = `/api/library/articles/${source._id}/highlights/${highlightId}/exploration`;
    const libraryDraft = { title: 'An experiment from reading', writing: 'Keep a second attempt possible.', originalText: source.highlights[0].text, question: 'What closes the door?', returnNote: 'Try a counterexample.' };
    const pageCount = await WikiPage.countDocuments({ userId: owner._id });
    const effectsBeforeLibrary = JSON.stringify(counters);
    const librarySave = await request(base, libraryPath, { method: 'PUT', body: { expectedRevision: 0, mutationId: 'library-first', draft: libraryDraft } });
    assert.equal(librarySave.status, 201, JSON.stringify(librarySave.payload));
    assert.equal(librarySave.payload.exploration.articleId, String(source._id));
    assert.equal(librarySave.payload.exploration.claimId, '');
    assert.equal(librarySave.payload.exploration.pageId, '');
    assert.equal(JSON.stringify(counters), effectsBeforeLibrary);
    assert.equal(await WikiPage.countDocuments({ userId: owner._id }), pageCount);
    const secondHighlight = new mongoose.Types.ObjectId();
    await Article.updateOne({ _id: source._id }, { $push: { highlights: { _id: secondHighlight, text: 'A second saved passage.' } } });
    const secondLibrary = await request(base, `/api/library/articles/${source._id}/highlights/${secondHighlight}/exploration`, { method: 'PUT', body: { expectedRevision: 0, mutationId: 'library-second', draft: { writing: 'A distinct thought.', originalText: 'A second saved passage.' } } });
    assert.equal(secondLibrary.status, 201, JSON.stringify(secondLibrary.payload));
    assert.equal((await request(base, libraryPath, { method: 'PUT', body: { expectedRevision: 0, mutationId: 'stale-library', draft: libraryDraft } })).status, 409);
    assert.equal((await request(base, libraryPath, { method: 'PUT', token: FOREIGN_TOKEN, body: { expectedRevision: 0, mutationId: 'foreign-library', draft: libraryDraft } })).status, 404);
    assert.equal((await request(base, `/api/library/articles/${source._id}/explorations`, { token: AGENT_TOKEN })).status, 403);
    const libraryLoad = await request(base, `/api/library/articles/${source._id}/explorations`);
    assert.equal(libraryLoad.payload.explorations.length, 2);
    const recentLibrary = await request(base, '/api/authored-explorations');
    assert(recentLibrary.payload.explorations.some(row => row.articleId === String(source._id) && row.highlightId === String(highlightId)));
    const libraryKeep = await request(base, `${libraryPath}/keep`, { method: 'POST', body: { expectedRevision: 1, mutationId: 'library-keep', destination: 'notebook' } });
    assert.equal(libraryKeep.status, 200, JSON.stringify(libraryKeep.payload));
    const keptLibraryNote = await NotebookEntry.findById(libraryKeep.payload.targetId).lean();
    assert.equal(keptLibraryNote.content, libraryDraft.writing);
    assert.equal(keptLibraryNote.importMeta.sourceUrl, `/library?articleId=${source._id}&highlightId=${highlightId}&exploration=1`);
    assert(keptLibraryNote.blocks.some(block => block.text === source.highlights[0].text && String(block.articleId) === String(source._id)));
    const libraryLater = await request(base, libraryPath, { method: 'PUT', body: { expectedRevision: 2, mutationId: 'library-later', draft: { ...libraryDraft, writing: 'The next attempt is part of the design.' } } });
    assert.equal(libraryLater.status, 200, JSON.stringify(libraryLater.payload));
    const libraryRetry = await request(base, `${libraryPath}/keep`, { method: 'POST', body: { expectedRevision: 3, mutationId: 'library-keep', destination: 'notebook' } });
    assert.equal(libraryRetry.payload.targetId, libraryKeep.payload.targetId);
    assert.equal((await NotebookEntry.findById(libraryKeep.payload.targetId).lean()).content, libraryDraft.writing);
    const libraryQuestion = await request(base, `${libraryPath}/keep`, { method: 'POST', body: { expectedRevision: 3, mutationId: 'library-question', destination: 'question' } });
    assert.equal(libraryQuestion.status, 200, JSON.stringify(libraryQuestion.payload));
    assert.equal((await request(base, libraryPath, { method: 'DELETE', body: { expectedRevision: 3 } })).status, 409);
    assert.equal((await request(base, libraryPath, { method: 'DELETE', body: { expectedRevision: 4 } })).status, 204);
    assert(await NotebookEntry.exists({ _id: libraryKeep.payload.targetId }));
    checks.push('Library passages saved without Wiki pages or private-draft queue effects; separate highlights coexist, foreign/agent access is denied, CAS preserves conflicts, and Notebook/Question Keeps retain exact sources and independent snapshots.');

    // Removing a mark never transfers its work to a similar new mark.
    {
      const recoveryKey = { userId: owner._id, articleId: source._id, highlightId: secondHighlight };
      const beforeRecovery = JSON.stringify(await AuthoredExploration.findOne(recoveryKey).lean());
      await Article.updateOne({ _id: source._id }, { $pull: { highlights: { _id: secondHighlight } } });
      await Article.updateOne({ _id: source._id }, { $push: { highlights: { text: 'A second saved passage.' } } });
      const recoveryArticle = JSON.stringify(await Article.findById(source._id).lean());
      const beforeRecoveryEffects = JSON.stringify(counters);
      const missingPath = `/api/library/articles/${source._id}/highlights/${secondHighlight}/exploration`;
      const recovered = await request(base, `/api/library/articles/${source._id}/explorations`);
      const earlier = recovered.payload.explorations.find(row => row.highlightId === String(secondHighlight));
      assert.equal(earlier.originStale, true);
      assert.equal(earlier.draft.originalText, 'A second saved passage.');
      assert.equal(earlier.draft.writing, 'A distinct thought.');
      const recoverySearch = await request(base, '/api/authored-work/search?q=A%20distinct%20thought');
      assert(recoverySearch.payload.results.some(row => row.highlightId === String(secondHighlight) && row.originMissing));
      const recoveryShelf = await request(base, '/api/authored-explorations');
      assert(recoveryShelf.payload.explorations.some(row => row.highlightId === String(secondHighlight) && row.originMissing));
      assert.equal((await request(base, `/api/library/articles/${source._id}/explorations`, { token: FOREIGN_TOKEN })).status, 404);
      assert.equal((await request(base, `/api/library/articles/${source._id}/explorations`, { token: AGENT_TOKEN })).status, 403);
      const changedOrigin = await request(base, missingPath, { method: 'PUT', body: { expectedRevision: 1, mutationId: 'missing-save', draft: earlier.draft } });
      assert.equal(changedOrigin.payload.code, 'stale_origin');
      const newKeep = await request(base, `${missingPath}/keep`, { method: 'POST', body: { expectedRevision: 1, mutationId: 'missing-keep', destination: 'notebook' } });
      assert.equal(newKeep.payload.code, 'stale_origin');
      assert.equal(JSON.stringify(await AuthoredExploration.findOne(recoveryKey).lean()), beforeRecovery);
      assert.equal(JSON.stringify(await Article.findById(source._id).lean()), recoveryArticle);
      assert.equal(JSON.stringify(counters), beforeRecoveryEffects);
      assert.equal((await request(base, missingPath, { method: 'DELETE', token: FOREIGN_TOKEN, body: { expectedRevision: 1 } })).status, 204);
      assert(await AuthoredExploration.exists(recoveryKey));
      assert.equal((await request(base, missingPath, { method: 'DELETE', body: { expectedRevision: 2 } })).status, 409);
      assert.equal((await request(base, missingPath, { method: 'DELETE', body: { expectedRevision: 1 } })).status, 204);
      assert(!(await AuthoredExploration.exists(recoveryKey)));
      checks.push('Missing Library highlights remain discoverable and recover their exact saved words/quotation without writes or effects; identical replacement marks do not inherit work, foreign/agent reads are denied, stale saves/new Keeps are rejected, and owner-only CAS Discard remains explicit.');
  
    }

    // Discovery must search before taking a result window, not filter a loaded shelf.
    const needle = `[room + time] ${runId}`;
    const archiveNote = await NotebookEntry.create({ userId: owner._id, title: 'Untitled', content: '', blocks: [
      { id: crypto.randomUUID(), type: 'paragraph', text: '' },
      { id: crypto.randomUUID(), type: 'paragraph', text: 'An opening I did not name.' },
      { id: crypto.randomUUID(), type: 'paragraph', text: `A much later sentence remembers ${needle}.` }
    ] });
    await NotebookEntry.updateOne({ _id: archiveNote._id }, { $set: { updatedAt: new Date('2020-01-01') } }, { timestamps: false });
    await NotebookEntry.insertMany(Array.from({ length: 125 }, (_, n) => ({ userId: owner._id, title: `discovery-batch-${runId} ${n}`, content: '', blocks: [] })));
    await NotebookEntry.create({ userId: foreign._id, title: needle, blocks: [] });
    await NotebookEntry.create({ userId: owner._id, title: needle, archived: true, blocks: [] });
    await NotebookEntry.create({ userId: owner._id, title: needle, debugOnly: true, blocks: [] });
    const questionWork = await AuthoredExploration.create({ userId: owner._id, pageId: page._id, claimId: `discovery-question-${runId}`, draft: { title: 'A question held open', question: `What would leave room for ${needle}?` } });
    await AuthoredExploration.create({ userId: owner._id, pageId: page._id, claimId: `discovery-source-${runId}`, draft: { title: 'Source text is not private writing', originalText: needle, provisionalText: needle } });
    await AuthoredExploration.create({ userId: foreign._id, pageId: page._id, claimId: `discovery-foreign-${runId}`, draft: { writing: needle } });
    await AuthoredExploration.create({ userId: owner._id, pageId: new mongoose.Types.ObjectId(), claimId: `discovery-gone-${runId}`, draft: { writing: needle } });
    const archivedSource = await Article.create({ userId: owner._id, url: `https://acceptance.invalid/${runId}/archived`, title: 'Archived origin', archived: true, highlights: [{ text: 'An archived source passage.' }] });
    created.articleIds.push(archivedSource._id);
    await AuthoredExploration.create({ userId: owner._id, articleId: archivedSource._id, highlightId: archivedSource.highlights[0]._id, draft: { writing: needle } });
    const beforeSearch = JSON.stringify(await NotebookEntry.findById(archiveNote._id).lean());
    const beforeWorkSearch = JSON.stringify(await AuthoredExploration.findById(questionWork._id).lean());
    const beforeSearchEffects = JSON.stringify(counters);
    const discovery = await request(base, `/api/authored-work/search?q=${encodeURIComponent(needle)}`);
    assert.equal(discovery.status, 200, JSON.stringify(discovery.payload));
    assert.deepEqual(discovery.payload.results.map(row => row.id).sort(), [String(archiveNote._id), String(questionWork._id)].sort());
    assert.equal(discovery.payload.results.find(row => row.kind === 'exploration').label, 'Question');
    const recent = await request(base, '/api/notebook?summary=1&compact=1&limit=120');
    assert.equal(recent.status, 200, JSON.stringify(recent.payload));
    assert(!recent.payload.some(row => row._id === String(archiveNote._id)), 'the searched note must be beyond the loaded shelf');
    const allSummaries = await request(base, '/api/notebook?summary=1&compact=1&limit=500');
    const preview = allSummaries.payload.find(row => row._id === String(archiveNote._id));
    assert.equal(preview.snippet, 'An opening I did not name.');
    assert.equal(preview.title, 'Untitled');
    assert(!('content' in preview) && !('blocks' in preview) && !('snippetHtml' in preview));
    const limited = await request(base, `/api/authored-work/search?q=discovery-batch-${runId}`);
    assert.equal(limited.payload.results.length, 20);
    assert.equal(limited.payload.limited, true);
    assert.equal((await request(base, `/api/authored-work/search?q=${encodeURIComponent(needle)}`, { token: AGENT_TOKEN })).status, 403);
    const foreignSearch = await request(base, `/api/authored-work/search?q=${encodeURIComponent(needle)}`, { token: FOREIGN_TOKEN });
    assert(foreignSearch.payload.results.every(row => ![String(archiveNote._id), String(questionWork._id)].includes(row.id)));
    assert.equal(JSON.stringify(await NotebookEntry.findById(archiveNote._id).lean()), beforeSearch);
    assert.equal(JSON.stringify(await AuthoredExploration.findById(questionWork._id).lean()), beforeWorkSearch);
    assert.equal(JSON.stringify(counters), beforeSearchEffects);
    checks.push('Writing discovery finds a literal phrase in an older note beyond 120 summaries and in a private question, suppresses foreign/archived/debug/source-only/unavailable work, bounds results to 20, denies agent credentials, preserves titles/revisions, returns plain first-text previews, and emits no save effects.');

    report = {
      status: 'pass',
      runId,
      database: 'noeis_authorship_qa',
      expressPort: Number(new URL(base).port),
      modelCalls: 0,
      network: '127.0.0.1 only',
      command: 'node scripts/run_authorship_acceptance.js',
      counters,
      durableQueues: {
        embeddingJobs: await EmbeddingJob.countDocuments({ 'payload.userId': String(owner._id) }),
        sourceEvents: await WikiSourceEvent.countDocuments({ userId: owner._id })
      },
      checks
    };
  } catch (error) {
    report = { status: 'fail', runId, database: 'noeis_authorship_qa', modelCalls: 0, error: error.stack || error.message, checks };
    throw error;
  } finally {
    if (server) await close(server);
    const cleanupDeletes = await Promise.all([
      WikiSourceEvent.deleteMany({ userId: { $in: created.userIds } }),
      EmbeddingJob.deleteMany({ 'payload.userId': { $in: created.userIds.map(String) } }),
      AuthoredExploration.deleteMany({ userId: { $in: created.userIds } }),
      NotebookEntry.deleteMany({ userId: { $in: created.userIds } }),
      Question.deleteMany({ userId: { $in: created.userIds } }),
      Article.deleteMany({ _id: { $in: created.articleIds } }),
      WikiPage.deleteMany({ _id: { $in: created.pageIds } }),
      User.deleteMany({ _id: { $in: created.userIds } })
    ]);
    const cleanupRemaining = await Promise.all([
      WikiSourceEvent.countDocuments({ userId: { $in: created.userIds } }),
      EmbeddingJob.countDocuments({ 'payload.userId': { $in: created.userIds.map(String) } }),
      AuthoredExploration.countDocuments({ userId: { $in: created.userIds } }),
      NotebookEntry.countDocuments({ userId: { $in: created.userIds } }),
      Question.countDocuments({ userId: { $in: created.userIds } }),
      Article.countDocuments({ _id: { $in: created.articleIds } }),
      WikiPage.countDocuments({ _id: { $in: created.pageIds } }),
      User.countDocuments({ _id: { $in: created.userIds } })
    ]);
    const cleanupComplete = cleanupRemaining.every((count) => count === 0);
    report.cleanup = {
      complete: cleanupComplete,
      deleted: cleanupDeletes.reduce((sum, result) => sum + result.deletedCount, 0),
      remaining: cleanupRemaining.reduce((sum, count) => sum + count, 0)
    };
    if (!cleanupComplete) {
      report.status = 'fail';
      report.error = 'Run-scoped acceptance records were not completely removed.';
      process.exitCode = 1;
    }
    await mongoose.disconnect();
    const outputDir = path.resolve(__dirname, '..', 'tmp', 'authorship-acceptance');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${runId}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...report, report: outputPath }, null, 2));
  }
};

run().catch(() => { process.exitCode = 1; });
