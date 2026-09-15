const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedQuestionRouter } = require('../sharedQuestionRoutes');
const {
  BRIEF_NEEDS_READING,
  SUCCESSION_NEEDS_UNRESOLVED,
  MANDATE_NEEDS_FIELDS,
  CONTRIBUTION_LIMIT,
  CONTRIBUTION_HELD,
  CONTRIBUTION_TAKE_CHANGED,
  CONTRIBUTION_TAKEN_BACK,
  SHARE_RECORD_COLLISION_MANDATE,
  SHARE_RECORD_COLLISION_SUCCESSION,
  hashPublicQuestion,
  projectPublicQuestion
} = require('../../services/authoredThinkShare');
const { AGENT_MANDATE_PAUSE, AGENT_MANDATE_TOOLS } = require('../../services/governedResearch');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const matchesValue = (actual, expected) => {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected == null) return actual == null;
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, '$exists')) {
      const exists = actual !== undefined && actual !== null;
      return expected.$exists ? exists : !exists;
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
      return expected.$in.some((value) => value === actual || (value == null && (actual == null || actual === '')));
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) {
      return actual !== expected.$ne;
    }
    try {
      return JSON.stringify(actual ?? null) === JSON.stringify(expected);
    } catch (_error) {
      return false;
    }
  }
  return String(actual || '') === String(expected || '');
};

const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === '$or') return expected.some((clause) => matchesQuery(row, clause));
  if (key === '$and') return expected.every((clause) => matchesQuery(row, clause));
  return matchesValue(row[key], expected);
});

class Query {
  constructor(value) {
    this.value = value;
  }

  select() {
    return this;
  }

  lean() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const createModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find((item) => matchesQuery(item, query));
      return new Query(row || null);
    },
    findById(id) {
      const row = rows.find((item) => String(item._id || '') === String(id || ''));
      return new Query(row || null);
    },
    async create(payload = {}) {
      const now = new Date();
      const row = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: now,
        updatedAt: now,
        ...payload
      };
      rows.push(row);
      return row;
    },
    async findOneAndDelete(query = {}) {
      const index = rows.findIndex((item) => matchesQuery(item, query));
      if (index < 0) return null;
      const [removed] = rows.splice(index, 1);
      return removed;
    },
    async findOneAndUpdate(query = {}, update = {}, options = {}) {
      if (update?.$inc && Object.prototype.hasOwnProperty.call(update.$inc, 'contributionCount')) {
        const slug = String(query.slug || '').trim();
        const row = rows.find((item) => item.slug === slug && item.snapshot);
        if (!row) return null;
        const delta = Number(update.$inc.contributionCount) || 0;
        const count = Number(row.contributionCount || 0);
        if (delta > 0 && count >= CONTRIBUTION_LIMIT) return null;
        if (delta < 0 && count <= 0) return null;
        row.contributionCount = Math.max(0, count + delta);
        return options.new === false ? null : row;
      }
      let row = rows.find((item) => matchesQuery(item, query));
      if (!row) {
        if (!options.upsert) return null;
        row = {
          _id: new mongoose.Types.ObjectId().toString(),
          createdAt: new Date(),
          updatedAt: new Date()
        };
        rows.push(row);
      }
      Object.assign(row, update.$set || update);
      return options.new === false ? null : row;
    },
    async deleteMany(query = {}) {
      const kept = rows.filter((item) => !matchesQuery(item, query));
      const deletedCount = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { deletedCount };
    },
    find(query = {}) {
      const found = rows.filter((item) => matchesQuery(item, query));
      return {
        sort() {
          return {
            lean: async () => found
          };
        },
        lean: async () => found
      };
    }
  };
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
};

const holdShareWrites = (model, shareId) => {
  const original = model.findOneAndUpdate;
  let started = 0;
  let release = () => {};
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  model.findOneAndUpdate = async (query, update, options) => {
    if (String(query._id) === String(shareId)) {
      started += 1;
      if (started >= 2) release();
      await ready;
    }
    return original.call(model, query, update, options);
  };
  return () => {
    model.findOneAndUpdate = original;
  };
};

