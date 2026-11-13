import assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { NoeisClient } from '../src/client.js';
import { createMcpServer } from '../src/server.js';

/* Answers by path, the way the API would, and remembers what was asked. */
const clientRouted = (routes) => {
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    calls.push(parsed);
    const route = routes[parsed.pathname];
    const answer = typeof route === 'function' ? route(parsed) : route;
    const status = answer?.status || 200;
    const body = answer?.status ? answer.body : answer;
    return {
      ok: status < 400,
      status,
      headers: { get: () => 'application/json' },
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  };
  return { client: new NoeisClient({ token: 't', env: {}, fetchImpl }), calls };
};

const WORKSPACE = {
  '/api/wiki/pages': [{ _id: 'p1', title: 'Sparse models', pageType: 'concept', bodyMarkdown: 'Placeholder page about sparse models.', updatedAt: '2026-11-01' }],
  '/api/highlights': [{ _id: 'h1', articleId: 'a1', articleTitle: 'Placeholder paper', text: 'Sparse models cost less.', note: 'Check the baseline.' }],
  '/api/articles': [{ _id: 'a1', title: 'Placeholder paper', siteName: 'example.com', author: 'A. Writer' }],
  '/api/editions': {
    editions: [{
      _id: 'e1',
      title: 'This Week in AI',
      windowEnd: '2026-11-07',
      matches: [{ itemId: 'i1', title: 'Sparse scaling', url: 'https://example.com/s', section: 'models', finding: 'Sparse models scale cheaper.' }]
    }]
  }
};

const run = async () => {
  /* One question reaches every surface, each with its own query, and every
     hit says where to open it. */
  {
    const { client, calls } = clientRouted(WORKSPACE);
    const found = await client.searchNoeis({ query: '  sparse   models ', limit: 3 });
    assert.strictEqual(found.query, 'sparse models');
    assert.deepStrictEqual(found.results.map(hit => [hit.kind, hit.id, hit.open]), [
      ['wiki_page', 'p1', 'get_page'],
      ['highlight', 'h1', 'get_highlight'],
      ['article', 'a1', 'get_article'],
      ['edition', 'e1', 'get_edition']
    ]);
    assert.strictEqual(found.unavailable, undefined);
    const byKind = Object.fromEntries(found.results.map(hit => [hit.kind, hit]));
    assert.strictEqual(byKind.wiki_page.link, 'https://www.noeis.io/wiki/workspace?page=p1');
    assert.strictEqual(byKind.highlight.link, 'https://www.noeis.io/library?articleId=a1&highlightId=h1');
    assert.strictEqual(byKind.highlight.snippet, 'Sparse models cost less. Note: Check the baseline.');
    assert.strictEqual(byKind.article.link, 'https://www.noeis.io/articles/a1');
    assert.strictEqual(byKind.edition.link, 'https://www.noeis.io/editions/e1');
    assert.strictEqual(byKind.edition.snippet, 'Sparse models scale cheaper.');
    assert.strictEqual(byKind.edition.matches[0].itemId, 'i1');

    const asked = Object.fromEntries(calls.map(url => [url.pathname, url.searchParams]));
    assert.strictEqual(asked['/api/wiki/pages'].get('q'), 'sparse models');
    assert.strictEqual(asked['/api/highlights'].get('q'), 'sparse models');
    assert.strictEqual(asked['/api/articles'].get('query'), 'sparse models');
    assert.strictEqual(asked['/api/editions'].get('q'), 'sparse models');
    assert.strictEqual(asked['/api/editions'].get('limit'), '3');
    /* Every read goes out as this connection, and only as a GET. */
    assert.strictEqual(calls.length, 4);
  }

  /* Narrowed to one surface, the others are never asked. */
  {
    const { client, calls } = clientRouted(WORKSPACE);
    const found = await client.searchNoeis({ query: 'sparse', kinds: ['editions'] });
    assert.deepStrictEqual(found.results.map(hit => hit.kind), ['edition']);
    assert.deepStrictEqual(calls.map(url => url.pathname), ['/api/editions']);
  }

  /* A surface that fails is named, never shown as empty. */
  {
    const { client } = clientRouted({ ...WORKSPACE, '/api/editions': { status: 500, body: { error: 'down' } } });
    const found = await client.searchNoeis({ query: 'sparse' });
    assert.ok(!found.results.some(hit => hit.kind === 'edition'));
    assert.deepStrictEqual(found.unavailable.map(entry => entry.kind), ['editions']);
  }

  /* A refused credential is not a partial answer. */
  {
    const { client } = clientRouted({ ...WORKSPACE, '/api/highlights': { status: 401, body: { error: 'Invalid token' } } });
    await assert.rejects(client.searchNoeis({ query: 'sparse' }), error => error.status === 401);
  }

  /* Nothing matches, nothing comes back: no filler. */
  {
    const { client } = clientRouted({ '/api/wiki/pages': [], '/api/highlights': [], '/api/articles': [], '/api/editions': { editions: [] } });
    assert.deepStrictEqual(await client.searchNoeis({ query: 'absent' }), { query: 'absent', results: [] });
  }

  await assert.rejects(new NoeisClient({ token: 't', env: {}, fetchImpl: async () => { throw new Error('no call'); } })
    .searchNoeis({ query: '   ' }), /query is required/);

  /* Over MCP: listed as read-only, validated, and callable. */
  {
    const { client: noeis } = clientRouted(WORKSPACE);
    const server = createMcpServer({ client: noeis });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const mcp = new Client({ name: 'search-test', version: '0.0.0' });
    await mcp.connect(clientSide);

    const { tools } = await mcp.listTools();
    const tool = tools.find(entry => entry.name === 'search_noeis');
    assert.ok(tool, 'search_noeis is listed');
    assert.strictEqual(tool.annotations.readOnlyHint, true);
    assert.strictEqual(tool.annotations.destructiveHint, false);
    assert.deepStrictEqual(tool._meta.securitySchemes, [{ type: 'oauth2', scopes: ['read'] }]);

    const result = await mcp.callTool({ name: 'search_noeis', arguments: { query: 'sparse', kinds: ['wiki'] } });
    assert.ok(!result.isError);
    assert.strictEqual(JSON.parse(result.content[0].text).results[0].id, 'p1');

    const refused = await mcp.callTool({ name: 'search_noeis', arguments: { query: '' } });
    assert.ok(refused.isError);
    await mcp.close();
  }

  /* A read grant is enough; nothing more is asked of the token. */
  {
    const { client: noeis } = clientRouted(WORKSPACE);
    const server = createMcpServer({ client: noeis, grantedScopes: ['read'] });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const mcp = new Client({ name: 'search-test', version: '0.0.0' });
    await mcp.connect(clientSide);
    const result = await mcp.callTool({ name: 'search_noeis', arguments: { query: 'sparse' } });
    assert.ok(!result.isError);
    await mcp.close();
  }
};

run().then(() => console.log('search tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
