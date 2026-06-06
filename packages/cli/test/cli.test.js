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
  assert(connectHelpIo.stdout.includes('https://note-taker-3-unrg.onrender.com'));

  const loginIo = makeIo();
  await runCli(['login', '--token', 'ntk_at_saved', '--api-url', 'https://api.test', '--no-browser'], {
    env: { NOEIS_CONFIG_DIR: tempDir },
    io: loginIo.io
  });
  const saved = JSON.parse(fs.readFileSync(path.join(tempDir, 'config.json'), 'utf8'));
  assert.strictEqual(saved.token, 'ntk_at_saved');
  assert.strictEqual(saved.apiUrl, 'https://api.test');

  const connectSeen = [];
  const connectFetch = async (url, init = {}) => {
    connectSeen.push({ url: String(url), init });
    const requestUrl = new URL(String(url));
    if (requestUrl.pathname.endsWith('/api/agent-connect/sessions')) {
      return jsonResponse({
        session: {
          sessionId: 'nac_123',
          deviceCode: 'ABCD-1234',
          runtime: 'hermes',
          label: 'Hermes local',
          status: 'pending'
        },
        pollSecret: 'poll_secret',
        authorizeUrl: 'https://noeis.example/settings/connected-agents/authorize?session=nac_123&secret=poll_secret',
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
    if (requestUrl.pathname.endsWith('/api/wiki/pages')) {
      return jsonResponse({ pages: [] });
    }
    return jsonResponse({});
  };
  const connectIo = makeIo();
  const connectConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noeis-connect-test-'));
  const xdgConfigHome = path.join(connectConfigDir, 'xdg');
  await runCli(['connect', 'hermes', '--no-browser', '--api-url', 'https://api.test', '--app-url', 'https://noeis.example'], {
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
  assert.strictEqual(hermesConfig.servers['noeis-wiki'].env.NOEIS_MCP_TOOLSET, 'library-think-v1');
  assert.strictEqual(hermesConfig['noeis-wiki'], undefined);
  assert(connectIo.stdout.includes('Approve Hermes in your browser.'));
  assert(connectIo.stdout.includes('Connected Hermes with read/write Noeis access.'));
  assert(connectIo.stdout.includes('no raw token was copied into MCP config.'));
  assert(connectSeen.some(request => request.url.endsWith('/api/wiki/pages?limit=1')));

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
  assert.strictEqual(openClawXdgConfig.servers['noeis-wiki'].env.NOEIS_MCP_TOOLSET, 'library-think-v1');
  const openClawRootConfig = JSON.parse(fs.readFileSync(path.join(openClawHome, '.openclaw', 'openclaw.json'), 'utf8'));
  assert.strictEqual(openClawRootConfig.meta, undefined);
  assert.strictEqual(openClawRootConfig.mcp.servers.x.url, 'http://127.0.0.1:8000/mcp');
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].transport, undefined);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].command, 'noeis');
  assert.deepStrictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].args, ['mcp']);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].env.NOEIS_CONFIG_DIR, openClawConfigDir);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].env.NOEIS_TOKEN, undefined);
  assert.strictEqual(openClawRootConfig.mcp.servers['noeis-wiki'].env.NOEIS_MCP_TOOLSET, 'library-think-v1');
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
    assert(codexToml.includes('NOEIS_MCP_TOOLSET = "library-think-v1"'));
    assert(!codexToml.includes('ntk_at_connected'));
  } finally {
    process.env.HOME = originalHome;
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