const run = async () => {
  const SharedQuestion = createModel();
  const QuestionContribution = createModel();
  const QuestionPresence = createModel();
  const Question = createModel();
  const User = createModel();
  const userId = new mongoose.Types.ObjectId().toString();
  const contributorId = new mongoose.Types.ObjectId().toString();
  const otherContributorId = new mongoose.Types.ObjectId().toString();
  const strangerId = new mongoose.Types.ObjectId().toString();
  const questionId = new mongoose.Types.ObjectId().toString();

  await User.create({ _id: userId, displayName: 'Owner' });
  const question = await Question.create({
    _id: questionId,
    userId,
    text: 'What survives compounding?',
    status: 'open',
    conceptName: 'Compounding',
    blocks: [
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
      { id: 'p2', type: 'paragraph', text: 'Another authored paragraph.' },
      { id: 'h1', type: 'highlight-ref', text: 'secret highlight' },
      {
        id: 'private-excerpt',
        type: 'paragraph',
        text: 'An exact excerpt from the owner Library.',
        articleId: new mongoose.Types.ObjectId().toString(),
        articleTitle: 'Private source',
        sourcePath: '/library?articleId=private#passage=exact'
      }
    ]
  });

  const app = express();
  app.use(express.json());
  const asUser = (id) => ({ 'x-user-id': id });
  app.use(buildSharedQuestionRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: String(req.headers['x-user-id'] || userId) };
      if (req.headers['x-agent-token']) req.agentToken = true;
      next();
    },
    optionalAuthenticateToken: (req, _res, next) => {
      const viewer = String(req.headers['x-user-id'] || '').trim();
      if (viewer) req.user = { id: viewer };
      if (req.headers['x-agent-token']) req.agentToken = true;
      next();
    },
    SharedQuestion,
    QuestionContribution,
    QuestionPresence,
    Question,
    User
  }));

  const server = await listen(app);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const agent = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      headers: { 'x-agent-token': '1' }
    });
    assert.strictEqual(agent.response.status, 403);

    const before = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(before.response.status, 200);
    assert.strictEqual(before.body.shared, false);
    assert.ok(before.body.currentHash);

    const staleMint = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ previewHash: 'nope' })
    });
    assert.strictEqual(staleMint.response.status, 409);

    const mint = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ previewHash: before.body.currentHash })
    });
    assert.strictEqual(mint.response.status, 201);
    assert.ok(mint.body.slug);
    assert.ok(mint.body.snapshot);
    assert.strictEqual(mint.body.snapshot.question.text, 'What survives compounding?');

    const publicRead = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicRead.response.status, 200);
    assert.strictEqual(publicRead.body.question.text, 'What survives compounding?');
    assert.deepStrictEqual(publicRead.body.contributions, []);
    assert.deepStrictEqual(mint.body.contributions, []);
    const tooSoonBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      body: JSON.stringify({ agreement: 'Too soon.' })
    });
    assert.strictEqual(tooSoonBrief.response.status, 409);
    assert.strictEqual(tooSoonBrief.body.error, BRIEF_NEEDS_READING);
    assert.ok(!publicRead.body.brief);
    assert.ok(!publicRead.body.here);
    assert.deepStrictEqual(publicRead.body.question.paragraphs, [
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
      { id: 'p2', type: 'paragraph', text: 'Another authored paragraph.' }
    ]);
    assert.ok(!JSON.stringify(publicRead.body).includes('exact excerpt'));
    assert.ok(!JSON.stringify(publicRead.body).includes('secret highlight'));
    assert.strictEqual(
      hashPublicQuestion(projectPublicQuestion(question, 'Owner')),
      mint.body.contentHash
    );

    const offer = (targetSlug, body, headers = {}) => fetchJson(`${base}/api/public/questions/${targetSlug}/contributions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const publicGet = (targetSlug, headers = {}) => fetchJson(
      `${base}/api/public/questions/${targetSlug}`,
      { headers }
    );

    const nameless = await offer(mint.body.slug, { text: 'Patience is not avoidance.' });
    assert.strictEqual(nameless.response.status, 400);

    const empty = await offer(mint.body.slug, { by: 'Mara', text: '   ' });
    assert.strictEqual(empty.response.status, 400);

    const reading = await offer(mint.body.slug, {
      by: ' <em>Mara</em> ',
      text: '<p>Same fact, different time horizon.</p>',
      remainder: 'Who pays when the window closes?',
      articleId: 'secret',
      sourcePath: '/library?articleId=secret'
    }, asUser(contributorId));
    assert.strictEqual(reading.response.status, 201, JSON.stringify(reading.body));
    assert.deepStrictEqual(reading.body, { sent: true });
    assert.strictEqual(QuestionContribution.rows[0].contributorUserId, contributorId);
    assert.strictEqual(String(QuestionContribution.rows[0].userId), String(userId));

    const together = await publicGet(mint.body.slug);
    assert.strictEqual(together.body.question.text, 'What survives compounding?');
    assert.deepStrictEqual(together.body.contributions, []);
    assert.ok(!together.body.waiting);
    assert.ok(!together.body.yours);
    assert.ok(!together.body.snapshot);

    const yours = await publicGet(mint.body.slug, asUser(contributorId));
    assert.deepStrictEqual(yours.body.contributions, []);
    assert.strictEqual(yours.body.yours[0].text, 'Same fact, different time horizon.');
    assert.strictEqual(yours.body.yours[0].remainder, 'Who pays when the window closes?');
    assert.ok(!yours.body.waiting);
    assert.ok(!JSON.stringify(yours.body).includes(contributorId));
    assert.ok(!JSON.stringify(yours.body).includes('secret'));

    const strangerPage = await publicGet(mint.body.slug, asUser(strangerId));
    assert.deepStrictEqual(strangerPage.body.contributions, []);
    assert.ok(!strangerPage.body.yours);
    assert.ok(!strangerPage.body.waiting);

    const ownerPublic = await publicGet(mint.body.slug, asUser(userId));
    assert.ok(!ownerPublic.body.yours);
    assert.ok(!ownerPublic.body.waiting);

    const other = await offer(mint.body.slug, {
      by: 'Ada',
      text: 'Another held reading.'
    }, asUser(otherContributorId));
    assert.strictEqual(other.response.status, 201);
    const otherYours = await publicGet(mint.body.slug, asUser(otherContributorId));
    assert.strictEqual(otherYours.body.yours.length, 1);
    assert.strictEqual(otherYours.body.yours[0].text, 'Another held reading.');
    const stillYours = await publicGet(mint.body.slug, asUser(contributorId));
    assert.strictEqual(stillYours.body.yours.length, 1);
    assert.strictEqual(stillYours.body.yours[0].text, 'Same fact, different time horizon.');
    const unsignedStill = await publicGet(mint.body.slug);
    assert.ok(!unsignedStill.body.yours);

    const withdrawerId = new mongoose.Types.ObjectId().toString();
    const extra = await offer(mint.body.slug, {
      by: 'Nia',
      text: 'I will take this back.'
    }, asUser(withdrawerId));
    assert.strictEqual(extra.response.status, 201);
    const extraWaiting = await fetchJson(`${base}/api/questions/${questionId}/share`);
    const extraId = extraWaiting.body.waiting.find((row) => row.text === 'I will take this back.').id;
    const countBefore = SharedQuestion.rows[0].contributionCount;

    const unsignedWithdraw = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${extraId}`,
      { method: 'DELETE' }
    );
    assert.strictEqual(unsignedWithdraw.response.status, 404);

    const strangerWithdraw = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${extraId}`,
      { method: 'DELETE', headers: asUser(strangerId) }
    );
    assert.strictEqual(strangerWithdraw.response.status, 404);

    const ownerWithdraw = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${extraId}`,
      { method: 'DELETE', headers: asUser(userId) }
    );
    assert.strictEqual(ownerWithdraw.response.status, 404);

    const agentWithdraw = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${extraId}`,
      { method: 'DELETE', headers: { ...asUser(withdrawerId), 'x-agent-token': '1' } }
    );
    assert.strictEqual(agentWithdraw.response.status, 403);

    const takeBack = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${extraId}`,
      { method: 'DELETE', headers: asUser(withdrawerId) }
    );
    assert.strictEqual(takeBack.response.status, 200, JSON.stringify(takeBack.body));
    assert.deepStrictEqual(takeBack.body, { withdrawn: true });
    assert.strictEqual(SharedQuestion.rows[0].contributionCount, countBefore - 1);
    const afterHeldWithdraw = await publicGet(mint.body.slug, asUser(withdrawerId));
    assert.ok(!afterHeldWithdraw.body.yours);
    const placeTakenBack = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${extraId}/place`,
      { method: 'POST' }
    );
    assert.strictEqual(placeTakenBack.response.status, 409);
    assert.strictEqual(placeTakenBack.body.error, CONTRIBUTION_TAKEN_BACK);
    assert.strictEqual(placeTakenBack.body.field, 'withdrawn');
    const ownerAfterTakeBack = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.ok(!ownerAfterTakeBack.body.waiting?.some((row) => row.id === extraId));
    assert.ok(!JSON.stringify(ownerAfterTakeBack.body).includes('withdrawnAt'));
    const publicAfterTakeBack = await publicGet(mint.body.slug);
    assert.ok(!publicAfterTakeBack.body.contributions?.some((row) => row.id === extraId));
    assert.ok(!JSON.stringify(publicAfterTakeBack.body).includes('withdrawnAt'));
    const againOffer = await offer(mint.body.slug, {
      by: 'Nia',
      text: 'A second try.'
    }, asUser(withdrawerId));
    assert.strictEqual(againOffer.response.status, 201);
    const niaWaiting = await fetchJson(`${base}/api/questions/${questionId}/share`);
    const niaId = niaWaiting.body.waiting.find((row) => row.text === 'A second try.').id;
    const niaBack = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${niaId}`,
      { method: 'DELETE', headers: asUser(withdrawerId) }
    );
    assert.strictEqual(niaBack.response.status, 200);

    const strangerShare = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      headers: asUser(strangerId)
    });
    assert.strictEqual(strangerShare.response.status, 404);

    const strangerRevoke = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'DELETE',
      headers: asUser(strangerId)
    });
    assert.strictEqual(strangerRevoke.response.status, 404);
    const strangerUpdate = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'PUT',
      headers: asUser(strangerId),
      body: JSON.stringify({ previewHash: mint.body.currentHash })
    });
    assert.strictEqual(strangerUpdate.response.status, 404);

    const ownerSees = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.deepStrictEqual(ownerSees.body.contributions, []);
    assert.strictEqual(ownerSees.body.waiting[0].text, 'Same fact, different time horizon.');
    assert.strictEqual(ownerSees.body.waiting[0].remainder, 'Who pays when the window closes?');
    assert.strictEqual(ownerSees.body.waiting[1].text, 'Another held reading.');
    assert.ok(!JSON.stringify(ownerSees.body.waiting).includes('secret'));
    assert.ok(!ownerSees.body.snapshot.contributions);
    assert.ok(!ownerSees.body.snapshot.waiting);
    assert.ok(!ownerSees.body.yours);

    const contributionId = ownerSees.body.waiting[0].id;
    const otherId = ownerSees.body.waiting[1].id;
    const contributorPlace = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}/place`,
      {
        method: 'POST',
        headers: asUser(contributorId)
      }
    );
    assert.strictEqual(contributorPlace.response.status, 404);

    const contributorTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        headers: asUser(contributorId),
        body: JSON.stringify({ interpretation: 'A contributor take.' })
      }
    );
    assert.strictEqual(contributorTake.response.status, 404);
    const earlyTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ interpretation: 'Too soon.' })
      }
    );
    assert.strictEqual(earlyTake.response.status, 409);
    assert.strictEqual(earlyTake.body.error, CONTRIBUTION_HELD);
    assert.strictEqual(earlyTake.body.field, 'held');

    const agentPlace = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}/place`,
      {
        method: 'POST',
        headers: { 'x-agent-token': '1' }
      }
    );
    assert.strictEqual(agentPlace.response.status, 403);

    const missingPlace = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/missing/place`,
      { method: 'POST' }
    );
    assert.strictEqual(missingPlace.response.status, 404);

    const placed = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}/place`,
      { method: 'POST' }
    );
    assert.strictEqual(placed.response.status, 200, JSON.stringify(placed.body));
    assert.strictEqual(placed.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.ok(placed.body.contributions[0].updatedAt);
    assert.strictEqual(placed.body.waiting[0].id, otherId);
    assert.strictEqual(placed.body.waiting[0].text, 'Another held reading.');
    assert.ok(!placed.body.snapshot.contributions);

    const again = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}/place`,
      { method: 'POST' }
    );
    assert.strictEqual(again.response.status, 200);
    assert.strictEqual(again.body.contributions[0].id, contributionId);

    const publicPlaced = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicPlaced.body.contributions.length, 1);
    assert.strictEqual(publicPlaced.body.contributions[0].by, 'Mara');
    assert.strictEqual(publicPlaced.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.strictEqual(publicPlaced.body.contributions[0].remainder, 'Who pays when the window closes?');
    assert.ok(!publicPlaced.body.contributions[0].updatedAt);
    assert.ok(!JSON.stringify(publicPlaced.body.contributions).includes('secret'));
    assert.ok(!JSON.stringify(publicPlaced.body.contributions).includes('library?'));
    assert.ok(!publicPlaced.body.waiting);
    assert.ok(!publicPlaced.body.yours);
    const placedYours = await publicGet(mint.body.slug, asUser(contributorId));
    assert.ok(!placedYours.body.yours);
    assert.strictEqual(placedYours.body.contributions[0].id, contributionId);
    assert.strictEqual(placedYours.body.contributions[0].mine, true);
    assert.ok(!publicPlaced.body.contributions[0].mine);
    const otherStillHeld = await publicGet(mint.body.slug, asUser(otherContributorId));
    assert.strictEqual(otherStillHeld.body.yours[0].id, otherId);
    assert.deepStrictEqual(otherStillHeld.body.contributions.map((row) => row.id), [contributionId]);

    const agentTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        headers: { 'x-agent-token': '1' },
        body: JSON.stringify({ interpretation: 'An agent take.' })
      }
    );
    assert.strictEqual(agentTake.response.status, 403);

    const missingTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/missing`,
      {
        method: 'PATCH',
        body: JSON.stringify({ interpretation: 'Gone.' })
      }
    );
    assert.strictEqual(missingTake.response.status, 404);

    const take = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          interpretation: '<em>The horizon is the claim, not the fact.</em>',
          articleId: 'secret',
          sourcePath: '/library?articleId=secret'
        })
      }
    );
    assert.strictEqual(take.response.status, 200, JSON.stringify(take.body));
    assert.strictEqual(take.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.strictEqual(take.body.contributions[0].remainder, 'Who pays when the window closes?');
    assert.strictEqual(take.body.contributions[0].interpretation, 'The horizon is the claim, not the fact.');
    assert.strictEqual(take.body.contributions[0].interpretedBy, 'Owner');
    assert.ok(!take.body.snapshot.interpretation);
    assert.ok(!take.body.snapshot.contributions);
    assert.ok(!JSON.stringify(take.body.contributions).includes('secret'));

    const takenPage = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(takenPage.body.contributions[0].interpretation, 'The horizon is the claim, not the fact.');
    assert.strictEqual(takenPage.body.contributions[0].interpretedBy, 'Owner');
    assert.strictEqual(takenPage.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.ok(!takenPage.body.interpretation);

    const clearTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ interpretation: '   ' })
      }
    );
    assert.strictEqual(clearTake.response.status, 200);
    assert.ok(!clearTake.body.contributions[0].interpretation);
    assert.strictEqual(clearTake.body.contributions[0].text, 'Same fact, different time horizon.');

    const retake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ interpretation: 'The horizon is the claim, not the fact.' })
      }
    );
    assert.strictEqual(retake.body.contributions[0].interpretation, 'The horizon is the claim, not the fact.');
    const stamped = retake.body.contributions[0].updatedAt;
    assert.ok(stamped);
    const staleTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          interpretation: 'A later overwrite.',
          updatedAt: '2020-01-01T00:00:00.000Z'
        })
      }
    );
    assert.strictEqual(staleTake.response.status, 409);
    assert.strictEqual(staleTake.body.error, CONTRIBUTION_TAKE_CHANGED);
    assert.strictEqual(staleTake.body.field, 'updatedAt');
    const afterStale = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(afterStale.body.contributions[0].interpretation, 'The horizon is the claim, not the fact.');
    assert.strictEqual(afterStale.body.contributions[0].updatedAt, stamped);
    const matchingTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          interpretation: 'The horizon is still the claim.',
          updatedAt: stamped
        })
      }
    );
    assert.strictEqual(matchingTake.response.status, 200, JSON.stringify(matchingTake.body));
    assert.strictEqual(
      matchingTake.body.contributions[0].interpretation,
      'The horizon is still the claim.'
    );
    assert.notStrictEqual(matchingTake.body.contributions[0].updatedAt, stamped);

    const agentBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      headers: { 'x-agent-token': '1' },
      body: JSON.stringify({ agreement: 'An agent brief.' })
    });
    assert.strictEqual(agentBrief.response.status, 403);
    const strangerBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      headers: asUser(strangerId),
      body: JSON.stringify({ agreement: 'A stranger brief.' })
    });
    assert.strictEqual(strangerBrief.response.status, 404);
    const savedBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      body: JSON.stringify({
        agreement: '<em>The fact is shared. The horizon is not.</em>',
        remainder: 'The window may close before compounding pays.',
        observation: 'Watch who is still in the room when the cost arrives.',
        articleId: 'secret'
      })
    });
    assert.strictEqual(savedBrief.response.status, 200, JSON.stringify(savedBrief.body));
    assert.deepStrictEqual(savedBrief.body.brief, {
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'The window may close before compounding pays.',
      observation: 'Watch who is still in the room when the cost arrives.',
      by: 'Owner'
    });
    assert.ok(!savedBrief.body.snapshot.brief);
    assert.ok(!JSON.stringify(savedBrief.body.snapshot).includes('secret'));
    const publicBrief = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.deepStrictEqual(publicBrief.body.brief, savedBrief.body.brief);
    assert.ok(!publicBrief.body.snapshot);
    const emptyBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      body: JSON.stringify({ agreement: '   ', remainder: '', observation: '' })
    });
    assert.strictEqual(emptyBrief.response.status, 200);
    assert.deepStrictEqual(emptyBrief.body.brief, { agreement: '', remainder: '', observation: '', by: 'Owner' });
    const silentBrief = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.ok(!silentBrief.body.brief);
    const tooSoonHand = await fetchJson(`${base}/api/questions/${questionId}/share/succession`, {
      method: 'PATCH',
      body: JSON.stringify({ outcome: 'The window closed.' })
    });
    assert.strictEqual(tooSoonHand.response.status, 409);
    assert.strictEqual(tooSoonHand.body.error, SUCCESSION_NEEDS_UNRESOLVED);
    const restoredBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      body: JSON.stringify({
        agreement: 'The fact is shared. The horizon is not.',
        remainder: 'The window may close before compounding pays.',
        observation: 'Watch who is still in the room when the cost arrives.'
      })
    });
    assert.strictEqual(restoredBrief.response.status, 200);
    const agentHand = await fetchJson(`${base}/api/questions/${questionId}/share/succession`, {
      method: 'PATCH',
      headers: { 'x-agent-token': '1' },
      body: JSON.stringify({ outcome: 'An agent outcome.' })
    });
    assert.strictEqual(agentHand.response.status, 403);
    const strangerHand = await fetchJson(`${base}/api/questions/${questionId}/share/succession`, {
      method: 'PATCH',
      headers: asUser(strangerId),
      body: JSON.stringify({ outcome: 'A stranger outcome.' })
    });
    assert.strictEqual(strangerHand.response.status, 404);
    const handed = await fetchJson(`${base}/api/questions/${questionId}/share/succession`, {
      method: 'PATCH',
      body: JSON.stringify({ outcome: '<em>The window closed. The latecomer paid.</em>' })
    });
    assert.strictEqual(handed.response.status, 200, JSON.stringify(handed.body));
    assert.strictEqual(handed.body.succession.unresolved, 'The window may close before compounding pays.');
    assert.strictEqual(handed.body.succession.authority, 'Owner');
    assert.strictEqual(handed.body.succession.outcome, 'The window closed. The latecomer paid.');
    assert.ok(handed.body.succession.alternatives.length >= 1);
    assert.strictEqual(handed.body.succession.evidenceThen.text, 'What survives compounding?');
    assert.ok(!handed.body.snapshot.succession);
    const publicHanded = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicHanded.body.succession.unresolved, 'The window may close before compounding pays.');
    assert.strictEqual(publicHanded.body.succession.outcome, 'The window closed. The latecomer paid.');
    assert.ok(!publicHanded.body.snapshot);
    const clearedOutcome = await fetchJson(`${base}/api/questions/${questionId}/share/succession`, {
      method: 'PATCH',
      body: JSON.stringify({ outcome: '   ' })
    });
    assert.strictEqual(clearedOutcome.response.status, 200);
    assert.ok(!clearedOutcome.body.succession.outcome);
    const silentOutcome = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.ok(!silentOutcome.body.succession.outcome);
    const restoredOutcome = await fetchJson(`${base}/api/questions/${questionId}/share/succession`, {
      method: 'PATCH',
      body: JSON.stringify({ outcome: 'The window closed. The latecomer paid.' })
    });
    assert.strictEqual(restoredOutcome.body.succession.outcome, 'The window closed. The latecomer paid.');

    const incompleteMandate = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      body: JSON.stringify({ owner: 'Owner' })
    });
    assert.strictEqual(incompleteMandate.response.status, 409);
    assert.strictEqual(incompleteMandate.body.error, MANDATE_NEEDS_FIELDS);
    const agentMandate = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      headers: { 'x-agent-token': '1' },
      body: JSON.stringify({
        scope: 'This published question.',
        stop: 'Stop when the successor writes what happened later.',
        review: 'Return to this door to end or renew the assignment.',
        budget: 2
      })
    });
    assert.strictEqual(agentMandate.response.status, 403);
    const strangerMandate = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      headers: asUser(strangerId),
      body: JSON.stringify({
        scope: 'This published question.',
        stop: 'Stop when the successor writes what happened later.',
        review: 'Return to this door to end or renew the assignment.',
        budget: 2
      })
    });
    assert.strictEqual(strangerMandate.response.status, 404);
    const namedMandate = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      body: JSON.stringify({
        scope: 'This published question.',
        stop: 'Stop when the successor writes what happened later.',
        review: 'Return to this door to end or renew the assignment.',
        budget: 2
      })
    });
    assert.strictEqual(namedMandate.response.status, 200, JSON.stringify(namedMandate.body));
    assert.strictEqual(namedMandate.body.mandate.owner, 'Owner');
    assert.strictEqual(namedMandate.body.mandate.tools, AGENT_MANDATE_TOOLS);
    assert.strictEqual(namedMandate.body.mandate.budget.asks, 2);
    assert.strictEqual(namedMandate.body.mandate.status, 'live');
    assert.ok(!namedMandate.body.mandate.ownerId);
    assert.ok(!namedMandate.body.snapshot.mandate);
    const publicMandate = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicMandate.body.mandate.scope, 'This published question.');
    assert.ok(!publicMandate.body.snapshot);
    const rewriteLive = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      body: JSON.stringify({
        scope: 'A different assignment.',
        stop: 'Stop now.',
        review: 'Review here.',
        budget: 3
      })
    });
    assert.strictEqual(rewriteLive.response.status, 409);
    const endedMandate = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      body: JSON.stringify({ end: true })
    });
    assert.strictEqual(endedMandate.response.status, 200);
    assert.strictEqual(endedMandate.body.mandate.status, 'paused');
    assert.strictEqual(endedMandate.body.mandate.pause, AGENT_MANDATE_PAUSE.ended);
    const publicPaused = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicPaused.body.mandate.pause, AGENT_MANDATE_PAUSE.ended);
    const renewedMandate = await fetchJson(`${base}/api/questions/${questionId}/share/mandate`, {
      method: 'PATCH',
      body: JSON.stringify({
        scope: 'This published question.',
        stop: 'Stop when the successor writes what happened later.',
        review: 'Return to this door to end or renew the assignment.',
        budget: 1
      })
    });
    assert.strictEqual(renewedMandate.response.status, 200);
    assert.strictEqual(renewedMandate.body.mandate.status, 'live');
    assert.strictEqual(renewedMandate.body.mandate.budget.asks, 1);

    const emptyRecords = await fetchJson(`${base}/api/questions/${questionId}/share/records`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'question-share-records', version: 1 })
    });
    assert.strictEqual(emptyRecords.response.status, 400);
    const taken = await fetchJson(`${base}/api/questions/${questionId}/share/records`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'question-share-records',
        version: 1,
        door: { slug: mint.body.slug, path: `/share/questions/${mint.body.slug}` },
        succession: restoredOutcome.body.succession,
        mandate: renewedMandate.body.mandate
      })
    });
    assert.strictEqual(taken.response.status, 200, JSON.stringify(taken.body));
    assert.deepStrictEqual(taken.body.records.retained, ['successor', 'mandate']);
    assert.deepStrictEqual(taken.body.records.restored, []);
    assert.strictEqual(taken.body.records.sameDoor, true);
    assert.ok(taken.body.records.cannotTransfer.includes('Remaining asks as a live counter'));
    assert.strictEqual(taken.body.mandate.budget.asks, 1);

    const agentRecords = await fetchJson(`${base}/api/questions/${questionId}/share/records`, {
      method: 'POST',
      headers: { 'x-agent-token': '1' },
      body: JSON.stringify({ kind: 'question-share-records', version: 1 })
    });
    assert.strictEqual(agentRecords.response.status, 403);
    const strangerRecords = await fetchJson(`${base}/api/questions/${questionId}/share/records`, {
      method: 'POST',
      headers: asUser(strangerId),
      body: JSON.stringify({
        kind: 'question-share-records',
        version: 1,
        succession: restoredOutcome.body.succession
      })
    });
    assert.strictEqual(strangerRecords.response.status, 404);

    const otherQuestionId = new mongoose.Types.ObjectId().toString();
    await Question.create({
      _id: otherQuestionId,
      userId,
      text: 'What survives compounding?',
      status: 'open',
      conceptName: 'Compounding',
      blocks: [{ id: 'p1', type: 'paragraph', text: 'Public paragraph.' }]
    });
    const otherMint = await fetchJson(`${base}/api/questions/${otherQuestionId}/share`, {
      method: 'POST'
    });
    assert.strictEqual(otherMint.response.status, 201, JSON.stringify(otherMint.body));
    const migrated = await fetchJson(`${base}/api/questions/${otherQuestionId}/share/records`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'question-share-records',
        version: 1,
        door: { slug: mint.body.slug, path: `/share/questions/${mint.body.slug}` },
        succession: restoredOutcome.body.succession,
        mandate: {
          owner: 'Athan',
          scope: 'This published question.',
          tools: AGENT_MANDATE_TOOLS,
          budget: { asks: 2, remaining: 1, spent: 1 },
          stop: 'Stop when the successor writes what happened later.',
          review: 'Return to this door to end or renew the assignment.',
          status: 'live'
        }
      })
    });
    assert.strictEqual(migrated.response.status, 200, JSON.stringify(migrated.body));
    assert.ok(migrated.body.records.restored.includes('succession'));
    assert.ok(migrated.body.records.restored.includes('mandate'));
    assert.strictEqual(migrated.body.records.sameDoor, false);
    assert.ok(migrated.body.records.cannotTransfer.includes('The public address of that door'));
    assert.strictEqual(migrated.body.succession.unresolved, 'The window may close before compounding pays.');
    assert.strictEqual(migrated.body.mandate.budget.asks, 2);
    assert.strictEqual(migrated.body.mandate.budget.remaining, 2);
    assert.ok(!migrated.body.mandate.ownerId);
    const publicMigrated = await fetchJson(`${base}/api/public/questions/${otherMint.body.slug}`);
    assert.strictEqual(publicMigrated.body.succession.unresolved, 'The window may close before compounding pays.');
    assert.ok(!publicMigrated.body.snapshot);

    const collide = await fetchJson(`${base}/api/questions/${otherQuestionId}/share/records`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'question-share-records',
        version: 1,
        succession: {
          ...restoredOutcome.body.succession,
          unresolved: 'A different unresolved question.'
        }
      })
    });
    assert.strictEqual(collide.response.status, 409);
    assert.ok(String(collide.body.error).includes('different successor record'));

    const openDoor = async () => {
      const id = new mongoose.Types.ObjectId().toString();
      await Question.create({
        _id: id,
        userId,
        text: 'What survives compounding?',
        status: 'open',
        conceptName: 'Compounding',
        blocks: [{ id: 'p1', type: 'paragraph', text: 'Public paragraph.' }]
      });
      const minted = await fetchJson(`${base}/api/questions/${id}/share`, { method: 'POST' });
      assert.strictEqual(minted.response.status, 201, JSON.stringify(minted.body));
      return {
        id,
        minted,
        share: SharedQuestion.rows.find((row) => String(row.questionId) === id)
      };
    };
    const importRecords = (id, records) => fetchJson(`${base}/api/questions/${id}/share/records`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'question-share-records',
        version: 1,
        ...records
      })
    });
    const oneWriteWins = (results) => {
      const won = results.filter((item) => item.response.status === 200);
      const lost = results.filter((item) => item.response.status === 409);
      assert.strictEqual(won.length, 1, JSON.stringify(results.map((item) => ({
        status: item.response.status,
        body: item.body
      }))));
      assert.strictEqual(lost.length, 1, JSON.stringify(lost.map((item) => item.body)));
      assert.ok(lost[0].body.collisions?.length);
      return { won: won[0], lost: lost[0] };
    };

    const concurrentDoor = await openDoor();
    const restoreConcurrent = holdShareWrites(SharedQuestion, concurrentDoor.share._id);
    let concurrentImports;
    try {
      concurrentImports = await Promise.all([
        importRecords(concurrentDoor.id, {
          succession: {
            ...restoredOutcome.body.succession,
            unresolved: 'Imported first.'
          }
        }),
        importRecords(concurrentDoor.id, {
          succession: {
            ...restoredOutcome.body.succession,
            unresolved: 'Imported second.'
          }
        })
      ]);
    } finally {
      restoreConcurrent();
    }
    const concurrent = oneWriteWins(concurrentImports);
    assert.ok(concurrent.lost.body.collisions.includes(SHARE_RECORD_COLLISION_SUCCESSION));
    assert.ok(
      concurrent.won.body.succession.unresolved === 'Imported first.'
      || concurrent.won.body.succession.unresolved === 'Imported second.'
    );
    const afterConcurrent = await fetchJson(`${base}/api/questions/${concurrentDoor.id}/share`);
    assert.strictEqual(
      afterConcurrent.body.succession.unresolved,
      concurrent.won.body.succession.unresolved
    );
    assert.ok(
      afterConcurrent.body.succession.unresolved === 'Imported first.'
      || afterConcurrent.body.succession.unresolved === 'Imported second.'
    );

    const mandateDoor = await openDoor();
    const restoreMandateRace = holdShareWrites(SharedQuestion, mandateDoor.share._id);
    let mandateRace;
    try {
      mandateRace = await Promise.all([
        importRecords(mandateDoor.id, {
          mandate: {
            owner: 'Imported owner',
            scope: 'Imported assignment.',
            tools: AGENT_MANDATE_TOOLS,
            budget: { asks: 2, remaining: 2, spent: 0 },
            stop: 'Stop when the successor writes what happened later.',
            review: 'Return to this door to end or renew the assignment.',
            status: 'live'
          }
        }),
        fetchJson(`${base}/api/questions/${mandateDoor.id}/share/mandate`, {
          method: 'PATCH',
          body: JSON.stringify({
            owner: 'Named owner',
            scope: 'Named on this door.',
            stop: 'Stop now.',
            review: 'Review here.',
            budget: 1
          })
        })
      ]);
    } finally {
      restoreMandateRace();
    }
    const mandateWinner = oneWriteWins(mandateRace);
    assert.ok(mandateWinner.lost.body.collisions.includes(SHARE_RECORD_COLLISION_MANDATE));
    const afterMandate = await fetchJson(`${base}/api/questions/${mandateDoor.id}/share`);
    assert.strictEqual(afterMandate.body.mandate.scope, mandateWinner.won.body.mandate.scope);
    assert.ok(
      afterMandate.body.mandate.scope === 'Imported assignment.'
      || afterMandate.body.mandate.scope === 'Named on this door.'
    );
    assert.strictEqual(
      afterMandate.body.mandate.budget.asks,
      afterMandate.body.mandate.scope === 'Imported assignment.' ? 2 : 1
    );

    const successionDoor = await openDoor();
    await QuestionContribution.create({
      userId,
      questionId: successionDoor.id,
      slug: successionDoor.minted.body.slug,
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?',
      held: false
    });
    successionDoor.share.brief = {
      agreement: 'The fact is shared. The horizon is not.',
      remainder: 'Handed from this door.',
      observation: 'Watch the cost arrive.'
    };
    const restoreSuccessionRace = holdShareWrites(SharedQuestion, successionDoor.share._id);
    let successionRace;
    try {
      successionRace = await Promise.all([
        importRecords(successionDoor.id, {
          succession: {
            ...restoredOutcome.body.succession,
            unresolved: 'Imported successor.'
          }
        }),
        fetchJson(`${base}/api/questions/${successionDoor.id}/share/succession`, {
          method: 'PATCH',
          body: JSON.stringify({ outcome: 'The window closed.' })
        })
      ]);
    } finally {
      restoreSuccessionRace();
    }
    const successionWinner = oneWriteWins(successionRace);
    assert.ok(successionWinner.lost.body.collisions.includes(SHARE_RECORD_COLLISION_SUCCESSION));
    const afterSuccession = await fetchJson(`${base}/api/questions/${successionDoor.id}/share`);
    assert.strictEqual(
      afterSuccession.body.succession.unresolved,
      successionWinner.won.body.succession.unresolved
    );
    assert.ok(
      afterSuccession.body.succession.unresolved === 'Imported successor.'
      || afterSuccession.body.succession.unresolved === 'Handed from this door.'
    );

    const used = SharedQuestion.rows[0].contributionCount;
    const filled = [];
    for (let i = used; i < CONTRIBUTION_LIMIT; i += 1) {
      filled.push(offer(mint.body.slug, { by: 'Mara', text: `Reading ${i + 1}.` }));
    }
    const filledResults = await Promise.all(filled);
    assert.ok(filledResults.every((item) => item.response.status === 201));

    const overflow = await offer(mint.body.slug, { by: 'Mara', text: 'One more.' });
    assert.strictEqual(overflow.response.status, 409);
    assert.strictEqual(SharedQuestion.rows[0].contributionCount, CONTRIBUTION_LIMIT);

    question.text = 'Rewritten in the workshop.';
    question.blocks.push({ id: 'p3', type: 'paragraph', text: 'A later private paragraph.' });
    const afterEdit = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(afterEdit.body.question.text, 'What survives compounding?');
    assert.ok(!JSON.stringify(afterEdit.body).includes('A later private paragraph.'));

    const status = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(status.body.stale, true);
    assert.strictEqual(status.body.snapshot.question.text, 'What survives compounding?');
    assert.strictEqual(status.body.preview.question.text, 'Rewritten in the workshop.');

    const staleUpdate = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'PUT',
      body: JSON.stringify({ previewHash: mint.body.currentHash })
    });
    assert.strictEqual(staleUpdate.response.status, 409);

    const updated = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'PUT',
      body: JSON.stringify({
        previewHash: status.body.currentHash,
        correction: 'The exception now leads.'
      })
    });
    assert.strictEqual(updated.response.status, 200);
    assert.strictEqual(updated.body.stale, false);
    assert.strictEqual(updated.body.snapshot.question.text, 'Rewritten in the workshop.');
    assert.strictEqual(updated.body.snapshot.correction, 'The exception now leads.');
    assert.strictEqual(updated.body.snapshot.publishedAt, mint.body.snapshot.publishedAt);
    assert.strictEqual(updated.body.contributions[0].interpretation, 'The horizon is still the claim.');
    assert.strictEqual(updated.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.strictEqual(updated.body.brief.agreement, 'The fact is shared. The horizon is not.');
    assert.ok(!updated.body.snapshot.brief);
    assert.strictEqual(updated.body.succession.evidenceThen.text, 'What survives compounding?');
    assert.ok(!updated.body.snapshot.succession);
    assert.strictEqual(updated.body.mandate.budget.asks, 1);
    assert.ok(!updated.body.snapshot.mandate);

    Question.rows.splice(0, Question.rows.length);
    const afterDelete = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(afterDelete.response.status, 200);
    assert.strictEqual(afterDelete.body.question.text, 'Rewritten in the workshop.');

    const revoke = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(revoke.response.status, 200);
    assert.strictEqual(revoke.body.revoked, true);

    const missing = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(missing.response.status, 404);
    assert.strictEqual(missing.body.error, 'This question is not published.');
    const goneYours = await publicGet(mint.body.slug, asUser(contributorId));
    assert.strictEqual(goneYours.response.status, 404);
    const goneOther = await publicGet(mint.body.slug, asUser(otherContributorId));
    assert.strictEqual(goneOther.response.status, 404);
    const goneWithdraw = await fetchJson(
      `${base}/api/public/questions/${mint.body.slug}/contributions/${contributionId}`,
      { method: 'DELETE', headers: asUser(contributorId) }
    );
    assert.strictEqual(goneWithdraw.response.status, 404);

    const goneDoor = await offer(mint.body.slug, { by: 'Mara', text: 'After revoke.' });
    assert.strictEqual(goneDoor.response.status, 404);

    const goneTake = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ interpretation: 'After revoke.' })
      }
    );
    assert.strictEqual(goneTake.response.status, 404);

    const gonePlace = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${contributionId}/place`,
      { method: 'POST' }
    );
    assert.strictEqual(gonePlace.response.status, 404);
    const goneBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      body: JSON.stringify({ agreement: 'After revoke.' })
    });
    assert.strictEqual(goneBrief.response.status, 404);

    await Question.create({
      _id: questionId,
      userId,
      text: 'What survives compounding?',
      status: 'open',
      conceptName: 'Compounding',
      blocks: [{ id: 'p1', type: 'paragraph', text: 'Public paragraph.' }]
    });
    const reopen = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(reopen.body.shared, false);
    const remint = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ previewHash: reopen.body.currentHash })
    });
    assert.strictEqual(remint.response.status, 201);
    assert.notStrictEqual(remint.body.slug, mint.body.slug);
    assert.deepStrictEqual(remint.body.contributions, []);
    const nextDoor = await offer(remint.body.slug, { by: 'Mara', text: 'A later door.' }, asUser(contributorId));
    assert.strictEqual(nextDoor.response.status, 201);
    const newPage = await fetchJson(`${base}/api/public/questions/${remint.body.slug}`);
    assert.deepStrictEqual(newPage.body.contributions, []);
    const waitingLater = await fetchJson(`${base}/api/questions/${questionId}/share`);
    const laterId = waitingLater.body.waiting[0].id;
    const placeLater = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${laterId}/place`,
      { method: 'POST' }
    );
    assert.strictEqual(placeLater.response.status, 200);
    const remintBrief = await fetchJson(`${base}/api/questions/${questionId}/share/brief`, {
      method: 'PATCH',
      body: JSON.stringify({
        agreement: 'A later door can still close.',
        observation: 'See whether the second address is enough.'
      })
    });
    assert.strictEqual(remintBrief.response.status, 200, JSON.stringify(remintBrief.body));
    const placedLater = await fetchJson(`${base}/api/public/questions/${remint.body.slug}`);
    assert.strictEqual(placedLater.body.contributions.length, 1);
    assert.strictEqual(placedLater.body.contributions[0].text, 'A later door.');
    assert.strictEqual(placedLater.body.brief.agreement, 'A later door can still close.');
    assert.ok(!placedLater.body.brief.remainder);
    const laterMine = await publicGet(remint.body.slug, asUser(contributorId));
    assert.strictEqual(laterMine.body.contributions[0].mine, true);
    const withdrawPlaced = await fetchJson(
      `${base}/api/public/questions/${remint.body.slug}/contributions/${laterId}`,
      { method: 'DELETE', headers: asUser(contributorId) }
    );
    assert.strictEqual(withdrawPlaced.response.status, 200, JSON.stringify(withdrawPlaced.body));
    const afterPlacedWithdraw = await publicGet(remint.body.slug);
    assert.deepStrictEqual(afterPlacedWithdraw.body.contributions, []);
    assert.ok(!afterPlacedWithdraw.body.brief);
    const ownerAfterWithdraw = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.deepStrictEqual(ownerAfterWithdraw.body.contributions, []);
    assert.ok(!ownerAfterWithdraw.body.waiting);
    const remintRow = SharedQuestion.rows.find((row) => row.slug === remint.body.slug);
    assert.strictEqual(remintRow.contributionCount, 0);
    const interpretTakenBack = await fetchJson(
      `${base}/api/questions/${questionId}/share/contributions/${laterId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ interpretation: 'After they left.' })
      }
    );
    assert.strictEqual(interpretTakenBack.response.status, 409);
    assert.strictEqual(interpretTakenBack.body.error, CONTRIBUTION_TAKEN_BACK);
    assert.strictEqual(interpretTakenBack.body.field, 'withdrawn');
    assert.strictEqual(remintRow.contributionCount, 0);
    const twice = await fetchJson(
      `${base}/api/public/questions/${remint.body.slug}/contributions/${laterId}`,
      { method: 'DELETE', headers: asUser(contributorId) }
    );
    assert.strictEqual(twice.response.status, 404);
    assert.strictEqual(remintRow.contributionCount, 0);

    const unsignedBeat = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`, {
      method: 'PUT'
    });
    assert.strictEqual(unsignedBeat.response.status, 200);
    assert.strictEqual(unsignedBeat.body.present, false);
    assert.ok(!unsignedBeat.body.here);
    assert.strictEqual(QuestionPresence.rows.length, 0);

    const lurkerBeat = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`, {
      method: 'PUT',
      headers: asUser(strangerId)
    });
    assert.strictEqual(lurkerBeat.response.status, 200);
    assert.strictEqual(lurkerBeat.body.present, false);
    assert.ok(!lurkerBeat.body.here);
    assert.strictEqual(QuestionPresence.rows.length, 0);

    const agentBeat = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`, {
      method: 'PUT',
      headers: { ...asUser(userId), 'x-agent-token': '1' }
    });
    assert.strictEqual(agentBeat.response.status, 403);

    const unpublishedBeat = await fetchJson(`${base}/api/public/questions/no-such/presence`, {
      method: 'PUT',
      headers: asUser(userId)
    });
    assert.strictEqual(unpublishedBeat.response.status, 404);

    const ownerBeat = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`, {
      method: 'PUT',
      headers: asUser(userId)
    });
    assert.strictEqual(ownerBeat.response.status, 200, JSON.stringify(ownerBeat.body));
    assert.strictEqual(ownerBeat.body.present, true);
    assert.ok(!ownerBeat.body.here);
    assert.strictEqual(QuestionPresence.rows.length, 1);

    const ownerBeatAgain = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`, {
      method: 'PUT',
      headers: asUser(userId)
    });
    assert.strictEqual(ownerBeatAgain.response.status, 200);
    assert.strictEqual(QuestionPresence.rows.length, 1);

    const contributorBeat = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`, {
      method: 'PUT',
      headers: asUser(contributorId)
    });
    assert.strictEqual(contributorBeat.response.status, 200, JSON.stringify(contributorBeat.body));
    assert.strictEqual(contributorBeat.body.present, true);
    assert.deepStrictEqual(contributorBeat.body.here, [{ by: 'Owner' }]);
    assert.ok(!JSON.stringify(contributorBeat.body.here).includes('userId'));
    assert.ok(!JSON.stringify(contributorBeat.body.here).includes('"at"'));

    const ownerPoll = await fetchJson(
      `${base}/api/public/questions/${remint.body.slug}/presence`,
      { headers: asUser(userId) }
    );
    assert.deepStrictEqual(ownerPoll.body.here, [{ by: 'Mara' }]);

    const unsignedPoll = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`);
    assert.deepStrictEqual(unsignedPoll.body.here.map((row) => row.by).sort(), ['Mara', 'Owner']);

    const publicHere = await publicGet(remint.body.slug);
    assert.deepStrictEqual(publicHere.body.here.map((row) => row.by).sort(), ['Mara', 'Owner']);
    assert.ok(!publicHere.body.snapshot);
    assert.ok(!JSON.stringify(publicHere.body).includes('"presence"'));

    const ownerShare = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.deepStrictEqual(ownerShare.body.here, [{ by: 'Mara' }]);
    assert.ok(!ownerShare.body.snapshot.here);

    QuestionPresence.rows.push({
      _id: 'stale',
      slug: remint.body.slug,
      userId: otherContributorId,
      by: 'Ada',
      at: new Date(Date.now() - 80 * 1000)
    });
    const stalePoll = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`);
    assert.deepStrictEqual(stalePoll.body.here.map((row) => row.by).sort(), ['Mara', 'Owner']);

    const closeLater = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(closeLater.response.status, 200);
    assert.strictEqual(QuestionPresence.rows.length, 0);
    const gonePresence = await fetchJson(`${base}/api/public/questions/${remint.body.slug}/presence`);
    assert.strictEqual(gonePresence.response.status, 404);
    const revokeAgain = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(revokeAgain.response.status, 404);
    assert.strictEqual(revokeAgain.body.error, 'No active share for this question.');

    const legacy = await SharedQuestion.create({
      userId,
      questionId: new mongoose.Types.ObjectId().toString(),
      slug: 'legacy-q',
      ownerDisplayName: 'Owner'
    });
    await Question.create({
      _id: legacy.questionId,
      userId,
      text: 'A leftover live pointer.',
      status: 'open',
      blocks: [{ id: 'p9', type: 'paragraph', text: 'Backfill this once.' }]
    });
    const backfill = await fetchJson(`${base}/api/public/questions/legacy-q`);
    assert.strictEqual(backfill.response.status, 200, JSON.stringify(backfill.body));
    assert.strictEqual(backfill.body.question.text, 'A leftover live pointer.');
    const liveLegacy = Question.rows.find((row) => String(row._id) === String(legacy.questionId));
    liveLegacy.text = 'Changed after backfill.';
    const frozenLegacy = await fetchJson(`${base}/api/public/questions/legacy-q`);
    assert.strictEqual(frozenLegacy.body.question.text, 'A leftover live pointer.');
  } finally {
    server.close();
  }
};

run()
  .then(() => {
    console.log('sharedQuestionRoutes.test.js passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
