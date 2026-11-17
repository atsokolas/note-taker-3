import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCli } from '../src/cli.js';
import { DEFAULT_API_URL } from '../src/config.js';

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  headers: new Map([['content-type', 'application/json']]),
  async json() {
    return payload;
  },
  async text() {
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  }
});

const makeIo = () => {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (chunk) => { stdout += String(chunk); } },
      stderr: { write: (chunk) => { stderr += String(chunk); } }
    },
    get stdout() { return stdout; },
    get stderr() { return stderr; }
  };
};

const run = async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-cli-test-'));
  const env = {
    NOEIS_CONFIG_DIR: tempDir,
    NOEIS_TOKEN: 'ntk_at_test',
    NOEIS_API_URL: 'https://noeis.example'
  };
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), init });
    const requestUrl = new URL(String(url));
    if (requestUrl.pathname.endsWith('/api/wiki/pages') && init.method === 'GET') {
      return jsonResponse([{ _id: 'page-1', title: 'Compounding', pageType: 'concept' }]);
    }
    if (requestUrl.pathname.endsWith('/api/wiki/pages/page-1') && init.method === 'GET') {
      return jsonResponse({ _id: 'page-1', title: 'Compounding' });
    }
    if (requestUrl.pathname.endsWith('/api/wiki/ingest')) {
      return jsonResponse({ runId: 'ingest-1' });
    }
    if (requestUrl.pathname.endsWith('/api/wiki/pages/page-1/ai/draft')) {
      return jsonResponse({ _id: 'page-1', title: 'Compounding', bodyMarkdown: 'Drafted.' });
    }
    if (requestUrl.pathname.endsWith('/api/wiki/pages/page-1/ask')) {
      return jsonResponse({ _id: 'page-1', discussions: [{ question: 'Why?' }] });
    }
    if (requestUrl.pathname.endsWith('/api/wiki/schema') && init.method === 'GET') {
      return jsonResponse({ content: '# Wiki Schema' });
    }
    if (requestUrl.pathname === '/api/recall') {
      return jsonResponse({ query: requestUrl.searchParams.get('q'), results: [{ kind: 'note', id: 'n1', title: 'Hiring notes', passage: 'Hire for slope,\n not intercept.' }] });
    }
    if (requestUrl.pathname === '/api/brief') {
      return jsonResponse({ topic: requestUrl.searchParams.get('topic'), question: [{ kind: 'question', id: 'q1', title: 'Do work samples beat interviews?' }], pencil: [] });
    }
    if (requestUrl.pathname === '/api/recall/read/n1') {
      return jsonResponse({ kind: 'note', id: 'n1', title: 'Hiring notes', text: 'Hire for slope, not intercept.' });
    }
    if (requestUrl.pathname === '/api/import/url') {
      const { placement } = JSON.parse(init.body);
      return jsonResponse({ article: { _id: 'a1', title: 'An essay', placement: placement || 'stream' }, existing: false });
    }
    if (requestUrl.pathname === '/api/import/text') {
      return jsonResponse({ article: { _id: 'a2', title: JSON.parse(init.body).title } });
    }
    if (requestUrl.pathname === '/api/notebook') {
      return jsonResponse({ _id: 'n2', ...JSON.parse(init.body) });
    }
    if (requestUrl.pathname.endsWith('/api/wiki/activity')) {
      return jsonResponse({ events: [{ id: 'event-1', title: 'Ingested source', at: '2026-05-16T12:00:00.000Z' }] });
    }
    return jsonResponse({});
  };

  const pagesIo = makeIo();
  await runCli(['pages', 'list', '--query', 'compound'], { env, fetchImpl, io: pagesIo.io });
  assert(pagesIo.stdout.includes('page-1'));
  assert(seen.some(request => request.url.includes('/api/wiki/pages?q=compound')));

  const pageIo = makeIo();
  await runCli(['pages', 'get', 'page-1', '--json'], { env, fetchImpl, io: pageIo.io });
  assert.strictEqual(JSON.parse(pageIo.stdout)._id, 'page-1');

  await runCli(['ingest', 'https://example.com/source', '--json'], { env, fetchImpl, io: makeIo().io });
  const ingest = seen.find(request => request.url.endsWith('/api/wiki/ingest'));
  assert.strictEqual(ingest.init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(ingest.init.body), {
    source: { type: 'url', url: 'https://example.com/source' }
  });

  await runCli(['draft', 'page-1'], { env, fetchImpl, io: makeIo().io });
  assert(seen.some(request => request.url.endsWith('/api/wiki/pages/page-1/ai/draft') && request.init.method === 'POST'));

  await runCli(['ask', 'page-1', 'Why does this matter?'], { env, fetchImpl, io: makeIo().io });
  assert(seen.some(request => request.url.endsWith('/api/wiki/pages/page-1/ask') && JSON.parse(request.init.body).question === 'Why does this matter?'));

  const schemaIo = makeIo();
  await runCli(['schema', 'show'], { env, fetchImpl, io: schemaIo.io });
  assert(schemaIo.stdout.includes('# Wiki Schema'));

  await runCli(['log', '--since', '1d'], { env, fetchImpl, io: makeIo().io });
  assert(seen.some(request => request.url.includes('/api/wiki/activity?limit=50&since=')));

  const bodyOf = pathname => JSON.parse(seen.filter(request => new URL(request.url).pathname === pathname).pop().init.body);

  /* search asks recall in the reader's own words and prints one hit a line. */
  const searchIo = makeIo();
  await runCli(['search', 'what', 'have', 'I', 'written', 'about', 'hiring', '--limit', '5'], { env, fetchImpl, io: searchIo.io });
  const recalled = new URL(seen.find(request => request.url.includes('/api/recall?')).url);
  assert.strictEqual(recalled.searchParams.get('q'), 'what have I written about hiring');
  assert.strictEqual(recalled.searchParams.get('limit'), '5');
  assert.strictEqual(searchIo.stdout, 'note\tn1\tHiring notes\n    Hire for slope, not intercept.\n');

  /* brief prints where the reader stands, kind by kind, leaving out what is empty. */
  const briefIo = makeIo();
  await runCli(['brief', 'hiring'], { env, fetchImpl, io: briefIo.io });
  assert.strictEqual(briefIo.stdout, '\nquestion\nquestion\tq1\tDo work samples beat interviews?\n');

  const readIo = makeIo();
  await runCli(['read', 'n1'], { env, fetchImpl, io: readIo.io });
  assert.strictEqual(readIo.stdout, 'Hiring notes\n\nHire for slope, not intercept.\n');

  /* save takes a link to the Library, or to the nightstand with --later,
     and a file or standard input as text. */
  const saveIo = makeIo();
  await runCli(['save', '--later', 'https://example.com/essay'], { env, fetchImpl, io: saveIo.io });
  assert.deepStrictEqual(bodyOf('/api/import/url'), { url: 'https://example.com/essay', placement: 'later' });
  assert.strictEqual(saveIo.stdout, 'Saved to your nightstand: An essay (a1)\n');
  await runCli(['save', 'https://example.com/essay'], { env, fetchImpl, io: makeIo().io });
  assert.deepStrictEqual(bodyOf('/api/import/url'), { url: 'https://example.com/essay' });
  await runCli(['save', '-', '--title', 'Transcript'], { env, fetchImpl, io: makeIo().io, readStdin: () => 'What the agent read.' });
  assert.deepStrictEqual(bodyOf('/api/import/text'), { text: 'What the agent read.', title: 'Transcript' });

  /* note writes to Think, titled by its first line unless told. */
  const noteIo = makeIo();
  await runCli(['note', 'Hiring is a bet on slope.'], { env, fetchImpl, io: noteIo.io });
  assert.deepStrictEqual(bodyOf('/api/notebook'), { title: 'Hiring is a bet on slope.', content: 'Hiring is a bet on slope.', blocks: [{ type: 'paragraph', text: 'Hiring is a bet on slope.' }] });
  assert.strictEqual(noteIo.stdout, 'Noted in Think: Hiring is a bet on slope. (n2)\n');
  await runCli(['note', '-', '--title', 'Session'], { env, fetchImpl, io: makeIo().io, readStdin: () => 'Use <widget> here\n\nKeep this line.' });
  assert.deepStrictEqual(bodyOf('/api/notebook').blocks, [{ type: 'paragraph', text: 'Use <widget> here' }, { type: 'paragraph', text: 'Keep this line.' }]);

  assert.strictEqual(DEFAULT_API_URL, 'https://note-taker-3-unrg.onrender.com');

  const connectHelpIo = makeIo();
  await runCli(['connect', '--help'], {
    env: { NOEIS_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-help-test-')) },
    fetchImpl: async () => {
      throw new Error('connect help should not call the network');
    },
    io: connectHelpIo.io
  });
  assert(connectHelpIo.stdout.includes('Noeis agent connect'));
  assert(connectHelpIo.stdout.includes('noeis connect openclaw'));
  assert(connectHelpIo.stdout.includes('--scope <read|read-write>'));
  assert(connectHelpIo.stdout.includes('https://note-taker-3-unrg.onrender.com'));

  await assert.rejects(
    runCli(['connect', 'codex', '--scope', 'admin', '--no-browser'], {
      env: { NOEIS_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-invalid-scope-test-')) },
      fetchImpl: async () => {
        throw new Error('invalid scope should fail before the network');
      },
      io: makeIo().io
    }),
    /Unsupported --scope/
  );

  const loginIo = makeIo();
  fs.writeFileSync(path.join(tempDir, 'config.json'), '{}\n');
  fs.chmodSync(path.join(tempDir, 'config.json'), 0o644);
  await runCli(['login', '--token', 'ntk_at_saved', '--api-url', 'https://api.test', '--no-browser'], {
    env: { NOEIS_CONFIG_DIR: tempDir },
    io: loginIo.io
  });
  const saved = JSON.parse(fs.readFileSync(path.join(tempDir, 'config.json'), 'utf8'));
  assert.strictEqual(saved.token, 'ntk_at_saved');
  assert.strictEqual(saved.apiUrl, 'https://api.test');
  assert.strictEqual(fs.statSync(path.join(tempDir, 'config.json')).mode & 0o777, 0o600);

  const connectSeen = [];
  let issued = ['read'];
  const connectFetch = async (url, init = {}) => {
    connectSeen.push({ url: String(url), init });
    const requestUrl = new URL(String(url));
    if (requestUrl.pathname.endsWith('/api/agent-connect/sessions')) {
      issued = JSON.parse(init.body).scopes;
      return jsonResponse({
        session: {
          sessionId: 'nac_123',
          deviceCode: 'ABCD-1234',
          runtime: 'hermes',
          label: 'Hermes local',
          status: 'pending'
        },
        pollSecret: 'poll_secret',
        authorizeUrl: 'https://noeis.example/settings/connected-agents/authorize?session=nac_123',
        pollIntervalSec: 1
      });
    }
    if (requestUrl.pathname.endsWith('/api/agent-connect/sessions/nac_123/poll')) {
      return jsonResponse({
        session: { sessionId: 'nac_123', status: 'approved', runtime: 'hermes' },
        secret: 'ntk_at_connected',
        tokenId: 'token-1'
      });
    }
    if (requestUrl.pathname.endsWith('/api/agent-connection')) {
      return jsonResponse({
        format: 'noeis.agent-connection',
        workspace: { id: 'workspace-1', label: 'NOEIS workspace' },
        grant: { id: 'token-1', label: 'Hermes local', scopes: issued },
        capabilities: { read: true, agentWrite: false },
        contentRead: false,
        contentWritten: false
      });
    }
    return jsonResponse({});
  };
  const connectIo = makeIo();
  const connectConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-connect-test-'));
  const xdgConfigHome = path.join(connectConfigDir, 'xdg');
  await runCli(['connect', 'hermes', '--scope', 'read', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
    env: {
      NOEIS_CONFIG_DIR: connectConfigDir,
      XDG_CONFIG_HOME: xdgConfigHome
    },
    fetchImpl: connectFetch,
    io: connectIo.io,
    openBrowser: () => {
      throw new Error('browser should not open with --no-browser');
    },
    sleep: async () => {}
  });
  const connectedConfig = JSON.parse(fs.readFileSync(path.join(connectConfigDir, 'config.json'), 'utf8'));
  assert.strictEqual(connectedConfig.token, 'ntk_at_connected');
  assert.strictEqual(connectedConfig.apiUrl, 'https://api.test');
  const hermesConfig = JSON.parse(fs.readFileSync(path.join(xdgConfigHome, 'hermes', 'mcp.json'), 'utf8'));
  assert.strictEqual(hermesConfig.servers['noeis-wiki'].command, 'noeis');
  assert.deepStrictEqual(hermesConfig.servers['noeis-wiki'].args, ['mcp']);
  assert.strictEqual(hermesConfig.servers['noeis-wiki'].env.NOEIS_CONFIG_DIR, connectConfigDir);
  assert.strictEqual(hermesConfig.servers['noeis-wiki'].env.NOEIS_TOKEN, undefined);
  assert.strictEqual(hermesConfig.servers['noeis-wiki'].env.NOEIS_API_URL, 'https://api.test');
  assert.strictEqual(hermesConfig['noeis-wiki'], undefined);
  assert(connectIo.stdout.includes('Approve Hermes in your browser.'));
  assert(connectIo.stdout.includes('Connected Hermes with read-only Noeis access.'));
  assert(connectIo.stdout.includes('Verified workspace NOEIS workspace.'));
  assert(connectIo.stdout.includes('no raw token was copied into MCP config.'));
  const connectRequest = connectSeen.find(request => request.url.endsWith('/api/agent-connect/sessions'));
  assert.deepStrictEqual(JSON.parse(connectRequest.init.body).scopes, ['read']);
  assert(connectSeen.some(request => request.url.endsWith('/api/agent-connection')));
  assert(!connectSeen.some(request => request.url.includes('/api/wiki/pages')));

  const mismatchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-scope-mismatch-test-'));
  const mismatchFetch = async (url) => {
    const requestUrl = new URL(String(url));
    if (requestUrl.pathname.endsWith('/api/agent-connect/sessions')) {
      return jsonResponse({
        session: { sessionId: 'nac_mismatch', deviceCode: 'WIDE-1234', status: 'pending' },
        pollSecret: 'poll_mismatch',
        authorizeUrl: 'https://noeis.example/settings/connected-agents/authorize?session=nac_mismatch',
        pollIntervalSec: 1
      });
    }
    if (requestUrl.pathname.endsWith('/poll')) {
      return jsonResponse({
        session: { sessionId: 'nac_mismatch', status: 'approved' },
        secret: 'ntk_at_mismatch',
        tokenId: 'token-mismatch'
      });
    }
    if (requestUrl.pathname.endsWith('/api/agent-connection')) {
      return jsonResponse({
        workspace: { id: 'workspace-1', label: 'NOEIS workspace' },
        grant: { id: 'token-mismatch', scopes: ['read', 'agent-write'] }
      });
    }
    return jsonResponse({});
  };
  await assert.rejects(
    runCli(['connect', 'codex', '--scope', 'read', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
      env: { NOEIS_CONFIG_DIR: mismatchDir },
      fetchImpl: mismatchFetch,
      io: makeIo().io,
      sleep: async () => {}
    }),
    /Issued grant scope mismatch/
  );
  assert.strictEqual(fs.existsSync(path.join(mismatchDir, 'config.json')), false);

  // --work asks for Work by name; a switch before the runtime still leaves the runtime named.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-work-test-'));
  const workSeen = [];
  const workIo = makeIo();
  await runCli(['connect', '--work', 'hermes', '--scope', 'read-write', '--no-browser', '--no-config', '--api-url', 'https://api.test'], {
    env: { NOEIS_CONFIG_DIR: workDir },
    fetchImpl: async (url, init = {}) => {
      workSeen.push({ url: String(url), init });
      const { pathname } = new URL(String(url));
      if (pathname.endsWith('/api/agent-connect/sessions')) return jsonResponse({ session: { sessionId: 'nac_work', status: 'pending' }, pollSecret: 'p', authorizeUrl: 'https://noeis.example/a', pollIntervalSec: 1 });
      if (pathname.endsWith('/poll')) return jsonResponse({ session: { status: 'approved' }, secret: 'ntk_at_work' });
      return jsonResponse({ workspace: { label: 'NOEIS workspace' }, grant: { scopes: ['read', 'agent-write', 'work'] } });
    },
    io: workIo.io,
    sleep: async () => {}
  });
  const workRequest = JSON.parse(workSeen.find(request => request.url.endsWith('/api/agent-connect/sessions')).init.body);
  assert.deepStrictEqual(workRequest.scopes, ['read', 'agent-write', 'work']);
  assert.strictEqual(workRequest.runtime, 'hermes');
  assert(workIo.stdout.includes('Connected Hermes with read/write Noeis access, Work included.'));

  const openClawConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-openclaw-test-'));
  const openClawHome = path.join(openClawConfigDir, 'home');
  const openClawXdg = path.join(openClawConfigDir, 'xdg');
  fs.mkdirSync(path.join(openClawHome, '.openclaw'), { recursive: true });
  fs.writeFileSync(path.join(openClawHome, '.openclaw', 'openclaw.json'), JSON.stringify({
    meta: {
      note: 'Old Noeis installer note that current OpenClaw rejects.'
    },
    mcp: {
      servers: {
        x: { url: 'http://127.0.0.1:8000/mcp' }
      }
    }
  }, null, 2));
  fs.chmodSync(path.join(openClawHome, '.openclaw', 'openclaw.json'), 0o644);
  const openClawIo = makeIo();
  await runCli(['connect', 'openclaw', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
    env: {
      HOME: openClawHome,
      NOEIS_CONFIG_DIR: openClawConfigDir,
      XDG_CONFIG_HOME: openClawXdg
    },
    fetchImpl: connectFetch,
    io: openClawIo.io,
    sleep: async () => {}
  });
  const openClawXdgConfig = JSON.parse(fs.readFileSync(path.join(openClawXdg, 'openclaw', 'mcp.json'), 'utf8'));
  assert.strictEqual(openClawXdgConfig.servers['noeis-wiki'].command, 'noeis');
  assert.strictEqual(openClawXdgConfig.servers['noeis-wiki'].env.NOEIS_TOKEN, undefined);
  const openClawRootConfig = JSON.parse(fs.readFileSync(path.join(openClawHome, '.openclaw', 'openclaw.json'), 'utf8'));
  assert.deepStrictEqual(openClawRootConfig.meta, {
    note: 'Old Noeis installer note that current OpenClaw rejects.'
  });
  assert.strictEqual(openClawRootConfig.mcp.servers.x.url, 'http://127.0.0.1:8000/mcp');
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].transport, undefined);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].command, 'noeis');
  assert.deepStrictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].args, ['mcp']);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].env.NOEIS_CONFIG_DIR, openClawConfigDir);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].env.NOEIS_TOKEN, undefined);
  assert.strictEqual(fs.statSync(path.join(openClawHome, '.openclaw', 'openclaw.json')).mode & 0o777, 0o600);
  assert(openClawIo.stdout.includes(path.join(openClawHome, '.openclaw', 'openclaw.json')));

  const codexConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-codex-test-'));
  const originalHome = process.env.HOME;
  process.env.HOME = codexConfigDir;
  try {
    await runCli(['connect', 'codex', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
      env: {
        NOEIS_CONFIG_DIR: codexConfigDir
      },
      fetchImpl: connectFetch,
      io: makeIo().io,
      sleep: async () => {}
    });
    const codexToml = fs.readFileSync(path.join(codexConfigDir, '.codex', 'config.toml'), 'utf8');
    assert(codexToml.includes('command = "noeis"'));
    assert(codexToml.includes('args = ["mcp"]'));
    assert(codexToml.includes(`NOEIS_CONFIG_DIR = ${JSON.stringify(codexConfigDir)}`));
    assert(!codexToml.includes('ntk_at_connected'));
  } finally {
    process.env.HOME = originalHome;
  }

  /* Muse Code reads mcpServers in its settings; Grok Build reads the same
     TOML table Codex does; neither copies the token. */
  const agentHome = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-agents-test-'));
  const connectAs = runtime => runCli(['connect', runtime, '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
    env: { HOME: agentHome, XDG_CONFIG_HOME: path.join(agentHome, '.config'), NOEIS_CONFIG_DIR: agentHome, PATH: path.join(agentHome, 'bin') },
    fetchImpl: connectFetch,
    io: makeIo().io,
    sleep: async () => {}
  });
  fs.mkdirSync(path.join(agentHome, '.config', 'muse'), { recursive: true });
  fs.writeFileSync(path.join(agentHome, '.config', 'muse', 'settings.json'), JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } }));
  await connectAs('muse');
  const muse = JSON.parse(fs.readFileSync(path.join(agentHome, '.config', 'muse', 'settings.json'), 'utf8'));
  assert.strictEqual(muse.theme, 'dark');
  assert.deepStrictEqual(muse.mcpServers.other, { command: 'x' });
  assert.deepStrictEqual([muse.mcpServers['noeis-wiki'].type, muse.mcpServers['noeis-wiki'].command, muse.mcpServers['noeis-wiki'].args], ['stdio', 'noeis', ['mcp']]);
  assert(!JSON.stringify(muse).includes('ntk_at_connected'));

  await connectAs('grok');
  const grokToml = fs.readFileSync(path.join(agentHome, '.grok', 'config.toml'), 'utf8');
  assert(grokToml.includes('[mcp_servers.noeis-wiki]') && grokToml.includes('args = ["mcp"]'));
  assert(!grokToml.includes('ntk_at_connected'));

  /* Desktop apps never see the shell's PATH, so they get absolute paths,
     each in the file and shape that app reads. */
  const appServer = { command: process.execPath, args: [new URL('../bin/noeis', import.meta.url).pathname, 'mcp'] };
  const connectApp = (runtime, platform) => runCli(['connect', runtime, '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
    env: { HOME: agentHome, XDG_CONFIG_HOME: path.join(agentHome, '.config'), NOEIS_CONFIG_DIR: agentHome, APPDATA: path.join(agentHome, 'Roaming') },
    platform,
    fetchImpl: connectFetch,
    io: makeIo().io,
    sleep: async () => {}
  });
  const readServer = (file, key) => JSON.parse(fs.readFileSync(path.join(agentHome, file), 'utf8'))[key]['noeis-wiki'];
  await connectApp('claude-desktop', 'darwin');
  assert.deepStrictEqual(readServer('Library/Application Support/Claude/claude_desktop_config.json', 'mcpServers'), { ...appServer, env: { NOEIS_CONFIG_DIR: agentHome, NOEIS_API_URL: 'https://api.test' } });
  await connectApp('cursor', 'darwin');
  assert.strictEqual(readServer('.cursor/mcp.json', 'mcpServers').command, process.execPath);
  await connectApp('vscode', 'win32');
  const vscode = readServer('Roaming/Code/User/mcp.json', 'servers');
  assert.deepStrictEqual([vscode.type, vscode.command, vscode.args], ['stdio', process.execPath, appServer.args]);
  assert(!fs.readFileSync(path.join(agentHome, 'Roaming/Code/User/mcp.json'), 'utf8').includes('ntk_at_connected'));

  /* Without the claude CLI, the printed command carries the same server,
     config directory included. */
  const noClaude = makeIo();
  await runCli(['connect', 'claude-code', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
    env: { HOME: agentHome, XDG_CONFIG_HOME: path.join(agentHome, '.config'), NOEIS_CONFIG_DIR: agentHome, PATH: path.join(agentHome, 'nowhere') },
    fetchImpl: connectFetch,
    io: noClaude.io,
    sleep: async () => {}
  });
  assert(noClaude.stdout.includes(`claude mcp add-json --scope user noeis-wiki '{"type":"stdio","command":"noeis","args":["mcp"],"env":{"NOEIS_CONFIG_DIR":${JSON.stringify(agentHome)}`));

  /* Claude Code is registered through its own CLI, at user scope. */
  fs.mkdirSync(path.join(agentHome, 'bin'));
  const claudeLog = path.join(agentHome, 'claude.log');
  fs.writeFileSync(path.join(agentHome, 'bin', 'claude'), `#!/bin/sh\necho "$@" >> ${claudeLog}\n`, { mode: 0o755 });
  await connectAs('claude-code');
  const asked = fs.readFileSync(claudeLog, 'utf8').trim().split('\n');
  assert.strictEqual(asked[0], 'mcp remove --scope user noeis-wiki');
  assert.match(asked[1], /^mcp add-json --scope user noeis-wiki \{"type":"stdio","command":"noeis","args":\["mcp"\]/);
  assert(!asked[1].includes('ntk_at_connected'));
  assert(!fs.existsSync(path.join(agentHome, '.claude', 'settings.json')), 'a read-only connection saves nothing');

  /* Read-write, what Claude Code fetches lands in the Library by a hook,
     beside the person's own settings and hooks, once however often. */
  fs.mkdirSync(path.join(agentHome, '.claude'));
  const settingsFile = path.join(agentHome, '.claude', 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'opus', hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'say done' }] }] } }));
  const connectWriter = () => runCli(['connect', 'claude-code', '--scope', 'read-write', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
    env: { HOME: agentHome, XDG_CONFIG_HOME: path.join(agentHome, '.config'), NOEIS_CONFIG_DIR: agentHome, PATH: path.join(agentHome, 'bin') },
    fetchImpl: connectFetch,
    io: makeIo().io,
    sleep: async () => {}
  });
  await connectWriter();
  await connectWriter();
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.strictEqual(settings.model, 'opus');
  assert.deepStrictEqual(settings.hooks.PostToolUse.map(entry => [entry.matcher, entry.hooks[0].command]), [['Bash', 'say done'], ['WebFetch', 'noeis save --hook']]);

  /* The hook hands the fetched URL to a save of its own and returns; what it
     cannot read it lets go. */
  const spawned = [];
  const spawnSpy = (command, args) => { spawned.push(args.slice(1)); return { unref: () => {} }; };
  await runCli(['save', '--hook'], { env: {}, io: makeIo().io, spawn: spawnSpy, readStdin: () => JSON.stringify({ tool_name: 'WebFetch', tool_input: { url: 'https://example.com/docs', prompt: 'read' } }) });
  await runCli(['save', '--hook'], { env: {}, io: makeIo().io, spawn: spawnSpy, readStdin: () => 'not json' });
  await runCli(['save', '--hook'], { env: {}, io: makeIo().io, spawn: spawnSpy, readStdin: () => JSON.stringify({ tool_input: { url: 'file:///etc/passwd' } }) });
  assert.deepStrictEqual(spawned, [['save', 'https://example.com/docs']]);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
