import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

import { NoeisCliClient, NoeisCliError } from './client.js';
import { DEFAULT_API_URL, DEFAULT_APP_URL, readConfig, resolveAuth, writeConfig } from './config.js';
import { syncFolder } from './sync.js';
import { LAUNCH, workHandoffs } from './work.js';

const xdgConfig = ({ env, home }) => env.XDG_CONFIG_HOME || path.join(home, '.config');

/* Where a desktop app keeps its settings on each platform. */
const appSupport = (at, name) => {
  if (at.platform === 'darwin') return path.join(at.home, 'Library', 'Application Support', name);
  if (at.platform === 'win32') return path.join(at.env.APPDATA || path.join(at.home, 'AppData', 'Roaming'), name);
  return path.join(xdgConfig(at), name);
};

/* Every runtime `noeis connect` knows: its name, and where it reads MCP
   servers (a JSON file under `key`, a TOML table, or its own CLI). `app`
   marks one started from the Dock or Start menu, which never sees the
   shell's PATH and so is given absolute paths. */
const RUNTIMES = {
  'claude-code': { label: 'Claude Code' },
  'claude-desktop': { label: 'Claude Desktop', app: true, key: 'mcpServers', file: at => path.join(appSupport(at, 'Claude'), 'claude_desktop_config.json') },
  codex: { label: 'Codex', toml: at => path.join(at.home, '.codex', 'config.toml') },
  cursor: { label: 'Cursor', app: true, key: 'mcpServers', file: at => path.join(at.home, '.cursor', 'mcp.json') },
  grok: { label: 'Grok Build', toml: at => path.join(at.home, '.grok', 'config.toml') },
  hermes: { label: 'Hermes', key: 'servers', entry: { transport: 'stdio' }, file: at => path.join(xdgConfig(at), 'hermes', 'mcp.json') },
  muse: { label: 'Muse Code', key: 'mcpServers', entry: { type: 'stdio' }, file: at => path.join(xdgConfig(at), 'muse', 'settings.json') },
  openclaw: { label: 'OpenClaw', key: 'servers', entry: { transport: 'stdio' }, file: at => path.join(xdgConfig(at), 'openclaw', 'mcp.json') },
  opencode: { label: 'OpenCode', key: 'mcp', file: at => path.join(xdgConfig(at), 'opencode', 'opencode.json') },
  vscode: { label: 'VS Code', app: true, key: 'servers', entry: { type: 'stdio' }, file: at => path.join(appSupport(at, 'Code'), 'User', 'mcp.json') }
};
const ANY_AGENT = { label: 'Noeis agent', key: 'servers', entry: { transport: 'stdio' }, file: at => path.join(xdgConfig(at), 'noeis', 'mcp.json') };
const RUNTIME_NAMES = Object.keys(RUNTIMES).join('|');

const normalizeRuntime = (value = '') => {
  const runtime = String(value || '').trim().toLowerCase();
  if (runtime === 'claude') return 'claude-code';
  return RUNTIMES[runtime] ? runtime : 'agent';
};

const runtimeLabel = (runtime = 'agent') => (RUNTIMES[runtime] || ANY_AGENT).label;

const CLI_BIN = fileURLToPath(new URL('../bin/noeis', import.meta.url));

