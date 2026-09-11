const express = require('express');
const { buildAuthoredExplorationRouter } = require('../authoredExplorationRoutes');

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  limit() { return this; },
  maxTimeMS() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
});

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

describe('authored exploration HTTP boundary', () => {
  let server;
  let base;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(buildAuthoredExplorationRouter({
      authenticateToken: (req, _res, next) => {
        req.user = { id: req.headers['x-user'] || 'owner' };
        if (req.headers['x-agent']) req.agentToken = { id: 'agent-1' };
        next();
      },
      WikiPage: { findOne: filter => query(filter.userId === 'owner' ? { _id: 'page-1', userId: 'owner', title: 'Parenting', claims: [] } : null) },
      AuthoredExploration: { find: () => query([]) },
      Article: {},
      NotebookEntry: { find: () => query([]) },
      Question: {},
      createBlockId: () => 'block-1'
    }));
    server = await listen(app);
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  it('serves private continuations only to human credentials and prevents response caching', async () => {
    const response = await fetch(`${base}/api/authored-explorations`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ explorations: [] });
    const agent = await fetch(`${base}/api/authored-explorations`, { headers: { 'x-agent': '1' } });
    expect(agent.status).toBe(403);
  });

  it('requires a bounded explicit query and human credentials for writing search', async () => {
    const response = await fetch(`${base}/api/authored-work/search?q=remembered`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ results: [], limited: false });
    for (const suffix of ['', '?q=x', `?q=${'x'.repeat(161)}`, '?q[]=hidden']) {
      expect((await fetch(`${base}/api/authored-work/search${suffix}`)).status).toBe(400);
    }
    expect((await fetch(`${base}/api/authored-work/search?q=private`, { headers: { 'x-agent': '1' } })).status).toBe(403);
  });

  it('returns the authenticated owner as the cache namespace', async () => {
    const response = await fetch(`${base}/api/wiki/pages/page-1/explorations`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ explorations: [], userId: 'owner' });
  });

  it('does not reveal another owner page or enumerate private drafts for agent credentials', async () => {
    const foreign = await fetch(`${base}/api/wiki/pages/page-1/explorations`, { headers: { 'x-user': 'foreign' } });
    expect(foreign.status).toBe(404);
    const agentRead = await fetch(`${base}/api/wiki/pages/page-1/explorations`, { headers: { 'x-agent': '1' } });
    expect(agentRead.status).toBe(403);
    expect(await agentRead.json()).toEqual({ error: 'Only the human owner can access private authored work.' });
    const agent = await fetch(`${base}/api/wiki/pages/page-1/claims/claim-1/exploration`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-agent': '1' },
      body: JSON.stringify({ expectedRevision: 0, mutationId: 'save-1', draft: {} })
    });
    expect(agent.status).toBe(403);
  });
});
