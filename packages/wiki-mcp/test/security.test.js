import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/server.js';

let calls = 0;
const server = createMcpServer({ client: { searchPages: async () => { calls += 1; return []; } } });
const client = new Client({ name: 'security-test', version: '1' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({
    name: 'search_pages',
    arguments: { query: 'safe fixture', extra: Array(10001).fill(null) }
  });
  assert.equal(result.isError, true, 'tool input must be bounded before schema validation');
  assert.match(result.content[0].text, /maximum.*10000.*elements/);
  assert.equal(calls, 0, 'oversized input must not reach the API client');
  const normal = await client.callTool({ name: 'search_pages', arguments: { query: 'safe fixture' } });
  assert.notEqual(normal.isError, true);
  assert.equal(calls, 1, 'a normal call still works after rejection');
  console.log('MCP input element limit: passed');
} finally {
  await client.close();
  await server.close();
}
