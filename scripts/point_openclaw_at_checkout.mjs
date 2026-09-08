#!/usr/bin/env node
/**
 * Point OpenClaw's MCP at this checkout instead of the published package.
 *
 * `noeis connect openclaw` writes a config that runs the globally installed
 * CLI, which carries whatever version of @noeis/wiki-mcp npm resolved for it.
 * That is the right thing once a release is out, and the wrong thing while the
 * tools you want to try are still only in a working tree.
 *
 * Only the command and its arguments change. `env` is left exactly as it was,
 * because it carries NOEIS_CONFIG_DIR — the path your token is read from — and
 * an agent pointed at the right server with the wrong token is a worse state
 * than the one you started in. Every file is copied to .bak first.
 *
 *   node scripts/point_openclaw_at_checkout.mjs "$(pwd)"
 *
 * To go back: restore the .bak files, or re-run `noeis connect openclaw`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const repo = process.argv[2];
if (!repo) { console.error('usage: node scripts/point_openclaw_at_checkout.mjs /absolute/path/to/note-taker-3'); process.exit(1); }
const bin = path.join(repo, 'packages/wiki-mcp/bin/noeis-wiki-mcp');
if (!fs.existsSync(bin)) { console.error('No MCP server at', bin); process.exit(1); }

const files = [
  { file: path.join(os.homedir(), '.openclaw/openclaw.json'), at: c => c.mcp?.servers },
  { file: path.join(os.homedir(), '.config/openclaw/mcp.json'), at: c => c.servers }
];

for (const { file, at } of files) {
  if (!fs.existsSync(file)) { console.log('skipped (not present):', file); continue; }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const servers = at(config);
  const server = servers?.['noeis-wiki'];
  if (!server) { console.log('skipped (no noeis-wiki entry):', file); continue; }
  fs.copyFileSync(file, `${file}.bak`);
  server.command = 'node';          // env is left alone: it carries your token config dir
  server.args = [bin];
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  console.log('pointed at the checkout:', file, '(backup at .bak)');
}
