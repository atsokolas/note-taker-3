const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedQuestionRouter } = require('../sharedQuestionRoutes');
const {
  CONTRIBUTION_LIMIT,
  hashPublicQuestion,
  projectPublicQuestion
} = require('../../services/authoredThinkShare');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const matchesValue = (actual, expected) => {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
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
  }
  return String(actual || '') === String(expected || '');
};

const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === '$or') return expected.some((clause) => matchesQuery(row, clause));
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
      const row = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
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
      const row = rows.find((item) => matchesQuery(item, query));
      if (!row) return null;
      Object.assign(row, update.$set || update);
      return options.new === false ? null : row;
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

const run = async () => {
  const SharedQuestion = createModel();
  const QuestionContribution = createModel();
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
      next();
    },
    SharedQuestion,
    QuestionContribution,
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
    assert.ok(!JSON.stringify(publicPlaced.body.contributions).includes('secret'));
    assert.ok(!JSON.stringify(publicPlaced.body.contributions).includes('library?'));
    assert.ok(!publicPlaced.body.waiting);
    assert.ok(!publicPlaced.body.yours);
    const placedYours = await publicGet(mint.body.slug, asUser(contributorId));
    assert.ok(!placedYours.body.yours);
    assert.strictEqual(placedYours.body.contributions[0].id, contributionId);
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
    assert.strictEqual(updated.body.contributions[0].interpretation, 'The horizon is the claim, not the fact.');
    assert.strictEqual(updated.body.contributions[0].text, 'Same fact, different time horizon.');

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
    const nextDoor = await offer(remint.body.slug, { by: 'Mara', text: 'A later door.' });
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
    const placedLater = await fetchJson(`${base}/api/public/questions/${remint.body.slug}`);
    assert.strictEqual(placedLater.body.contributions.length, 1);
    assert.strictEqual(placedLater.body.contributions[0].text, 'A later door.');

    const closeLater = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(closeLater.response.status, 200);
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
