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
