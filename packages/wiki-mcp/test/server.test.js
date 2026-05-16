import assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { NoeisClient } from '../src/client.js';
import { createMcpServer, toolDefinitions } from '../src/server.js';
import { renderWikiSchemaPrompt } from '../src/prompts/wiki_schema.js';

const run = async () => {
  assert(toolDefinitions.some(tool => tool.name === 'list_pages'));
  assert(toolDefinitions.some(tool => tool.name === 'get_schema'));
  assert(toolDefinitions.some(tool => tool.name === 'create_page'));

  const seenRequests = [];
  const client = new NoeisClient({
    token: 'ntk_at_test',
    apiUrl: 'https://noeis.example',
    fetchImpl: async (url, init) => {
      seenRequests.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        async json() {
          return String(url).includes('/schema')
            ? { content: '# Wiki Schema' }
            : [{ _id: 'page-1', title: 'Compounding' }];
        },
        async text() {
          return 'markdown';
        }
      };
    }
  });

  const listPages = toolDefinitions.find(tool => tool.name === 'list_pages');
  const pages = await listPages.handler(client, { q: 'compound', limit: 5 });
  assert.strictEqual(pages[0].title, 'Compounding');
  assert(seenRequests[0].url.includes('/api/wiki/pages?q=compound&limit=5'));
  assert.strictEqual(seenRequests[0].init.headers.Authorization, 'Bearer ntk_at_test');

  const prompt = await renderWikiSchemaPrompt(client);
  assert(prompt.messages[0].content.text.includes('# Wiki Schema'));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpServer = createMcpServer({ client });
  const mcpClient = new Client({ name: 'test-client', version: '0.1.0' });
  await Promise.all([
    mcpServer.connect(serverTransport),
    mcpClient.connect(clientTransport)
  ]);

  const listed = await mcpClient.listTools();
  assert(listed.tools.some(tool => tool.name === 'list_pages'));

  const called = await mcpClient.callTool({
    name: 'list_pages',
    arguments: { q: 'compound', limit: 5 }
  });
  assert(called.content[0].text.includes('Compounding'));

  const prompts = await mcpClient.listPrompts();
  assert(prompts.prompts.some(row => row.name === 'wiki_schema'));
  const schemaPrompt = await mcpClient.getPrompt({ name: 'wiki_schema' });
  assert(schemaPrompt.messages[0].content.text.includes('# Wiki Schema'));

  await mcpClient.close();
  await mcpServer.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
