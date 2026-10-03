import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, toolDefinitions } from '../src/server.js';
import { NoeisClient } from '../src/client.js';
import policy from '../src/chatgptAccessPolicy.cjs';
const connect = async (accessProfile, grantedScopes, overrides = {}) => {
  let writes = 0;
  const server = createMcpServer({ accessProfile, grantedScopes, client: {
    getConnectionInfo: async () => ({ workspace: { id: 'owner' } }),
    fileEditionItems: async () => { writes++; return { added: 1 }; },
    ...overrides
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
// Restricted outcomes must never recommend unavailable legacy writes or claim
// prepared wording is already accepted. Run polling follows the same contract.
const apiResult = { status: 'ignored', suggestedCreatePage: { title: 'Unclaimed source' }, nextStep: 'Call create_page to keep it.' };
const outcomes = [apiResult, { status: 'ignored', nextStep: 'Nothing further needed.' },
  { status: 'processed', affectedPageIds: ['page-1'], nextStep: 'Folded into pages.' },
  { status: 'processing', runId: 'run-1' }, { status: 'failed', errorMessage: 'Source unavailable' }];
let current;
const scoped = await connect('chatgpt', ['read', 'agent-write'], { ingestSource: async () => current, getIngestRun: async () => current });
const original = await connect(undefined, ['read', 'agent-write'], { ingestSource: async () => apiResult });
try {
  const listed = await scoped.client.listTools();
  for (const name of ['ingest_source', 'draft_page', 'add_source']) {
    const description = listed.tools.find(tool => tool.name === name).description;
    assert.doesNotMatch(description, /create_page/);
    assert.match(description, /human|reader/);
    assert.match(description, /accepted/);
  }
  for (current of outcomes) {
    for (const name of ['ingest_source', 'get_ingest_run']) {
      const result = await scoped.client.callTool({ name, arguments: name === 'ingest_source' ? { source: { type: 'url', url: 'https://example.com/source' }, waitMs: 0 } : { runId: 'run-1' } });
      assert.notEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.doesNotMatch(payload.nextStep, /create_page|Nothing further needed|Folded into/);
      if (current.suggestedCreatePage) assert.match(payload.nextStep, /reader to create a page in NOEIS/);
      else if (current.status === 'ignored') assert.match(payload.nextStep, /list_proposals/);
      else if (current.status === 'processed') assert.match(payload.nextStep, /pending human review/);
      else if (current.status === 'processing') assert.match(payload.nextStep, /get_ingest_run slowly/);
      else assert.match(payload.nextStep, /failed/);
    }
  }
  const legacyResult = await original.client.callTool({ name: 'ingest_source', arguments: { source: { type: 'url', url: 'https://example.com/source' } } });
  assert.equal(JSON.parse(legacyResult.content[0].text).nextStep, 'Call create_page to keep it.');
  assert.equal(apiResult.nextStep, 'Call create_page to keep it.', 'scoped handling must not mutate legacy API results');
} finally {
  await Promise.all([scoped.client.close(), original.client.close(), scoped.server.close(), original.server.close()]);
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
// Deep links use the configured app origin, never the API or request Host.
for (const appUrl of ['http://127.0.0.1:3000', 'https://staging.noeis.example']) {
  const local = new NoeisClient({ token: 'fixture', appUrl, env: {} });
  local.request = async path => path.startsWith('/api/highlights')
    ? { _id: 'highlight-fixture', articleId: 'article-fixture', text: 'Exact source', note: '' }
    : { _id: 'article-fixture', title: 'Source' };
  const context = await local.getSourceThoughtContext({ highlightId: 'highlight-fixture' });
  assert.equal(context.links.article, `${appUrl}/articles/article-fixture`);
  assert.equal(context.links.passage, `${appUrl}/library?articleId=article-fixture&highlightId=highlight-fixture`);
}
assert.equal(new NoeisClient({ token: 'fixture', env: {} }).appUrl, 'https://www.noeis.io');
assert.equal(new NoeisClient({ token: 'fixture', env: { FRONTEND_URL: 'https://frontend-only.example' } }).appUrl, 'https://frontend-only.example');
assert.equal(new NoeisClient({ token: 'fixture', env: { FRONTEND_URL: 'https://fallback.example', NOEIS_APP_URL: 'https://primary.example' } }).appUrl, 'https://primary.example');
assert.equal(new NoeisClient({ token: 'fixture', env: { NOEIS_APP_URL: 'http://localhost:3000' } }).appUrl, 'http://localhost:3000');
for (const appUrl of ['http://public.example', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?host=evil', 'javascript:alert(1)']) {
  assert.throws(() => new NoeisClient({ token: 'fixture', appUrl, env: {} }));
}
console.log('ChatGPT MCP restricted discovery/dispatch, scope and legacy profile passed');
