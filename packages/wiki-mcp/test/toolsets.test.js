import assert from 'assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMcpServer, toolDefinitions } from '../src/server.js';
import { CORE_TOOLS, parseToolsets, toolsetOf } from '../src/toolsets.js';

const connect = async (options) => {
  const server = createMcpServer(options);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const mcp = new Client({ name: 'toolsets-test', version: '0.0.0' });
  await mcp.connect(clientSide);
  return mcp;
};

const names = async (mcp) => (await mcp.listTools()).tools.map(tool => tool.name).sort();

const noCalls = { getConnectionInfo: async () => ({ grant: { scopes: ['read'] } }) };

const run = async () => {
  /* Every core name is a real tool, so a rename cannot shrink core silently. */
  const all = toolDefinitions.map(tool => tool.name);
  CORE_TOOLS.forEach(name => assert.ok(all.includes(name), `${name} is a tool`));

  /* By default an agent sees core and nothing else. */
  {
    const mcp = await connect({ client: noCalls, grantedScopes: ['read', 'agent-write'] });
    assert.deepStrictEqual(await names(mcp), [...CORE_TOOLS].sort());
    /* A tool outside core is unlisted, not gone: old prompts still work. */
    const hidden = await mcp.callTool({ name: 'list_concepts', arguments: {} });
    assert.ok(!/Tool list_concepts not found/.test(hidden.content?.[0]?.text || ''));
    await mcp.close();
  }

  /* Asked for, a toolset joins core. */
  {
    const mcp = await connect({ client: noCalls, grantedScopes: ['read'], toolsets: 'wiki' });
    const listed = await names(mcp);
    assert.ok(listed.includes('get_briefing') && listed.includes('recall'));
    assert.ok(!listed.includes('list_concepts'));
    await mcp.close();
  }

  /* `all` is the whole surface. */
  {
    const mcp = await connect({ client: noCalls, grantedScopes: ['read'], toolsets: 'all' });
    assert.strictEqual((await names(mcp)).length, toolDefinitions.length);
    await mcp.close();
  }

  /* Work is listed for a grant that includes it, hosted or local. */
  {
    const hosted = await connect({ client: noCalls, grantedScopes: ['read', 'work'] });
    assert.ok((await names(hosted)).includes('list_work'));
    await hosted.close();
    const local = await connect({ client: { getConnectionInfo: async () => ({ grant: { scopes: ['read', 'work'] } }) } });
    assert.ok((await names(local)).includes('list_work'));
    await local.close();
    const plain = await connect({ client: noCalls });
    assert.ok(!(await names(plain)).includes('list_work'));
    await plain.close();
  }

  /* An API that cannot answer the grant lookup still lists core. */
  {
    const mcp = await connect({ client: { getConnectionInfo: async () => { throw new Error('asleep'); } } });
    assert.deepStrictEqual(await names(mcp), [...CORE_TOOLS].sort());
    await mcp.close();
  }

  /* Unknown names are refused rather than quietly ignored. */
  assert.throws(() => parseToolsets('wiki,everything'), /Unknown Noeis toolset: everything/);
  assert.deepStrictEqual([...parseToolsets('')], ['core']);

  /* Each tool lands in the toolset its name says. */
  assert.strictEqual(toolsetOf('update_work_note'), 'work');
  assert.strictEqual(toolsetOf('get_edition'), 'editions');
  assert.strictEqual(toolsetOf('delete_highlight'), 'library');
  assert.strictEqual(toolsetOf('list_concept_notes'), 'think');
  assert.strictEqual(toolsetOf('lint_wiki'), 'wiki');
};

run().then(() => console.log('toolset tests passed')).catch((error) => {
  console.error(error);
  process.exit(1);
});
