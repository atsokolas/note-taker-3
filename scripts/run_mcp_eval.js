#!/usr/bin/env node
// Asks Noeis the eval's questions the way an outside agent does: the real API
// on a throwaway database, a real agent token, and the published MCP server
// over stdio. It scores what the agent gets back from `recall`, not what any
// model then writes, and reports what the tool list costs the agent's context.
// Last, it writes a note as the agent and checks recall hands it back in
// pencil, never as the reader's own.
//
//   npm run agent:eval:mcp                    report
//   npm run agent:eval:mcp -- --verbose       print every hit
//   npm run agent:eval:mcp -- --toolsets=all  price a wider tool list
//
// Never the app's MONGODB_URI: like agent:eval it takes AGENT_EVAL_MONGODB_URI
// (a replica set) or starts one in memory, and drops what it made.
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const { CASES } = require('../server/agentEval/cases');
const { seedLibrary } = require('../server/agentEval/library');

const ROOT = path.join(__dirname, '..');
const TOP_K = 8;
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => (args.find(arg => arg.startsWith(`--${name}=`)) || '').split('=')[1] || '';

// An outside agent has no source open, so the cases asked from one are out.
const AGENT_CASES = CASES.filter(item => !item.surface.startsWith('article:'));

const openDatabase = async () => {
  const dbName = `noeis_mcp_eval_${crypto.randomBytes(4).toString('hex')}`;
  const explicit = String(process.env.AGENT_EVAL_MONGODB_URI || '').trim();
  if (explicit) {
    const uri = new URL(explicit);
    uri.pathname = `/${dbName}`;
    await mongoose.connect(uri.toString());
    return { uri: uri.toString(), close: async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } };
  }
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri(dbName);
  await mongoose.connect(uri);
  return { uri, close: async () => { await mongoose.disconnect(); await replSet.stop(); } };
};

const startApi = async ({ uri, port }) => {
  const api = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, MONGODB_URI: uri, PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: crypto.randomBytes(16).toString('hex'), NODE_ENV: 'test' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  api.stderr.on('data', chunk => { stderr += chunk; });
  for (let tries = 0; tries < 120; tries += 1) {
    if (api.exitCode !== null) throw new Error(`API exited: ${stderr.slice(-800)}`);
    const up = await fetch(`http://127.0.0.1:${port}/mcp/health`).then(res => res.ok).catch(() => false);
    if (up) return api;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  api.kill();
  throw new Error(`API did not start: ${stderr.slice(-800)}`);
};

const main = async () => {
  const { uri, close } = await openDatabase();
  let api;
  let mcp;
  try {
    const { Article, NotebookEntry, TagMeta, WikiPage, User, AgentToken } = require('../server/models');
    await Promise.all([Article.init(), NotebookEntry.init(), TagMeta.init()]);
    const userId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: userId, username: `mcp-eval-${userId}`, accountDisabledAt: null });
    const ids = await seedLibrary({ userId, Article, NotebookEntry, TagMeta, WikiPage });
    const keyOf = Object.fromEntries(Object.entries(ids).map(([key, id]) => [id, key]));

    const { createAgentTokenSecret, hashAgentTokenSecret } = require('../server/services/agentTokenService');
    const secret = createAgentTokenSecret();
    await AgentToken.create({ userId, label: 'MCP eval', runtime: 'eval', hashedSecret: hashAgentTokenSecret(secret), scopes: ['read', 'agent-write'] });

    const port = 20000 + crypto.randomInt(20000);
    api = await startApi({ uri, port });

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    mcp = new Client({ name: 'noeis-mcp-eval', version: '1' });
    await mcp.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(ROOT, 'packages/wiki-mcp/bin/noeis-wiki-mcp'), ...(option('toolsets') ? [`--toolsets=${option('toolsets')}`] : [])],
      env: { ...process.env, NOEIS_TOKEN: secret, NOEIS_API_URL: `http://127.0.0.1:${port}`, NOEIS_CONFIG_DIR: path.join(ROOT, 'tmp', 'mcp-eval-config') }
    }));

    const { tools } = await mcp.listTools();
    const listChars = JSON.stringify(tools).length;
    console.log(`tools listed      ${tools.length}`);
    console.log(`tools/list size   ${listChars} chars (~${Math.round(listChars / 4)} tokens on every turn)\n`);

    let passed = 0;
    for (const evalCase of AGENT_CASES) {
      const result = await mcp.callTool({ name: 'recall', arguments: { query: evalCase.ask, limit: TOP_K } });
      const body = result.isError ? { results: [] } : JSON.parse(result.content[0].text);
      const found = body.results.map(hit => keyOf[hit.id]).filter(Boolean);
      const pass = evalCase.abstain
        ? body.results.length === 0
        : evalCase.sources.every(key => found.includes(key)) && (!evalCase.oneOf || evalCase.oneOf.some(key => found.includes(key)));
      if (pass) passed += 1;
      const missing = evalCase.abstain ? [] : evalCase.sources.filter(key => !found.includes(key));
      const why = pass ? '' : evalCase.abstain ? `returned ${body.results.length} hits` : `missing ${missing.join(', ') || evalCase.oneOf.join('|')}`;
      console.log(`${evalCase.id.padEnd(24)} ${pass ? 'pass' : `fail  ${why}`}`);
      if (flag('verbose')) body.results.forEach(hit => console.log(`    ${hit.kind.padEnd(10)} ${keyOf[hit.id] || hit.id}  ${String(hit.passage || '').slice(0, 90)}`));
    }
    console.log(`\n${passed}/${AGENT_CASES.length} questions answered from the right sources (top ${TOP_K})`);

    const written = await mcp.callTool({ name: 'create_notebook_entry', arguments: { title: 'Panels and charisma', content: 'Interview panels overweight charisma and underweight the work sample.' } });
    const noteId = written.isError ? '' : JSON.parse(written.content[0].text).id;
    const back = await mcp.callTool({ name: 'recall', arguments: { query: 'do interview panels overweight charisma', limit: TOP_K } });
    const hit = back.isError ? null : JSON.parse(back.content[0].text).results.find(result => result.id === noteId);
    const inPencil = Boolean(noteId) && hit?.pencil === 'MCP eval';
    console.log(`pencil            ${inPencil ? 'pass' : `fail  ${hit ? `came back as ${hit.pencil || 'the reader\'s own'}` : 'note not recalled'}`}`);
    if (flag('check') && (passed < AGENT_CASES.length || !inPencil)) process.exitCode = 1;
  } finally {
    if (mcp) await mcp.close().catch(() => {});
    if (api) api.kill();
    await close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
