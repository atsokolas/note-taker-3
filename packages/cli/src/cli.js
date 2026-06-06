import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';

import { NoeisCliClient, NoeisCliError } from './client.js';
import { DEFAULT_API_URL, DEFAULT_APP_URL, readConfig, resolveAuth, writeConfig } from './config.js';

const HELP = `Noeis CLI

Usage:
  noeis connect [claude-code|codex|hermes|openclaw|opencode] [--label name] [--no-browser]
  noeis login [--token ntk_at_...] [--api-url https://api.noeis.io]
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

const optionValue = (args, name, fallback = '') => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || '';
};

const hasFlag = (args, name) => args.includes(name);

const compactArgs = (args) => args.filter((arg, index) => {
  if (arg.startsWith('-')) return false;
  const previous = args[index - 1];
  if (previous?.startsWith('-') && !['--json'].includes(previous)) return false;
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

const RUNTIME_ALIASES = {
  claude: 'claude-code',
  'claude-code': 'claude-code',
  codex: 'codex',
  hermes: 'hermes',
  openclaw: 'openclaw',
  opencode: 'opencode'
};

const RUNTIME_LABELS = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  opencode: 'OpenCode'
};

const normalizeRuntime = (value = '') => {
  const runtime = String(value || '').trim().toLowerCase();
  return RUNTIME_ALIASES[runtime] || 'agent';
};

const runtimeLabel = (runtime = 'agent') => RUNTIME_LABELS[runtime] || 'Noeis agent';

const safeReadJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};

const writeJsonFile = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};

const mcpServerConfig = ({ token, apiUrl }) => ({
  command: 'npx',
  args: ['-y', '@noeis/wiki-mcp'],
  env: {
    NOEIS_TOKEN: token,
    ...(apiUrl && apiUrl !== DEFAULT_API_URL ? { NOEIS_API_URL: apiUrl } : {})
  }
});

const writeTomlMcpConfig = (filePath, { token, apiUrl }) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  let current = '';
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const envParts = [`NOEIS_TOKEN = ${JSON.stringify(token)}`];
  if (apiUrl && apiUrl !== DEFAULT_API_URL) envParts.push(`NOEIS_API_URL = ${JSON.stringify(apiUrl)}`);
  const block = `[mcp_servers.noeis-wiki]
command = "npx"
args = ["-y", "@noeis/wiki-mcp"]
env = { ${envParts.join(', ')} }
`;
  const next = /\[mcp_servers\.noeis-wiki\][\s\S]*?(?=\n\[|\s*$)/m.test(current)
    ? current.replace(/\[mcp_servers\.noeis-wiki\][\s\S]*?(?=\n\[|\s*$)/m, block.trimEnd())
    : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}`;
  fs.writeFileSync(filePath, `${next.trimEnd()}\n`, { mode: 0o600 });
};

const writeRuntimeMcpConfig = ({ runtime, token, apiUrl, env = process.env } = {}) => {
  const home = os.homedir();
  const server = mcpServerConfig({ token, apiUrl });
  if (runtime === 'codex') {
    const filePath = path.join(home, '.codex', 'config.toml');
    writeTomlMcpConfig(filePath, { token, apiUrl });
    return filePath;
  }

  const targets = {
    'claude-code': path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'claude-code', 'mcp.json'),
    hermes: path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'hermes', 'mcp.json'),
    openclaw: path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'openclaw', 'mcp.json'),
    opencode: path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode', 'opencode.json'),
    agent: path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'noeis', 'mcp.json')
  };
  const filePath = targets[runtime] || targets.agent;
  const config = safeReadJson(filePath);
  if (runtime === 'opencode') {
    config.mcp = { ...(config.mcp || {}), 'noeis-wiki': server };
  } else {
    config.servers = { ...(config.servers || {}), 'noeis-wiki': { transport: 'stdio', ...server } };
    config['noeis-wiki'] = config['noeis-wiki'] || server;
  }
  writeJsonFile(filePath, config);
  return filePath;
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

const sourceFromInput = (value, title = '') => {
  if (/^https?:\/\//i.test(value)) return { type: 'url', url: value, title: title || undefined };
  const absolute = path.resolve(value);
  const text = fs.readFileSync(absolute, 'utf8');
  return { type: 'text', text, title: title || path.basename(absolute) };
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
  const auth = resolveAuth(context);
  const positional = compactArgs(args);
  const runtime = normalizeRuntime(positional[0] || optionValue(args, '--runtime'));
  const appUrl = optionValue(args, '--app-url', auth.appUrl || DEFAULT_APP_URL);
  const apiUrl = optionValue(args, '--api-url', auth.apiUrl || DEFAULT_API_URL);
  const label = optionValue(args, '--label', `${runtimeLabel(runtime)} local`);
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
      scopes: ['read', 'agent-write']
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

  const configPath = writeConfig({ ...readConfig(context), token: approved.secret, apiUrl, appUrl }, context);
  let runtimeConfigPath = '';
  if (!hasFlag(args, '--no-config')) {
    runtimeConfigPath = writeRuntimeMcpConfig({ runtime, token: approved.secret, apiUrl, env: context.env || process.env });
  }

  try {
    const client = new NoeisCliClient({ token: approved.secret, apiUrl, fetchImpl, env: { ...(context.env || process.env), NOEIS_TOKEN: approved.secret, NOEIS_API_URL: apiUrl } });
    await client.listPages({ limit: 1 });
    io.stdout.write(`Connected ${runtimeLabel(runtime)} with read/write Noeis access.\n`);
  } catch (error) {
    io.stderr.write(`Connected, but the access check failed: ${error.message || error}\n`);
  }
  io.stdout.write(`Saved Noeis CLI config to ${configPath}\n`);
  if (runtimeConfigPath) io.stdout.write(`Updated ${runtimeLabel(runtime)} MCP config at ${runtimeConfigPath}\n`);
  if (hasFlag(args, '--print-token')) io.stdout.write(`${approved.secret}\n`);
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
  if (args.length === 0 || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    io.stdout.write(HELP);
    return;
  }

  const command = args[0];
  if (command === 'connect') {
    await runConnect(args.slice(1), { ...context, env, io });
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
    result = await client.ingestSource(sourceFromInput(positional[1], optionValue(args, '--title')));
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
