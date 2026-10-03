import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, toolDefinitions } from '../src/server.js';
import { NoeisClient } from '../src/client.js';
import policy from '../src/chatgptAccessPolicy.cjs';
const connect = async (accessProfile, grantedScopes) => {
  let writes = 0;
  const server = createMcpServer({ accessProfile, grantedScopes, client: {
    getConnectionInfo: async () => ({ workspace: { id: 'owner' } }),
    fileEditionItems: async () => { writes++; return { added: 1 }; }
  } });
  const client = new Client({ name: 'restricted-policy-test', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  return { server, client, writes: () => writes };
};
const restricted = await connect('chatgpt', ['read','agent-write']);
const readOnly = await connect('chatgpt', ['read']);
const legacy = await connect(undefined, ['read','agent-write']);
try {
  const list = await restricted.client.listTools();
  const names = new Set(list.tools.map(tool => tool.name));
  for (const name of names) assert.equal(policy.isChatgptToolAllowed(name), true, name);
  for (const name of ['update_page','update_judgment_page','archive_page','update_highlight','accept_proposal','merge_proposal','create_notebook_entry','configure_edition','create_edition']) {
    assert.equal(names.has(name), false, name);
    const denied = await restricted.client.callTool({ name, arguments: {} });
    assert.equal(denied.isError, true, name);
  }
  for (const name of ['get_profile','get_source_thought_context','file_edition_items','ingest_source','draft_page','add_source']) assert.equal(names.has(name), true, name);
  const legacyNames = (await legacy.client.listTools()).tools.map(tool => tool.name);
  assert.equal(legacyNames.includes('update_page'), true);
  const args = { profile: 'power-through', items: [{ title: 'source', url: 'https://example.com', section: 'thesis_evidence', finding: 'new evidence', boundary: 'limited sample' }] };
  // Schema errors must not reach the fake API; use the real schema's accepted fields.
  const fileTool = list.tools.find(tool => tool.name === 'file_edition_items');
  assert.deepEqual(fileTool._meta.securitySchemes, [{ type: 'oauth2', scopes: ['agent-write'] }]);
  const denied = await readOnly.client.callTool({ name: 'file_edition_items', arguments: args });
  assert.equal(denied.isError, true); assert.equal(readOnly.writes(), 0);
  assert.equal(restricted.writes(), 0, 'denied arbitrary tools must never invoke client');
  const saved = await restricted.client.callTool({ name: 'file_edition_items', arguments: args });
  assert.notEqual(saved.isError, true); assert.equal(restricted.writes(), 1);
} finally {
  await Promise.all([restricted.client.close(), readOnly.client.close(), legacy.client.close(), restricted.server.close(), readOnly.server.close(), legacy.server.close()]);
}
// Exercise the real client path resolution for every exposed read tool.
const api = new NoeisClient({ token: 'ntk_at_fixture', apiUrl: 'https://api.example' });
const paths = [];
api.request = async (path, options = {}) => {
  assert.equal(policy.isChatgptRequestAllowed({ method: options.method || 'GET', originalUrl: path }), true, path);
  paths.push(path);
  return { id: 'id', _id: 'id', articleId: 'id', linkedArticleId: 'id', linkedHighlightIds: ['id'],
    text: 'exact passage', note: 'reader note', title: 'Source', workspace: { id: 'owner' },
    editions: [], entries: [], highlights: [], sources: [], sourceRefs: [] };
};
for (const tool of toolDefinitions.filter(tool => policy.CHATGPT_READ_TOOLS.includes(tool.name))) {
  const before = paths.length;
  await tool.handler(api, { pageId: 'id', articleId: 'id', highlightId: 'id', entryId: 'id', editionId: 'id',
    questionId: 'id', runId: 'id', name: 'id', query: 'source', limit: 2 });
  assert.ok(paths.length > before, `read tool ${tool.name} must reach its permitted real REST path`);
}
console.log('ChatGPT MCP restricted discovery/dispatch, scope and legacy profile passed');
