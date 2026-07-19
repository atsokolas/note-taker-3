const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  assertHumanForResolvedWeekendReadingsTargets,
  buildRequireHumanForWeekendReadingsMutation,
  buildUniqueWikiSlugBuilder,
  rejectAgentReservedWeekendReadingsCreation
} = require('../wikiRoutes');

const source = fs.readFileSync(path.join(__dirname, '..', 'wikiRoutes.js'), 'utf8');

assert.match(source, /buildWeekendReadingsRouter/);
assert.match(source, /router\.use\(buildWeekendReadingsRouter\(\{/);
assert.match(source, /invalidatePublicPageCache:\s*\(\.\.\.keys\)\s*=>\s*publicPageCache\.invalidate\(keys\)/);
assert.match(source, /pageQuery\.select\('_id userId title slug pageType status visibility createdFrom/);
assert.match(source, /loadPublishedWeekendReadingsArtifact\(\{ NoeisReceipt, page, ownerUserId: page\.userId \}\)/);
assert.match(source, /Weekend Readings must be reviewed, approved, and published through its revision-bound publication controls/);
assert.match(source, /Published Weekend Readings editions are immutable public artifacts and cannot be adopted from the private draft/);
assert.match(source, /publicPages = pages\.filter\(page => !String\(page\?\.createdFrom\?\.label/);
assert.match(source, /const snapshots = \(Array\.isArray\(pages\) \? pages : \[\]\)[\s\S]*?filter\(page => !String\(page\?\.createdFrom\?\.label/);
assert.match(source, /publicPageCache\.invalidate\(serializeId\(page\._id\), before\?\.slug, page\.slug\)/);
assert.match(source, /const wikiAuth = \[authenticateToken, auditExternalAgentAction, requireHumanForWeekendReadingsMutation\]/);
assert.match(source, /Only the human owner can mutate Weekend Readings/);
assert.match(source, /const buildUniqueSlug = buildUniqueWikiSlugBuilder\(\{ WikiPage \}\)/);
assert.match(source, /existingQuery = existingQuery\.session\(session\)/);
assert.match(source, /rejectAgentReservedWeekendReadingsCreation\(req, res, createdFrom\)/);
assert.match(source, /pageIds: \[finding\.pageId\]/);
assert.match(source, /pageIds: Array\.from\(latestByPage\.keys\(\)\)/);

console.log('wikiRoutes Weekend Readings integration contract tests passed');

const runAuthorizationContract = async () => {
  let downstreamMutations = 0;
  let lookups = 0;
  const app = express();
  app.use(express.json());
  const authenticateAgent = (req, _res, next) => {
    req.user = { id: 'owner-user' };
    req.agentToken = { id: 'agent-token' };
    next();
  };
  const guard = buildRequireHumanForWeekendReadingsMutation({
    WikiPage: {
      findOne(query) {
        lookups += 1;
        assert.deepEqual(query, { _id: 'weekend-page', userId: 'owner-user' });
        return {
          select() { return this; },
          async lean() { return { createdFrom: { label: 'weekend-readings:private-owner:2026-07-01:2026-07-14' } }; }
        };
      }
    }
  });
  const mutate = (_req, res) => {
    downstreamMutations += 1;
    res.status(204).end();
  };
  app.patch('/api/wiki/pages/:id', authenticateAgent, guard, mutate);
  app.delete('/api/wiki/pages/:id', authenticateAgent, guard, mutate);
  app.post('/api/wiki/pages/:id/sources', authenticateAgent, guard, mutate);
  app.post('/api/wiki/pages/:id/revisions/latest/restore', authenticateAgent, guard, mutate);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [method, suffix] of [
      ['PATCH', ''],
      ['DELETE', ''],
      ['POST', '/sources'],
      ['POST', '/revisions/latest/restore']
    ]) {
      const response = await fetch(`${base}/api/wiki/pages/weekend-page${suffix}`, { method });
      assert.equal(response.status, 403, `${method} ${suffix}`);
      assert.deepEqual(await response.json(), { error: 'Only the human owner can mutate Weekend Readings.' });
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  assert.equal(lookups, 4);
  assert.equal(downstreamMutations, 0);
  console.log('wikiRoutes Weekend Readings agent-token mutation guard passed');
};

const runTransactionalSlugContract = async () => {
  const transactionSession = { id: 'transaction-session' };
  let observedSession = null;
  let observedQuery = null;
  const buildUniqueSlug = buildUniqueWikiSlugBuilder({
    WikiPage: {
      findOne(query) {
        observedQuery = query;
        return {
          select() { return this; },
          session(session) { observedSession = session; return this; },
          async lean() { return null; }
        };
      }
    }
  });
  const slug = await buildUniqueSlug('owner-user', 'Living Thesis Ledger', null, { session: transactionSession });
  assert.equal(slug, 'living-thesis-ledger');
  assert.deepEqual(observedQuery, { userId: 'owner-user', slug: 'living-thesis-ledger' });
  assert.equal(observedSession, transactionSession);
  console.log('wikiRoutes transactional slug builder contract passed');
};

const runIndirectMutationContract = async () => {
  let mutationCount = 0;
  let targetLookups = 0;
  const req = { user: { id: 'owner-user' }, agentToken: { id: 'agent-token' } };
  const WikiPage = {
    findOne(query) {
      targetLookups += 1;
      assert.equal(query.userId, 'owner-user');
      return {
        select() { return this; },
        async lean() { return { createdFrom: { label: 'weekend-readings:private-owner:2026-07-01:2026-07-14' } }; }
      };
    }
  };
  for (const indirectCase of ['lint finding pageId', 'ingest undo revision pageId']) {
    await assert.rejects(
      () => assertHumanForResolvedWeekendReadingsTargets({ WikiPage, req, pageIds: ['weekend-page'] })
        .then(() => { mutationCount += 1; }),
      error => error.statusCode === 403 && /human owner/.test(error.message),
      indirectCase
    );
  }

  const response = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  const rejected = rejectAgentReservedWeekendReadingsCreation(
    req,
    response,
    { label: 'weekend-readings:attacker-owner:2026-07-01:2026-07-14' }
  );
  if (!rejected) mutationCount += 1;
  assert.equal(rejected, true);
  assert.equal(response.statusCode, 403);
  assert.equal(targetLookups, 2);
  assert.equal(mutationCount, 0);
  console.log('wikiRoutes indirect Weekend Readings zero-mutation guards passed');
};

Promise.all([
  runAuthorizationContract(),
  runTransactionalSlugContract(),
  runIndirectMutationContract()
]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
