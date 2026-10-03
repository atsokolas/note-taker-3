import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, toolDefinitions, toolMetadata } from '../src/server.js';

async function connect(id, scopes) {
  let writes = 0;
  const server = createMcpServer({
    client: {
      getConnectionInfo: async () => ({ workspace: { id, label: 'Private workspace' } }),
      createNotebookEntry: async () => { writes++; return { id: 'saved', content: 'reader thought' }; }
    },
    grantedScopes: scopes,
    resourceMetadataUrl: 'https://noeis.example/.well-known/oauth-protected-resource/mcp'
  });
  const client = new Client({ name: 'chatgpt-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { client, server, writes: () => writes };
}

const a = await connect('opaque-account-a', ['read']);
const b = await connect('opaque-account-b', ['read', 'agent-write']);
try {
  const list = await a.client.listTools();
  const profile = list.tools.find(tool => tool.name === 'get_profile');
  assert.equal(profile._meta['openai/profile'], true);
  assert.equal(profile.annotations.readOnlyHint, true);
  assert.deepEqual(profile._meta.securitySchemes, [{ type: 'oauth2', scopes: ['read'] }]);
  assert.deepEqual(profile.outputSchema.required, ['id']);
  const first = await a.client.callTool({ name: 'get_profile', arguments: {} });
  const second = await b.client.callTool({ name: 'get_profile', arguments: {} });
  assert.equal(first.structuredContent.id, 'opaque-account-a');
  assert.equal(second.structuredContent.id, 'opaque-account-b');
  assert.deepEqual(JSON.parse(first.content[0].text), first.structuredContent);
  const denied = await a.client.callTool({ name: 'create_notebook_entry', arguments: { title: 'Thought', content: 'reader thought' } });
  assert.equal(denied.isError, true);
  assert.match(denied._meta['mcp/www_authenticate'][0], /insufficient_scope/);
  assert.equal(a.writes(), 0, 'read-only grant must stop a write before touching the API');
  const saved = await b.client.callTool({ name: 'create_notebook_entry', arguments: { title: 'Thought', content: 'reader thought' } });
  assert.notEqual(saved.isError, true);
  assert.equal(b.writes(), 1);
  for (const tool of toolDefinitions) {
    const metadata = toolMetadata(tool);
    for (const key of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof metadata.annotations[key], 'boolean', tool.name);
  }
  assert.equal(toolMetadata(toolDefinitions.find(tool => tool.name === 'delete_article')).annotations.destructiveHint, true);
  assert.equal(toolMetadata(toolDefinitions.find(tool => tool.name === 'create_article')).annotations.openWorldHint, true);
} finally {
  await Promise.all([a.client.close(), b.client.close(), a.server.close(), b.server.close()]);
}
console.log('ChatGPT profile, account separation, permission challenge and metadata tests passed');