const HELP = `Noeis CLI

Usage:
  noeis connect [${RUNTIME_NAMES}] [--scope read|read-write] [--work] [--label name] [--no-browser]
  noeis mcp [--help]
  noeis brief ["topic"] [--json]
  noeis search "what you want to find" [--limit n] [--json]
  noeis read <id> [--json]
  noeis save <url|file|-> [--later] [--title title] [--json]
  noeis save --hook    (an agent hook: saves the URL it just fetched)
  noeis note "text"|- [--title title] [--json]
  noeis sync [folder] [--watch]   (your Noeis as Markdown, both ways; ~/Noeis by default)
  noeis hand "what to do" [--to noeis|any]   (hand work to Noeis's own agent, or to any agent)
  noeis handoffs [--status waiting|taken|done|cancelled] [--json]
  noeis work [${Object.keys(LAUNCH).join('|')}] [--watch]   (work what you hand off, with that agent, on this machine)
  noeis login [--token ntk_at_...] [--api-url https://note-taker-3-unrg.onrender.com]
  noeis pages list [--query text] [--status draft|published|archived] [--page-type type] [--limit n] [--json]
  noeis pages get <id> [--json]
  noeis ingest <url|file> [--title title] [--json]
  noeis draft <pageId> [--json]
  noeis ask <pageId> "question" [--json]
  noeis schema show
  noeis schema edit
  noeis log [--since 1d] [--limit n] [--json]

Environment:
  NOEIS_TOKEN, NOEIS_API_URL, NOEIS_APP_URL, NOEIS_CONFIG_DIR
`;

const CONNECT_HELP = `Noeis agent connect

Usage:
  noeis connect [${RUNTIME_NAMES}] [--scope read|read-write] [--work] [options]

Options:
  --label <name>       Label shown on the Noeis browser approval screen
  --scope <read|read-write>
                       Requested grant. Defaults to read
  --work               Also let the agent into Work (your private work notebook),
                       with the same read or read-write access. Off unless asked
  --api-url <url>      API URL, defaults to ${DEFAULT_API_URL}
  --app-url <url>      Browser approval app URL, defaults to ${DEFAULT_APP_URL}
  --no-browser         Print the approval URL without opening a browser
  --no-config          Save Noeis CLI config but do not write runtime MCP config
  --timeout <seconds>  Wait time for browser approval, defaults to 300

Examples:
  noeis connect openclaw --scope read
  noeis connect hermes --scope read-write
  noeis connect claude-code --scope read-write --work
  noeis connect codex --no-browser
`;

const optionValue = (args, name, fallback = '') => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || '';
};

const hasFlag = (args, name) => args.includes(name);
// Flags that take no value, so the word after one is still a positional.
const SWITCHES = new Set(['--json', '--work', '--no-browser', '--no-config', '--print-token', '--later', '--hook', '--watch']);

// A lone `-` is standard input, a positional like any other.
const isFlag = arg => arg?.startsWith('-') && arg !== '-';

const compactArgs = (args) => args.filter((arg, index) => {
  if (isFlag(arg)) return false;
  const previous = args[index - 1];
  if (isFlag(previous) && !SWITCHES.has(previous)) return false;
  return true;
});

const sinceToIso = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^\d+[hdwm]$/.test(trimmed)) {
    const amount = Number(trimmed.slice(0, -1));
    const unit = trimmed.slice(-1);
    const multipliers = {
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
      m: 30 * 24 * 60 * 60 * 1000
    };
    return new Date(Date.now() - amount * multipliers[unit]).toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
};

const openBrowser = (url, { platform = process.platform } = {}) => {
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref?.();
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const WATCH_EVERY_MS = 60 * 1000;


const resolveConnectScopes = (value = 'read', work = false) => {
  const scope = String(value || 'read').trim().toLowerCase();
  const access = { read: ['read'], 'read-write': ['read', 'agent-write'], 'agent-write': ['read', 'agent-write'] }[scope];
  if (!access) throw new NoeisCliError('Unsupported --scope. Use read or read-write.');
  return work ? [...access, 'work'] : access;
};

const safeReadJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};

const ensurePrivateDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
};

