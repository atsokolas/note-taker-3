import assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { NoeisClient } from '../src/client.js';
import { createMcpServer, toolDefinitions } from '../src/server.js';
import { renderWikiSchemaPrompt } from '../src/prompts/wiki_schema.js';

const run = async () => {
  const requiredReadTools = [
    'list_pages',
    'get_page',
    'search_pages',
    'list_sources',
    'list_backlinks',
    'list_autolinks',
    'list_revisions',
    'list_activity',
    'get_schema',
    'list_proposals',
    'get_briefing'
  ];
  for (const name of requiredReadTools) {
    assert(toolDefinitions.some(tool => tool.name === name), `missing ${name}`);
  }
  assert(toolDefinitions.some(tool => tool.name === 'create_page'));

  const seenRequests = [];
  const jsonResponse = (payload) => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'application/json']]),
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  });

  const client = new NoeisClient({
    token: 'ntk_at_test',
    apiUrl: 'https://noeis.example',
    fetchImpl: async (url, init) => {
      seenRequests.push({ url: String(url), init });
      const requestUrl = new URL(String(url));
      if (requestUrl.pathname.endsWith('/schema')) return jsonResponse({ content: '# Wiki Schema' });
      if (requestUrl.pathname.endsWith('/briefing')) return jsonResponse({ summary: 'Updated today' });
      if (requestUrl.pathname.endsWith('/proposals')) return jsonResponse({ proposals: [] });
      if (requestUrl.pathname.endsWith('/activity')) {
        return jsonResponse({
          events: [
            { id: 'new-event', title: 'New event', at: '2026-05-16T12:00:00.000Z' },
            { id: 'old-event', title: 'Old event', at: '2026-05-01T12:00:00.000Z' }
          ]
        });
      }
      if (requestUrl.pathname.endsWith('/revisions')) {
        return jsonResponse({ revisions: [{ id: 'rev-1' }, { id: 'rev-2' }] });
      }
      if (requestUrl.pathname.endsWith('/backlinks')) return jsonResponse({ backlinks: [{ id: 'page-2', title: 'Moats' }] });
      if (requestUrl.pathname.endsWith('/autolinks')) return jsonResponse({ autolinks: [{ id: 'page-3', title: 'Cash flow' }] });
      if (requestUrl.pathname.includes('/api/wiki/pages/page-1')) {
        return jsonResponse({
          _id: 'page-1',
          title: 'Compounding',
          pageType: 'concept',
          slug: 'compounding',
          bodyMarkdown: 'Compounding turns reinvested returns into durable advantage.',
          sourceRefs: [{ id: 'source-1', title: 'Buffett letter' }],
          claims: [{ id: 'claim-1', text: 'Reinvestment matters.' }],
          aiState: { infobox: { Summary: 'Capital compounds.' } },
          updatedAt: '2026-05-16T12:00:00.000Z'
        });
      }
      return jsonResponse([
        {
          _id: 'page-1',
          title: 'Compounding',
          pageType: 'concept',
          slug: 'compounding',
          plainText: 'Compounding is the engine that turns reinvested returns into durable advantage.',
          updatedAt: '2026-05-16T12:00:00.000Z'
        }
      ]);
    }
  });

  const listPages = toolDefinitions.find(tool => tool.name === 'list_pages');
  const pages = await listPages.handler(client, { q: 'compound', limit: 5 });
  assert.deepStrictEqual(Object.keys(pages[0]), ['id', 'title', 'pageType', 'slug', 'updatedAt']);
  assert.strictEqual(pages[0].id, 'page-1');
  assert.strictEqual(pages[0].title, 'Compounding');
  assert(seenRequests[0].url.includes('/api/wiki/pages?q=compound&limit=5'));
  assert.strictEqual(seenRequests[0].init.headers.Authorization, 'Bearer ntk_at_test');

  const searchPages = toolDefinitions.find(tool => tool.name === 'search_pages');
  const hits = await searchPages.handler(client, { query: 'reinvested', limit: 5 });
  assert.strictEqual(hits[0].id, 'page-1');
  assert(hits[0].snippet.includes('reinvested returns'));

  const getPage = toolDefinitions.find(tool => tool.name === 'get_page');
  const page = await getPage.handler(client, { pageId: 'page-1' });
  assert.strictEqual(page.sources[0].title, 'Buffett letter');
  assert.strictEqual(page.infobox.Summary, 'Capital compounds.');

  const listSources = toolDefinitions.find(tool => tool.name === 'list_sources');
  const sources = await listSources.handler(client, { pageId: 'page-1' });
  assert.strictEqual(sources.sources[0].id, 'source-1');

  const activity = await toolDefinitions.find(tool => tool.name === 'list_activity').handler(client, {
    since: '2026-05-10T00:00:00.000Z',
    limit: 10
  });
  assert.strictEqual(activity.events.length, 1);
  assert(seenRequests.some(request => request.url.includes('/api/wiki/activity?limit=10&since=2026-05-10T00%3A00%3A00.000Z')));

  await toolDefinitions.find(tool => tool.name === 'list_revisions').handler(client, { pageId: 'page-1', limit: 1 });
  assert(seenRequests.some(request => request.url.includes('/api/wiki/pages/page-1/revisions?limit=1')));

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
    name: 'search_pages',
    arguments: { query: 'compound', limit: 5 }
  });
  assert(called.content[0].text.includes('Compounding'));
  assert(called.content[0].text.includes('snippet'));

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
