const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { WikiPage } = require('../models');
const { comesDue } = require('./judgmentResolutionService');

const reader = new mongoose.Types.ObjectId();
const now = new Date('2026-10-20T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
let mongo;

const view = (title, judgment = {}, page = {}) => WikiPage.create({
  userId: reader,
  title,
  slug: title.toLowerCase(),
  ...page,
  judgment: {
    currentJudgment: `${title} will hold.`,
    resolutionCriteria: `${title} is still true in a year.`,
    ...judgment
  }
});

test.before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
test.after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
test.beforeEach(() => WikiPage.deleteMany({}));

test('the view that has waited longest past its date comes back, with its test', async () => {
  await view('Recent', { resolutionHorizonAt: new Date(now - day) });
  const oldest = await view('Oldest', { resolutionHorizonAt: new Date(now - 9 * day) });
  const due = await comesDue({ userId: reader, WikiPage, now });
  assert.deepEqual(due, {
    pageId: String(oldest._id),
    view: 'Oldest will hold.',
    test: 'Oldest is still true in a year.',
    by: oldest.judgment.resolutionHorizonAt
  });
});

test('nothing comes back before its date, once judged, set aside, or archived', async () => {
  await view('Early', { resolutionHorizonAt: new Date(now.getTime() + day) });
  await view('Undated');
  await view('Parked', { status: 'parked', resolutionHorizonAt: new Date(now - day) });
  await view('Archived', { resolutionHorizonAt: new Date(now - day) }, { status: 'archived' });
  await WikiPage.collection.insertOne({
    userId: reader,
    title: 'Judged',
    judgment: {
      currentJudgment: 'Judged will hold.',
      resolutionHorizonAt: new Date(now - day),
      verdicts: [{ result: 'held_up', recordedAt: now }]
    }
  });
  assert.equal(await comesDue({ userId: reader, WikiPage, now }), null);
  assert.equal(await comesDue({ userId: new mongoose.Types.ObjectId(), WikiPage, now }), null);
});