const writePrivateFileAtomic = (filePath, content) => {
  const directory = path.dirname(filePath);
  ensurePrivateDir(directory);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, content, { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
};

const writeJsonFile = (filePath, value) => {
  writePrivateFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const mcpServerConfig = ({ configDir, apiUrl, app = false }) => ({
  command: app ? process.execPath : 'noeis',
  args: app ? [CLI_BIN, 'mcp'] : ['mcp'],
  env: {
    ...(configDir ? { NOEIS_CONFIG_DIR: configDir } : {}),
    ...(apiUrl && apiUrl !== DEFAULT_API_URL ? { NOEIS_API_URL: apiUrl } : {})
  }
});

const writeTomlMcpConfig = (filePath, { configDir, apiUrl }) => {
  ensurePrivateDir(path.dirname(filePath));
  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const envParts = [];
  if (configDir) envParts.push(`NOEIS_CONFIG_DIR = ${JSON.stringify(configDir)}`);
  if (apiUrl && apiUrl !== DEFAULT_API_URL) envParts.push(`NOEIS_API_URL = ${JSON.stringify(apiUrl)}`);
  const envLine = envParts.length ? `\nenv = { ${envParts.join(', ')} }` : '';
  const block = `[mcp_servers.noeis-wiki]
command = "noeis"
args = ["mcp"]${envLine}
`;
  const next = /\[mcp_servers\.noeis-wiki\][\s\S]*?(?=\n\[|\s*$)/m.test(current)
    ? current.replace(/\[mcp_servers\.noeis-wiki\][\s\S]*?(?=\n\[|\s*$)/m, block.trimEnd())
    : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`;
  writePrivateFileAtomic(filePath, `${next.trimEnd()}\n`);
};

const writeOpenClawRootConfig = ({ filePath, server }) => {
  const config = safeReadJson(filePath);
  config.mcp = {
    ...(config.mcp || {}),
    servers: {
      ...(config.mcp?.servers || {}),
      'noeis-wiki': server
    }
  };
  writeJsonFile(filePath, config);
  return filePath;
};

/* Claude Code keeps its servers in its own state file, so it is told
   through its CLI rather than by editing that file. Without the CLI the
   command is printed for the person to run. */
const addClaudeCodeServer = ({ server, env, io }) => {
  const run = command => spawnSync('claude', ['mcp', ...command], { env, encoding: 'utf8' });
  const json = JSON.stringify({ type: 'stdio', ...server });
  run(['remove', '--scope', 'user', 'noeis-wiki']);
  if (run(['add-json', '--scope', 'user', 'noeis-wiki', json]).status === 0) return 'Claude Code user settings (claude mcp add-json)';
  io.stdout.write(`Could not reach the claude CLI. Run this once:\n  claude mcp add-json --scope user noeis-wiki '${json}'\n`);
  return [];
};

/* What Claude Code fetches from the web lands in the reader's Library, in
   pencil on the "Read by agents" shelf, by a hook after each fetch. The hook
   hands the save off and returns at once, so a slow save never holds the
   agent up. */
const READING_HOOK = 'noeis save --hook';
const addClaudeCodeReadingHook = ({ env }) => {
  const filePath = path.join(env.CLAUDE_CONFIG_DIR || path.join(env.HOME || os.homedir(), '.claude'), 'settings.json');
  const settings = safeReadJson(filePath);
  const others = (settings.hooks?.PostToolUse || []).filter(entry => !entry.hooks?.some(hook => hook.command === READING_HOOK));
  settings.hooks = { ...settings.hooks, PostToolUse: [...others, { matcher: 'WebFetch', hooks: [{ type: 'command', command: READING_HOOK }] }] };
  writeJsonFile(filePath, settings);
  return filePath;
};

const writeRuntimeMcpConfig = ({ runtime, apiUrl, configDir, env = process.env, platform = process.platform, io } = {}) => {
  const at = { env, home: env.HOME || os.homedir(), platform };
  const target = RUNTIMES[runtime] || ANY_AGENT;
  const server = mcpServerConfig({ configDir, apiUrl, app: target.app });
  if (runtime === 'claude-code') return addClaudeCodeServer({ server, env, io });
  if (target.toml) {
    writeTomlMcpConfig(target.toml(at), { configDir, apiUrl });
    return target.toml(at);
  }
  const filePath = target.file(at);
  const config = safeReadJson(filePath);
  config[target.key] = { ...(config[target.key] || {}), 'noeis-wiki': { ...target.entry, ...server } };
  delete config['noeis-wiki'];
  writeJsonFile(filePath, config);
  if (runtime !== 'openclaw') return filePath;
  return [filePath, writeOpenClawRootConfig({ filePath: path.join(at.home, '.openclaw', 'openclaw.json'), server })];
};

const requestJson = async (url, { method = 'GET', body, fetchImpl = global.fetch } = {}) => {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const contentType = response.headers?.get?.('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error
      ? payload.error
      : `Noeis connection request failed with ${response.status}`;
    throw new NoeisCliError(message, { status: response.status });
  }
  return payload;
};

const readTokenFromPrompt = async ({ inputStream = input, outputStream = output } = {}) => {
  const rl = readline.createInterface({ input: inputStream, output: outputStream });
  try {
    return (await rl.question('Paste your Connected agents token: ')).trim();
  } finally {
    rl.close();
  }
};

const printJson = (value, io) => {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const printRows = (rows = [], io) => {
  if (!rows.length) {
    io.stdout.write('No rows.\n');
    return;
  }
  rows.forEach((row) => {
    io.stdout.write(`${row.id || row._id || ''}\t${row.title || row.action || row.type || 'Untitled'}\t${row.pageType || row.status || ''}\n`);
  });
};

const printResult = (value, { json = false, io }) => {
  if (json || typeof value !== 'object' || value === null) {
    printJson(value, io);
    return;
  }
  if (Array.isArray(value)) {
    printRows(value, io);
    return;
  }
  if (Array.isArray(value.pages)) printRows(value.pages, io);
  else if (Array.isArray(value.events)) printRows(value.events, io);
  else printJson(value, io);
};

const isUrl = value => /^https?:\/\//i.test(value);

/* A file's text, or standard input for `-`, titled by the file. */
const readText = (value, context) => (value === '-'
  ? { text: (context.readStdin || (() => fs.readFileSync(0, 'utf8')))(), title: '' }
  : { text: fs.readFileSync(path.resolve(value), 'utf8'), title: path.basename(value) });

const sourceFromInput = (value, title = '', context = {}) => {
  if (isUrl(value)) return { type: 'url', url: value, title: title || undefined };
  const read = readText(value, context);
  return { type: 'text', text: read.text, title: title || read.title };
};

const firstLine = text => String(text).trim().split('\n')[0].slice(0, 80);

const printHit = io => hit => io.stdout.write(`${hit.kind}\t${hit.id}\t${hit.title || 'Untitled'}${hit.pencil ? `\t(in pencil: ${hit.pencil})` : ''}${hit.passage ? `\n    ${String(hit.passage).replace(/\s+/g, ' ').slice(0, 200)}` : ''}\n`);

const printRecall = ({ results = [] }, io) => {
  if (!results.length) io.stdout.write('Nothing of yours bears on that.\n');
  results.forEach(printHit(io));
};

const printBrief = ({ topic, ...groups }, io) => {
  const kinds = Object.entries(groups).filter(([, hits]) => hits.length);
  if (!kinds.length) io.stdout.write(topic ? 'Nothing of yours bears on that.\n' : 'Nothing kept yet.\n');
  kinds.forEach(([kind, hits]) => {
    io.stdout.write(`\n${kind}\n`);
    hits.forEach(printHit(io));
  });
};

const runLogin = async (args, context) => {
  const auth = resolveAuth(context);
  const appUrl = optionValue(args, '--app-url', auth.appUrl || DEFAULT_APP_URL);
  const apiUrl = optionValue(args, '--api-url', auth.apiUrl || DEFAULT_API_URL);
  const tokenArg = optionValue(args, '--token');
  if (!tokenArg && !hasFlag(args, '--no-browser')) {
    openBrowser(`${appUrl}/settings`, context);
  }
  const token = tokenArg || await readTokenFromPrompt(context);
  if (!token) throw new NoeisCliError('Token is required.');
  const configPath = writeConfig({ ...readConfig(context), token, apiUrl, appUrl }, context);
  context.io.stdout.write(`Saved Noeis CLI config to ${configPath}\n`);
};

const runConnect = async (args, context) => {
  if (args.includes('--help') || args.includes('-h')) {
    context.io.stdout.write(CONNECT_HELP);
    return;
  }
  const auth = resolveAuth(context);
  const positional = compactArgs(args);
  const runtime = normalizeRuntime(positional[0] || optionValue(args, '--runtime'));
  const appUrl = optionValue(args, '--app-url', auth.appUrl || DEFAULT_APP_URL);
  const apiUrl = optionValue(args, '--api-url', auth.apiUrl || DEFAULT_API_URL);
  const label = optionValue(args, '--label', `${runtimeLabel(runtime)} local`);
  const requestedScopes = resolveConnectScopes(optionValue(args, '--scope', 'read'), hasFlag(args, '--work'));
  const timeoutSec = Math.max(15, Math.min(Number(optionValue(args, '--timeout', '300')) || 300, 1800));
  const fetchImpl = context.fetchImpl || global.fetch;
  const io = context.io || { stdout: process.stdout, stderr: process.stderr };
  const browserOpener = context.openBrowser || openBrowser;
  const pause = context.sleep || sleep;

  const created = await requestJson(`${apiUrl.replace(/\/+$/g, '')}/api/agent-connect/sessions`, {
    method: 'POST',
    fetchImpl,
    body: {
      runtime,
      label,
      appUrl,
      apiUrl,
      scopes: requestedScopes
    }
  });
  const session = created.session || {};
  const authorizeUrl = created.authorizeUrl;
  if (!authorizeUrl || !created.pollSecret || !session.sessionId) {
    throw new NoeisCliError('Noeis did not return a usable connection session.');
  }

  io.stdout.write(`Approve ${runtimeLabel(runtime)} in your browser.\n`);
  io.stdout.write(`Device code: ${session.deviceCode || 'unknown'}\n`);
  io.stdout.write(`${authorizeUrl}\n`);
  if (!hasFlag(args, '--no-browser')) browserOpener(authorizeUrl, context);

  const deadline = Date.now() + timeoutSec * 1000;
  let approved = null;
  while (Date.now() < deadline) {
    const polled = await requestJson(`${apiUrl.replace(/\/+$/g, '')}/api/agent-connect/sessions/${encodeURIComponent(session.sessionId)}/poll`, {
      method: 'POST',
      fetchImpl,
      body: { pollSecret: created.pollSecret }
    });
    if (polled.session?.status === 'approved') {
      approved = polled;
      break;
    }
    if (['expired', 'cancelled'].includes(polled.session?.status)) {
      throw new NoeisCliError(`Connection session ${polled.session.status}. Run \`noeis connect ${runtime}\` again.`);
    }
    await pause(Math.max(1, Number(polled.pollIntervalSec || created.pollIntervalSec || 2)) * 1000);
  }
  if (!approved?.secret) throw new NoeisCliError('Timed out waiting for browser approval.');

  const client = new NoeisCliClient({
    token: approved.secret,
    apiUrl,
    fetchImpl,
    env: {
      ...(context.env || process.env),
      NOEIS_TOKEN: approved.secret,
      NOEIS_API_URL: apiUrl
    }
  });
  const connectionInfo = await client.getConnectionInfo();
  const issuedScopes = Array.isArray(connectionInfo?.grant?.scopes)
    ? [...new Set(connectionInfo.grant.scopes)].sort()
    : [];
  const expectedScopes = [...requestedScopes].sort();
  if (JSON.stringify(issuedScopes) !== JSON.stringify(expectedScopes)) {
    throw new NoeisCliError(
      `Issued grant scope mismatch. Requested ${expectedScopes.join(', ')}, received ${issuedScopes.join(', ') || 'unknown'}.`
    );
  }

  const configPath = writeConfig({ ...readConfig(context), token: approved.secret, apiUrl, appUrl }, context);
  let runtimeConfigPath = '';
  if (!hasFlag(args, '--no-config')) {
    runtimeConfigPath = writeRuntimeMcpConfig({
      runtime,
      apiUrl,
      configDir: path.dirname(configPath),
      env: context.env || process.env,
      platform: context.platform,
      io
    });
  }

  const readingHook = runtime === 'claude-code' && requestedScopes.includes('agent-write') && !hasFlag(args, '--no-config')
    ? addClaudeCodeReadingHook({ env: context.env || process.env })
    : '';

  const scopeLabel = requestedScopes.includes('agent-write') ? 'read/write' : 'read-only';
  io.stdout.write(`Connected ${runtimeLabel(runtime)} with ${scopeLabel} Noeis access${requestedScopes.includes('work') ? ', Work included' : ''}.\n`);
  io.stdout.write(`Verified workspace ${connectionInfo?.workspace?.label || connectionInfo?.workspace?.id || 'identity unavailable'}.\n`);
  io.stdout.write(`Saved Noeis CLI config to ${configPath}\n`);
  const runtimeConfigPaths = Array.isArray(runtimeConfigPath) ? runtimeConfigPath : (runtimeConfigPath ? [runtimeConfigPath] : []);
  runtimeConfigPaths.forEach((filePath) => {
    io.stdout.write(`Updated ${runtimeLabel(runtime)} MCP config at ${filePath}\n`);
  });
  if (runtimeConfigPaths.length) io.stdout.write(`Runtime config reads the token from ${configPath}; no raw token was copied into MCP config.\n`);
  if (runtimeConfigPaths.length) io.stdout.write(`Reload ${runtimeLabel(runtime)}, then call connection_info there to confirm the runtime loaded its tools.\n`);
  if (readingHook) io.stdout.write(`What Claude Code reads on the web now lands on your "Read by agents" shelf (hook in ${readingHook}).\n`);
  if (hasFlag(args, '--print-token')) io.stdout.write(`${approved.secret}\n`);
};

const runMcp = async (args, context) => {
  if (args.includes('--help') || args.includes('-h')) {
    context.io.stdout.write(`Noeis MCP bridge\n\nUsage: noeis mcp [--toolsets=wiki,library,...]\n\nReads token/API settings from NOEIS_CONFIG_DIR or ~/.config/noeis/config.json.\nLists the core tools; add library, think, wiki, editions, work or all to list more.\n`);
    return;
  }
  const auth = resolveAuth(context);
  if (!auth.token) throw new NoeisCliError('Noeis token is missing. Run `noeis connect <runtime>` first.');
  process.env.NOEIS_TOKEN = auth.token;
  process.env.NOEIS_API_URL = auth.apiUrl;
  try {
    let mod;
    try {
      mod = await import('@noeis/wiki-mcp');
    } catch {
      const localMcpPath = new URL('../../wiki-mcp/src/server.js', import.meta.url);
      mod = await import(localMcpPath.href);
    }
    await mod.main(args);
  } catch (error) {
    throw new NoeisCliError(`Unable to start Noeis MCP bridge. Install the CLI with its MCP dependency or publish/install @noeis/wiki-mcp. ${error.message || error}`);
  }
};

const editSchema = async (client, context) => {
  const current = await client.getSchema();
  const content = String(current.content || '');
  const filePath = path.join(os.tmpdir(), `noeis-schema-${Date.now()}.md`);
  fs.writeFileSync(filePath, content);
  const editor = context.env.EDITOR || context.env.VISUAL || 'vi';
  const result = spawnSync(editor, [filePath], { stdio: 'inherit' });
  if (result.status !== 0) throw new NoeisCliError(`Editor exited with ${result.status}.`);
  const next = fs.readFileSync(filePath, 'utf8');
  if (next === content) {
    context.io.stdout.write('Schema unchanged.\n');
    return;
  }
  await client.updateSchema(next);
  context.io.stdout.write('Schema updated.\n');
};

export const runCli = async (argv = [], context = {}) => {
  const io = context.io || { stdout: process.stdout, stderr: process.stderr };
  const env = context.env || process.env;
  const args = [...argv];
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    io.stdout.write(HELP);
    return;
  }

  const command = args[0];
  if (command === 'connect') {
    await runConnect(args.slice(1), { ...context, env, io });
    return;
  }
  if (command === 'mcp') {
    await runMcp(args.slice(1), { ...context, env, io });
    return;
  }
  if (command === 'login') {
    await runLogin(args.slice(1), { ...context, env, io });
    return;
  }

  const client = context.client || new NoeisCliClient({
    env,
    fetchImpl: context.fetchImpl || global.fetch
  });
  const json = hasFlag(args, '--json');
  const positional = compactArgs(args);
  let result;

  if (command === 'pages' && positional[1] === 'list') {
    result = await client.listPages({
      q: optionValue(args, '--query') || optionValue(args, '-q'),
      status: optionValue(args, '--status'),
      pageType: optionValue(args, '--page-type'),
      visibility: optionValue(args, '--visibility'),
      limit: optionValue(args, '--limit', '100')
    });
  } else if (command === 'pages' && positional[1] === 'get') {
    if (!positional[2]) throw new NoeisCliError('Usage: noeis pages get <id>');
    result = await client.getPage(positional[2]);
  } else if (command === 'ingest') {
    if (!positional[1]) throw new NoeisCliError('Usage: noeis ingest <url|file>');
    result = await client.ingestSource(sourceFromInput(positional[1], optionValue(args, '--title'), context));
  } else if (command === 'brief') {
    const brief = await client.brief(positional.slice(1).join(' '));
    if (json) printJson(brief, io);
    else printBrief(brief, io);
    return;
  } else if (command === 'search') {
    if (!positional[1]) throw new NoeisCliError('Usage: noeis search "what you want to find"');
    const found = await client.recall({ query: positional.slice(1).join(' '), limit: optionValue(args, '--limit') });
    if (json) printJson(found, io);
    else printRecall(found, io);
    return;
  } else if (command === 'read') {
    if (!positional[1]) throw new NoeisCliError('Usage: noeis read <id>');
    const source = await client.read(positional[1]);
    if (json) printJson(source, io);
    else io.stdout.write(`${source.title}\n\n${source.text}\n`);
    return;
  } else if (command === 'save' && hasFlag(args, '--hook')) {
    /* Called by an agent's hook with what it just fetched on standard input.
       It never fails the agent: anything unreadable is let go. */
    let url = '';
    try {
      url = JSON.parse((context.readStdin || (() => fs.readFileSync(0, 'utf8')))()).tool_input?.url || '';
    } catch {
      return;
    }
    if (isUrl(url)) (context.spawn || spawn)(process.execPath, [CLI_BIN, 'save', url], { detached: true, stdio: 'ignore', env }).unref();
    return;
  } else if (command === 'save') {
    if (!positional[1]) throw new NoeisCliError('Usage: noeis save <url|file|->');
    const title = optionValue(args, '--title') || undefined;
    const saved = isUrl(positional[1])
      ? await client.saveLink({ url: positional[1], placement: hasFlag(args, '--later') ? 'later' : undefined, title })
      : await client.saveText({ ...readText(positional[1], context), ...(title ? { title } : {}) });
    if (json) printJson(saved, io);
    else io.stdout.write(`${saved.existing ? 'Already in' : 'Saved to'} your ${saved.article?.placement === 'later' ? 'nightstand' : 'Library'}: ${saved.article?.title || 'Untitled'} (${saved.article?._id})\n`);
    return;
  } else if (command === 'note') {
    const content = positional[1] === '-' ? readText('-', context).text : positional.slice(1).join(' ');
    if (!content.trim()) throw new NoeisCliError('Usage: noeis note "text" (or - to read standard input)');
    const note = await client.createNote({ title: optionValue(args, '--title') || firstLine(content), content });
    if (json) printJson(note, io);
    else io.stdout.write(`Noted in Think: ${note.title || 'Untitled'} (${note._id})\n`);
    return;
  } else if (command === 'sync') {
    const dir = path.resolve(positional[1] || path.join(env.HOME || os.homedir(), 'Noeis'));
    const log = line => io.stdout.write(`${line}\n`);
    do {
      const done = await syncFolder({ dir, client, log });
      log(`Synced ${dir}: ${done.sent} sent, ${done.created} new, ${done.written} written, ${done.removed} removed${done.kept ? `, ${done.kept} kept both ways` : ''}.`);
      if (hasFlag(args, '--watch')) await (context.sleep || sleep)(WATCH_EVERY_MS);
    } while (hasFlag(args, '--watch'));
    return;
  } else if (command === 'hand') {
    const ask = positional.slice(1).join(' ');
    if (!ask.trim()) throw new NoeisCliError('Usage: noeis hand "what to do"');
    const to = optionValue(args, '--to', 'noeis');
    const handoff = await client.request('/api/handoffs', { method: 'POST', body: { ask, to: to === 'any' ? '' : to } });
    if (json) printJson(handoff, io);
    else io.stdout.write(`Handed to ${to === 'any' ? 'the next agent' : 'Noeis'}: ${handoff.ask} (${handoff.id})\n`);
    return;
  } else if (command === 'handoffs') {
    const { handoffs } = await client.request('/api/handoffs', { query: { status: optionValue(args, '--status') } });
    if (json) printJson(handoffs, io);
    else handoffs.forEach(h => io.stdout.write(`${h.status}\t${h.id}\t${h.ask}${h.takenBy ? `\t(${h.takenBy})` : ''}${h.did ? `\n    did: ${h.did}` : ''}${h.open ? `\n    open: ${h.open}` : ''}${h.next ? `\n    next: ${h.next}` : ''}\n`));
    return;
  } else if (command === 'work') {
    const runtime = normalizeRuntime(positional[1] || 'claude-code');
    const log = line => io.stdout.write(`${line}\n`);
    do {
      const worked = await workHandoffs({ client, runtime, run: context.spawnSync, env, log });
      if (!hasFlag(args, '--watch')) log(worked ? `Worked ${worked} handoff${worked === 1 ? '' : 's'}.` : 'Nothing handed off is waiting.');
      else await (context.sleep || sleep)(WATCH_EVERY_MS);
    } while (hasFlag(args, '--watch'));
    return;
  } else if (command === 'draft') {
    if (!positional[1]) throw new NoeisCliError('Usage: noeis draft <pageId>');
    result = await client.draftPage(positional[1]);
  } else if (command === 'ask') {
    if (!positional[1] || !positional[2]) throw new NoeisCliError('Usage: noeis ask <pageId> "question"');
    result = await client.askPage(positional[1], positional.slice(2).join(' '));
  } else if (command === 'schema' && positional[1] === 'show') {
    const schema = await client.getSchema();
    io.stdout.write(`${schema.content || ''}\n`);
    return;
  } else if (command === 'schema' && positional[1] === 'edit') {
    await editSchema(client, { ...context, env, io });
    return;
  } else if (command === 'log') {
    result = await client.listActivity({
      since: sinceToIso(optionValue(args, '--since')),
      limit: optionValue(args, '--limit', '50')
    });
  } else {
    throw new NoeisCliError(`Unknown command. Run \`noeis --help\`.`);
  }

  printResult(result, { json, io });
};
