const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Article, User, WikiSourceEvent } = require('../../models');
const { buildImportRouter } = require('../importRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});

const key = crypto.randomBytes(24);
const env = { INBOUND_EMAIL_ADDRESS: 'read@noeis.io', INBOUND_EMAIL_WEBHOOK_SECRET: `whsec_${key.toString('base64')}` };

const signedPost = (url, payload, { secret = key } = {}) => {
  const body = JSON.stringify(payload);
  const id = `msg_${crypto.randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');
  return fetch(`${url}/api/import/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
    body
  }).then(async response => ({ status: response.status, body: await response.json() }));
};

const forward = (overrides = {}) => ({
  type: 'email.received',
  data: {
    email_id: 'e1',
    from: 'Reader <reader@example.com>',
    to: ['read@noeis.io'],
    subject: 'Fwd: The Fund Ate Itself',
    message_id: '<fwd-1@mail.example>',
    created_at: '2025-10-08T10:00:00.000Z',
    text: [
      '---------- Forwarded message ---------',
      'From: Matt Levine <noreply@bloomberg.example>',
      'Date: Tue, Oct 7, 2025 at 9:02 AM',
      'Subject: The Fund Ate Itself',
      '',
      'A fund bought its own shares until nothing else was left.'
    ].join('\n'),
    ...overrides
  }
});

const run = async () => {
  // Local ephemeral MongoDB only. Never the application database.
  const memory = await MongoMemoryServer.create();
  await mongoose.connect(memory.getUri());
  const reader = await User.create({
    username: 'reader',
    password: 'x',
    morningPaper: { email: 'reader@example.com', emailConfirmedAt: new Date() }
  });
  await User.create({ username: 'unconfirmed', password: 'x', morningPaper: { email: 'stranger@example.com' } });

  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  const routerWith = (routerEnv) => buildImportRouter({
    authenticateToken: (_req, res) => res.status(401).end(),
    upload: { single: () => (_req, _res, next) => next() },
    Article,
    User,
    WikiSourceEvent,
    env: routerEnv,
    enqueueArticleEmbedding: () => null
  });
  app.use('/on', routerWith(env));
  app.use('/off', routerWith({}));
  const { server, url } = await listen(app);

  try {
    // Off until both variables are set.
    assert.equal((await signedPost(`${url}/off`, forward())).status, 404);

    // A forged or missing signature is the one refusal.
    assert.equal((await signedPost(`${url}/on`, forward(), { secret: crypto.randomBytes(24) })).status, 401);

    // The confirmed sender's forward lands in their Library with its byline,
    // marked as having come in by email, and goes down the save path.
    const saved = await signedPost(`${url}/on`, forward());
    assert.deepEqual(saved.body.status, 'saved');
    const article = await Article.findById(saved.body.articleId).lean();
    assert.equal(String(article.userId), String(reader._id));
    assert.equal(article.title, 'The Fund Ate Itself');
    assert.equal(article.author, 'Matt Levine');
    assert.equal(article.publicationDate, '2025-10-07');
    assert.equal(article.content, '<p>A fund bought its own shares until nothing else was left.</p>');
    assert.equal(article.url, 'email://fwd-1@mail.example');
    assert.equal(article.importMeta.provider, 'email');
    assert.equal(article.importMeta.externalId, 'fwd-1@mail.example');
    assert.ok(article.importMeta.importedAt);
    const events = await WikiSourceEvent.find({ sourceObjectId: article._id }).lean();
    assert.equal(events.length, 1);
    assert.equal(events[0].sourceType, 'article');

    // The provider retries; the Message-ID makes the second delivery a no-op.
    assert.equal((await signedPost(`${url}/on`, forward())).body.status, 'duplicate');
    assert.equal(await Article.countDocuments({ userId: reader._id }), 1);

    // A mail filter keeps the newsletter as sender and the reader as recipient.
    const filtered = await signedPost(`${url}/on`, forward({
      from: '"Jane Doe from Quiet Habits" <quiethabits@substack.example>',
      to: ['reader@example.com'],
      subject: 'Quiet compounding',
      message_id: '<substack-1@mail.example>',
      text: 'Most change is invisible from the inside.'
    }));
    assert.equal(filtered.body.status, 'saved');
    const habit = await Article.findById(filtered.body.articleId).lean();
    assert.deepEqual([habit.author, habit.siteName, habit.publicationDate], ['Jane Doe', 'Quiet Habits', '2025-10-08']);

    // Unknown and unconfirmed senders are dropped quietly, with a 200 so the
    // provider does not retry.
    for (const from of ['nobody@example.com', 'stranger@example.com']) {
      const dropped = await signedPost(`${url}/on`, forward({ from, to: ['read@noeis.io'], message_id: `<${from}>` }));
      assert.deepEqual([dropped.status, dropped.body.status], [200, 'dropped']);
    }
    assert.equal(await Article.countDocuments({}), 2);

    // Other webhook events are acknowledged and ignored.
    assert.equal((await signedPost(`${url}/on`, { type: 'email.sent', data: {} })).body.status, 'ignored');
  } finally {
    server.close();
    await mongoose.disconnect();
    await memory.stop();
  }
};

run().then(() => console.log('email-in route tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
