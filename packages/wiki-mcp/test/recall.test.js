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
  '/api/recall': {
    query: 'hiring',
    results: [
      { kind: 'note', id: 'n1', title: 'Hiring notes', passage: 'Hire for slope, not intercept.' },
      { kind: 'highlight', id: 'a1', highlightId: 'h1', title: 'Placeholder paper', passage: 'Base rates beat interviews.' },
      { kind: 'view', id: 'p1', title: 'Interviews', passage: 'You hold: interviews predict little.', held: 'Interviews predict little.' }
    ]
  },
  '/api/brief': {
    topic: 'hiring',
    note: [{ kind: 'note', id: 'n1', title: 'Hiring notes', passage: 'Hire for slope, not intercept.' }],
    question: [{ kind: 'question', id: 'q1', title: 'Do work samples beat interviews?', passage: 'Do work samples beat interviews?' }],
    pencil: [{ kind: 'note', id: 'n2', title: 'Panels', passage: 'Panels overweight charisma.', pencil: 'Codex' }]
  },
  '/api/recall/read/n1': { kind: 'note', id: 'n1', title: 'Hiring notes', text: 'Hire for slope, not intercept.' },
  '/api/editions': {
    editions: [{
      _id: 'e1',
      title: 'This Week in AI',
      windowEnd: '2026-11-07',
      matches: [{ itemId: 'i1', title: 'Hiring agents', url: 'https://example.com/s', section: 'work', finding: 'Teams hire agents first.' }]
    }]
  }
};

const run = async () => {
  /* One question reaches the library and the Editions; every hit says where
     it opens in the app and which tool reads it. */
  {
    const { client, calls } = clientRouted(WORKSPACE);
    const found = await client.recall({ query: '  what have I written   about hiring ', limit: 6 });
    assert.strictEqual(found.query, 'what have I written about hiring');
    assert.deepStrictEqual(found.results.map(hit => [hit.kind, hit.id, hit.open]), [
      ['note', 'n1', 'read'],
      ['highlight', 'a1', 'read'],
      ['view', 'p1', 'read'],
      ['edition', 'e1', 'get_edition']
    ]);
    assert.strictEqual(found.unavailable, undefined);
    const byKind = Object.fromEntries(found.results.map(hit => [hit.kind, hit]));
    assert.strictEqual(byKind.note.link, 'https://www.noeis.io/think?tab=notebook&entryId=n1');
    assert.strictEqual(byKind.highlight.link, 'https://www.noeis.io/library?articleId=a1&highlightId=h1');
    assert.strictEqual(byKind.view.link, 'https://www.noeis.io/wiki/workspace?page=p1');
    assert.strictEqual(byKind.edition.passage, 'Teams hire agents first.');

    const asked = Object.fromEntries(calls.map(url => [url.pathname, url.searchParams]));
    assert.strictEqual(asked['/api/recall'].get('q'), 'what have I written about hiring');
    assert.strictEqual(asked['/api/recall'].get('limit'), '6');
    assert.strictEqual(asked['/api/editions'].get('limit'), '5');
    assert.strictEqual(calls.length, 2);
  }

  /* A surface that fails is named, never shown as empty. */
  {
    const { client } = clientRouted({ ...WORKSPACE, '/api/editions': { status: 500, body: { error: 'down' } } });
    const found = await client.recall({ query: 'hiring' });
    assert.strictEqual(found.results.length, 3);
    assert.deepStrictEqual(found.unavailable.map(entry => entry.kind), ['editions']);
  }

  /* A refused credential is not a partial answer. */
  {
    const { client } = clientRouted({ ...WORKSPACE, '/api/recall': { status: 401, body: { error: 'Invalid token' } } });
    await assert.rejects(client.recall({ query: 'hiring' }), error => error.status === 401);
  }

  /* Nothing bears on it, nothing comes back: no filler. */
  {
    const { client } = clientRouted({ '/api/recall': { query: 'absent', results: [] }, '/api/editions': { editions: [] } });
    assert.deepStrictEqual(await client.recall({ query: 'absent' }), { query: 'absent', results: [] });
  }

  await assert.rejects(new NoeisClient({ token: 't', env: {}, fetchImpl: async () => { throw new Error('no call'); } })
    .recall({ query: '   ' }), /query is required/);

  /* brief asks once and links everything, pencil kept apart. */
  {
    const { client, calls } = clientRouted(WORKSPACE);
    const brief = await client.brief({ topic: ' hiring ' });
    assert.strictEqual(calls[0].searchParams.get('topic'), 'hiring');
    assert.strictEqual(brief.question[0].link, 'https://www.noeis.io/think?tab=questions&questionId=q1');
    assert.deepStrictEqual(brief.pencil.map(hit => [hit.id, hit.pencil]), [['n2', 'Codex']]);
  }

  /* read opens any hit by id, with its link. */
  {
    const { client } = clientRouted(WORKSPACE);
    const source = await client.read({ id: 'n1' });
    assert.strictEqual(source.text, 'Hire for slope, not intercept.');
    assert.strictEqual(source.link, 'https://www.noeis.io/think?tab=notebook&entryId=n1');
  }

  /* Over MCP: listed as read-only, validated, callable on a read grant. */
  {
    const { client: noeis } = clientRouted(WORKSPACE);
    const server = createMcpServer({ client: noeis, grantedScopes: ['read'] });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const mcp = new Client({ name: 'recall-test', version: '0.0.0' });
    await mcp.connect(clientSide);

    /* Every agent is told, on connecting, to recall first and never to pass pencil off as the reader's. */
    assert.match(mcp.getInstructions(), /Start a session with brief/);
    assert.match(mcp.getInstructions(), /call recall/);
    assert.match(mcp.getInstructions(), /pencil[\s\S]*Never present it as the reader's own view/);

    const { tools } = await mcp.listTools();
    for (const name of ['brief', 'recall', 'read']) {
      const tool = tools.find(entry => entry.name === name);
      assert.ok(tool, `${name} is listed`);
      assert.strictEqual(tool.annotations.readOnlyHint, true);
      assert.deepStrictEqual(tool._meta.securitySchemes, [{ type: 'oauth2', scopes: ['read'] }]);
    }

    const result = await mcp.callTool({ name: 'recall', arguments: { query: 'hiring' } });
    assert.ok(!result.isError);
    assert.strictEqual(JSON.parse(result.content[0].text).results[0].id, 'n1');

    const opened = await mcp.callTool({ name: 'read', arguments: { id: 'n1' } });
    assert.strictEqual(JSON.parse(opened.content[0].text).title, 'Hiring notes');

    const refused = await mcp.callTool({ name: 'recall', arguments: { query: '' } });
    assert.ok(refused.isError);
    await mcp.close();
  }
};

run().then(() => console.log('recall tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
